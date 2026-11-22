#include "source_resolver.hpp"

#include <algorithm>
#include <cctype>
#include <regex>
#include <string>

#include "platform.hpp"

#ifdef EMUSTORE_USE_CURL
  #include <curl/curl.h>
#elif defined(_WIN32)
  #include <winhttp.h>
#endif

namespace {

constexpr const char* kStandardUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EmuStore/0.1 Chrome/126.0.0.0 Safari/537.36";

std::string to_lower_ascii(std::string value) {
  for (char& ch : value) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return value;
}

std::string trim_ascii(const std::string& value) {
  size_t first = value.find_first_not_of(" \t\r\n");
  if (first == std::string::npos) return "";
  size_t last = value.find_last_not_of(" \t\r\n");
  return value.substr(first, last - first + 1);
}

struct ParsedUrl {
  std::string scheme;
  std::string host;
  std::string path;
  bool valid = false;
};

ParsedUrl parse_url(const std::string& url) {
  ParsedUrl out{};
  size_t schemeEnd = url.find("://");
  if (schemeEnd == std::string::npos) return out;
  out.scheme = to_lower_ascii(url.substr(0, schemeEnd));
  if (out.scheme != "http" && out.scheme != "https") return out;

  size_t hostStart = schemeEnd + 3;
  size_t pathStart = url.find('/', hostStart);
  std::string hostPort = pathStart == std::string::npos
      ? url.substr(hostStart)
      : url.substr(hostStart, pathStart - hostStart);
  size_t colon = hostPort.find(':');
  out.host = to_lower_ascii(colon == std::string::npos ? hostPort : hostPort.substr(0, colon));
  out.path = pathStart == std::string::npos ? "/" : url.substr(pathStart);
  out.valid = !out.host.empty();
  return out;
}

uint64_t parse_total_from_content_range(const std::string& headerVal) {
  size_t slash = headerVal.find('/');
  if (slash == std::string::npos) return 0;
  std::string tail = trim_ascii(headerVal.substr(slash + 1));
  if (tail.empty() || tail == "*") return 0;
  try {
    return std::stoull(tail);
  } catch (...) {
    return 0;
  }
}

std::string format_http_error(int status) {
  if (status == 401) return "HTTP 401: Source requires login.";
  if (status == 403) return "HTTP 403: Access forbidden by host.";
  if (status == 404) return "HTTP 404: File not found.";
  return "HTTP " + std::to_string(status) + ": Remote host rejected request.";
}

struct ProbeOutcome {
  bool transportOk = false;
  int httpStatus = 0;
  std::string effectiveUrl;
  std::string contentType;
  uint64_t contentLength = 0;
  std::string bodySnippet;
  std::string transportError;
};

ProbeOutcome probe_url(const std::string& url, bool useGetSnippet, size_t maxSnippetBytes) {
  ProbeOutcome out{};
  out.effectiveUrl = url;

#ifdef EMUSTORE_USE_CURL
  struct ProbeCtx {
    ProbeOutcome* outcome;
    bool captureBody;
    size_t maxBytes;
    bool rangeRequest;
  };

  ProbeCtx ctx{ &out, useGetSnippet, maxSnippetBytes, useGetSnippet && maxSnippetBytes == 0 };

  CURL* curl = curl_easy_init();
  if (!curl) {
    out.transportError = "Failed to initialize libcurl.";
    return out;
  }

  auto headerCb = +[](char* buffer, size_t size, size_t nitems, void* userdata) -> size_t {
    size_t total = size * nitems;
    auto* c = static_cast<ProbeCtx*>(userdata);
    std::string line(buffer, total);
    if (line.rfind("HTTP/", 0) == 0) {
      c->outcome->contentType.clear();
      c->outcome->contentLength = 0;
    } else {
      size_t colon = line.find(':');
      if (colon != std::string::npos) {
        std::string key = to_lower_ascii(trim_ascii(line.substr(0, colon)));
        std::string val = trim_ascii(line.substr(colon + 1));
        if (key == "content-type") {
          c->outcome->contentType = val;
        } else if (key == "content-length" && !c->rangeRequest) {
          try {
            c->outcome->contentLength = std::stoull(val);
          } catch (...) {}
        } else if (key == "content-range") {
          uint64_t totalLen = parse_total_from_content_range(val);
          if (totalLen > 0) c->outcome->contentLength = totalLen;
        }
      }
    }
    return total;
  };

  auto writeCb = +[](char* ptr, size_t size, size_t nmemb, void* userdata) -> size_t {
    auto* c = static_cast<ProbeCtx*>(userdata);
    size_t bytes = size * nmemb;
    if (!c->captureBody) {
      return bytes;
    }
    if (!is_html_content_type(c->outcome->contentType) && !c->outcome->contentType.empty()) {
      return 0;
    }
    if (c->outcome->bodySnippet.size() >= c->maxBytes) {
      return 0;
    }
    size_t keep = std::min(bytes, c->maxBytes - c->outcome->bodySnippet.size());
    c->outcome->bodySnippet.append(ptr, keep);
    return keep < bytes ? 0 : bytes;
  };

  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl, CURLOPT_MAXREDIRS, 10L);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, kStandardUserAgent);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 12L);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
  curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, headerCb);
  curl_easy_setopt(curl, CURLOPT_HEADERDATA, &ctx);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCb);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &ctx);

  if (!useGetSnippet) {
    curl_easy_setopt(curl, CURLOPT_NOBODY, 1L);
  } else if (maxSnippetBytes == 0) {
    curl_easy_setopt(curl, CURLOPT_RANGE, "0-0");
  }

  CURLcode res = curl_easy_perform(curl);
  long code = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
  char* eff = nullptr;
  curl_easy_getinfo(curl, CURLINFO_EFFECTIVE_URL, &eff);
  if (eff && *eff) out.effectiveUrl = eff;

  curl_easy_cleanup(curl);

  if (res == CURLE_OK || (res == CURLE_WRITE_ERROR && code > 0)) {
    out.transportOk = true;
    out.httpStatus = static_cast<int>(code);
  } else {
    out.transportError = curl_easy_strerror(res);
  }
#elif defined(_WIN32)
  URL_COMPONENTSW uc{};
  uc.dwStructSize = sizeof(uc);
  std::wstring wUrl = utf8_to_wide(url);
  wchar_t hostBuf[256]{};
  wchar_t pathBuf[2048]{};
  uc.lpszHostName = hostBuf;
  uc.dwHostNameLength = 256;
  uc.lpszUrlPath = pathBuf;
  uc.dwUrlPathLength = 2048;

  if (!WinHttpCrackUrl(wUrl.c_str(), 0, 0, &uc)) {
    out.transportError = "Invalid HTTP/HTTPS URL.";
    return out;
  }

  HINTERNET hSession = WinHttpOpen(utf8_to_wide(kStandardUserAgent).c_str(), WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, nullptr, nullptr, 0);
  HINTERNET hConnect = hSession ? WinHttpConnect(hSession, hostBuf, uc.nPort, 0) : nullptr;
  DWORD flags = uc.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
  const wchar_t* verb = useGetSnippet ? L"GET" : L"HEAD";
  HINTERNET hRequest = hConnect ? WinHttpOpenRequest(hConnect, verb, pathBuf, nullptr, nullptr, nullptr, flags) : nullptr;

  if (hRequest) {
    DWORD redirectPolicy = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
    WinHttpSetOption(hRequest, WINHTTP_OPTION_REDIRECT_POLICY, &redirectPolicy, sizeof(redirectPolicy));
    if (useGetSnippet && maxSnippetBytes == 0) {
      WinHttpAddRequestHeaders(hRequest, L"Range: bytes=0-0", static_cast<DWORD>(-1), WINHTTP_ADDREQ_FLAG_ADD);
    }
  }

  if (!hRequest || !WinHttpSendRequest(hRequest, nullptr, 0, nullptr, 0, 0, 0) || !WinHttpReceiveResponse(hRequest, nullptr)) {
    out.transportError = "HTTP probe failed.";
  } else {
    DWORD statusCode = 0;
    DWORD statusSize = sizeof(statusCode);
    WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &statusCode, &statusSize, nullptr);
    out.httpStatus = static_cast<int>(statusCode);
    out.transportOk = true;

    wchar_t ctBuf[256]{};
    DWORD ctSize = sizeof(ctBuf);
    if (WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_CONTENT_TYPE, nullptr, ctBuf, &ctSize, nullptr)) {
      out.contentType = wide_to_utf8(ctBuf);
    }

    wchar_t crBuf[128]{};
    DWORD crSize = sizeof(crBuf);
    if (WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_CONTENT_RANGE, nullptr, crBuf, &crSize, nullptr)) {
      out.contentLength = parse_total_from_content_range(wide_to_utf8(crBuf));
    } else if (!useGetSnippet || maxSnippetBytes > 0) {
      wchar_t clBuf[64]{};
      DWORD clSize = sizeof(clBuf);
      if (WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_CONTENT_LENGTH, nullptr, clBuf, &clSize, nullptr)) {
        try {
          out.contentLength = std::stoull(wide_to_utf8(clBuf));
        } catch (...) {}
      }
    }

    if (useGetSnippet && maxSnippetBytes > 0 && is_html_content_type(out.contentType)) {
      char buf[4096];
      while (out.bodySnippet.size() < maxSnippetBytes) {
        DWORD avail = 0;
        if (!WinHttpQueryDataAvailable(hRequest, &avail) || avail == 0) break;
        DWORD toRead = static_cast<DWORD>(std::min<size_t>(avail, std::min(sizeof(buf), maxSnippetBytes - out.bodySnippet.size())));
        DWORD got = 0;
        if (!WinHttpReadData(hRequest, buf, toRead, &got) || got == 0) break;
        out.bodySnippet.append(buf, got);
      }
    }
  }

  if (hRequest) WinHttpCloseHandle(hRequest);
  if (hConnect) WinHttpCloseHandle(hConnect);
  if (hSession) WinHttpCloseHandle(hSession);
#else
  out.transportError = "HTTP probe requires libcurl or WinHTTP.";
#endif

  return out;
}

ProbeOutcome probe_binary_source(const std::string& url) {
  ProbeOutcome head = probe_url(url, false, 0);
  if (head.transportOk && (head.httpStatus == 405 || head.httpStatus == 501)) {
    return probe_url(url, true, 0);
  }
  return head;
}

std::string extract_vikingfile_direct_candidate(const std::string& html, const std::string& expectedFormat) {
  static const std::regex urlRegex(R"((https://[^\s"'<>\\]+))", std::regex::icase);
  std::string lowerExt = to_lower_ascii(expectedFormat);

  auto begin = std::sregex_iterator(html.begin(), html.end(), urlRegex);
  auto end = std::sregex_iterator();
  for (auto it = begin; it != end; ++it) {
    std::string candidate = (*it)[1].str();
    std::string lower = to_lower_ascii(candidate);
    if (lower.find(".css") != std::string::npos || lower.find(".js") != std::string::npos ||
        lower.find(".png") != std::string::npos || lower.find(".svg") != std::string::npos ||
        lower.find(".ico") != std::string::npos || lower.find("cloudflare") != std::string::npos ||
        lower.find("recaptcha") != std::string::npos || lower.find("turnstile") != std::string::npos) {
      continue;
    }
    if ((!lowerExt.empty() && lower.find(lowerExt) != std::string::npos) ||
        lower.find("/download/") != std::string::npos ||
        lower.find("/api/download") != std::string::npos) {
      return candidate;
    }
  }
  return "";
}

}  // namespace

bool is_html_content_type(const std::string& contentType) {
  size_t semi = contentType.find(';');
  std::string mime = to_lower_ascii(trim_ascii(semi == std::string::npos ? contentType : contentType.substr(0, semi)));
  return mime == "text/html" || mime == "application/xhtml+xml";
}

ResolvedSource resolve_download_source(
    const std::string& inputUrl,
    const std::string& expectedFormat) {
  ResolvedSource result{};
  result.finalUrl = inputUrl;

  ParsedUrl parsed = parse_url(inputUrl);
  if (!parsed.valid) {
    result.error = "Invalid HTTP/HTTPS download URL.";
    return result;
  }

  result.provider = parsed.host;
  if (result.provider.rfind("www.", 0) == 0) {
    result.provider = result.provider.substr(4);
  }

  // Pixeldrain share URL -> direct file endpoint
  if (result.provider == "pixeldrain.com") {
    static const std::regex shareRegex(R"(^/u/([A-Za-z0-9_-]+)(?:[/?].*)?$)");
    std::smatch match;
    if (std::regex_match(parsed.path, match, shareRegex)) {
      result.browserUrl = inputUrl;
      result.finalUrl = "https://pixeldrain.com/api/file/" + match[1].str() + "?download";
    }
  }

  // Vikingfile / mirror hosters
  if (result.provider == "vikingfile.com" || result.provider == "vik1ngfile.site") {
    static const std::regex vikingRegex(R"(^/f/([A-Za-z0-9_-]+)(?:[/?].*)?$)");
    std::smatch match;
    if (std::regex_match(parsed.path, match, vikingRegex)) {
      result.browserUrl = inputUrl;
      ProbeOutcome pageProbe = probe_url(inputUrl, true, 256 * 1024);
      if (pageProbe.transportOk && pageProbe.httpStatus >= 200 && pageProbe.httpStatus < 300 &&
          !is_html_content_type(pageProbe.contentType)) {
        result.ok = true;
        result.finalUrl = pageProbe.effectiveUrl;
        result.httpStatus = pageProbe.httpStatus;
        result.contentType = pageProbe.contentType;
        result.contentLength = pageProbe.contentLength;
        return result;
      }

      if (!pageProbe.bodySnippet.empty()) {
        std::string candidate = extract_vikingfile_direct_candidate(pageProbe.bodySnippet, expectedFormat);
        if (!candidate.empty()) {
          ProbeOutcome directProbe = probe_binary_source(candidate);
          if (directProbe.transportOk && directProbe.httpStatus >= 200 && directProbe.httpStatus < 300 &&
              !is_html_content_type(directProbe.contentType)) {
            result.ok = true;
            result.finalUrl = directProbe.effectiveUrl;
            result.httpStatus = directProbe.httpStatus;
            result.contentType = directProbe.contentType;
            result.contentLength = directProbe.contentLength;
            return result;
          }
        }
      }

      result.ok = false;
      result.requiresBrowserVerify = true;
      result.httpStatus = pageProbe.httpStatus;
      result.contentType = pageProbe.contentType;
      result.error = "requires_browser_verify: Source requires browser verification.";
      return result;
    }
  }

  ProbeOutcome probe = probe_binary_source(result.finalUrl);
  if (!probe.transportOk) {
    result.error = probe.transportError.empty() ? "Failed contacting download host." : probe.transportError;
    return result;
  }

  result.httpStatus = probe.httpStatus;
  result.contentType = probe.contentType;
  result.contentLength = probe.contentLength;
  if (!probe.effectiveUrl.empty()) {
    result.finalUrl = probe.effectiveUrl;
  }

  if (probe.httpStatus < 200 || probe.httpStatus >= 300) {
    result.error = format_http_error(probe.httpStatus);
    return result;
  }

  if (is_html_content_type(probe.contentType)) {
    result.error = "Server returned HTML page instead of file.";
    return result;
  }

  result.ok = true;
  return result;
}
