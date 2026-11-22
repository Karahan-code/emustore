#include "catalog_sync.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <cstdio>
#include <ctime>
#include <fstream>
#include <sstream>
#include <string_view>

#include "json_util.hpp"
#include "platform.hpp"
#include "source_resolver.hpp"

#ifdef EMUSTORE_USE_CURL
  #include <curl/curl.h>
#elif defined(_WIN32)
  #include <winhttp.h>
#endif

namespace fs = std::filesystem;

namespace {

constexpr std::array<const char*, 6> kAllowedCatalogPlatforms = {
  "ps1", "ps2", "ps3", "switch", "wii", "wiiu"
};

constexpr const char* kDefaultCatalogBaseUrl =
    "https://raw.githubusercontent.com/Karahan-code/emustore/master/data/catalog";

constexpr const char* kSyncUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EmuStore/0.1 Chrome/126.0.0.0 Safari/537.36";

constexpr size_t kMaxCatalogBytes = 16 * 1024 * 1024;

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

std::string iso8601_utc_now() {
  std::time_t now = std::time(nullptr);
  std::tm utc{};
#ifdef _WIN32
  gmtime_s(&utc, &now);
#else
  gmtime_r(&now, &utc);
#endif
  char buf[32]{};
  if (std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &utc) == 0) {
    return "1970-01-01T00:00:00Z";
  }
  return std::string(buf);
}

std::string read_env_utf8(const char* name) {
#ifdef _WIN32
  std::wstring wName = utf8_to_wide(name);
  DWORD len = GetEnvironmentVariableW(wName.c_str(), nullptr, 0);
  if (len == 0) return "";
  std::wstring wVal(len, L'\0');
  DWORD written = GetEnvironmentVariableW(wName.c_str(), wVal.data(), len);
  if (written == 0) return "";
  wVal.resize(written);
  return wide_to_utf8(wVal);
#else
  const char* val = std::getenv(name);
  return val ? std::string(val) : "";
#endif
}

fs::path resolve_default_cache_dir() {
#if defined(__PS5__) || defined(__PROSPERO__)
  return fs::path("/data/emustore/catalog");
#elif defined(_WIN32)
  std::string localApp = read_env_utf8("LOCALAPPDATA");
  if (!localApp.empty()) {
    return to_fs_path(localApp) / "EmuStore" / "catalog";
  }
  fs::path exeDir = get_executable_dir();
  if (!exeDir.empty()) {
    return exeDir / "catalog-cache";
  }
  return fs::path("catalog-cache");
#else
  std::string xdgCache = read_env_utf8("XDG_CACHE_HOME");
  if (!xdgCache.empty()) {
    return to_fs_path(xdgCache) / "emustore" / "catalog";
  }
  std::string home = read_env_utf8("HOME");
  if (!home.empty()) {
    return to_fs_path(home) / ".cache" / "emustore" / "catalog";
  }
  return fs::path("catalog-cache");
#endif
}

bool read_file_bytes(const fs::path& filePath, std::string& outBytes) {
  std::ifstream file(filePath, std::ios::binary);
  if (!file) return false;
  std::ostringstream ss;
  ss << file.rdbuf();
  outBytes = ss.str();
  return !file.bad();
}

bool write_file_atomic(const fs::path& destPath, const std::string& content) {
  std::error_code ec;
  fs::create_directories(destPath.parent_path(), ec);
  if (ec) return false;

  fs::path tmpPath = to_fs_path(from_fs_path(destPath) + ".tmp");
  {
    std::ofstream out(tmpPath, std::ios::binary | std::ios::trunc);
    if (!out) return false;
    if (!content.empty()) {
      out.write(content.data(), static_cast<std::streamsize>(content.size()));
    }
    out.flush();
    if (!out) {
      fs::remove(tmpPath, ec);
      return false;
    }
  }

#ifdef _WIN32
  if (!MoveFileExW(
          tmpPath.wstring().c_str(),
          destPath.wstring().c_str(),
          MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    fs::remove(tmpPath, ec);
    return false;
  }
  return true;
#else
  fs::rename(tmpPath, destPath, ec);
  if (ec) {
    fs::remove(tmpPath, ec);
    return false;
  }
  return true;
#endif
}

struct ParsedBaseUrl {
  bool valid = false;
  std::string normalized;
  std::string error;
};

ParsedBaseUrl validate_base_url(const std::string& rawInput) {
  ParsedBaseUrl out{};
  std::string trimmed = trim_ascii(rawInput);
  if (trimmed.empty()) {
    trimmed = kDefaultCatalogBaseUrl;
  }

  for (unsigned char ch : trimmed) {
    if (ch <= 0x20 || ch == 0x7f) {
      out.error = "Base URL contains invalid whitespace or control characters.";
      return out;
    }
  }
  if (trimmed.find('?') != std::string::npos || trimmed.find('#') != std::string::npos) {
    out.error = "Base URL must not include query parameters or fragments.";
    return out;
  }

  while (trimmed.size() > 1 && trimmed.back() == '/') {
    trimmed.pop_back();
  }

  size_t schemeEnd = trimmed.find("://");
  if (schemeEnd == std::string::npos) {
    out.error = "Base URL must start with https:// (or http://localhost / http://127.0.0.1).";
    return out;
  }

  std::string scheme = to_lower_ascii(trimmed.substr(0, schemeEnd));
  std::string rest = trimmed.substr(schemeEnd + 3);
  size_t slashPos = rest.find('/');
  std::string authority = slashPos == std::string::npos ? rest : rest.substr(0, slashPos);
  if (authority.empty() || authority.find('@') != std::string::npos) {
    out.error = "Base URL host is invalid or contains credentials.";
    return out;
  }

  std::string hostOnly = authority;
  size_t colonPos = hostOnly.find(':');
  if (colonPos != std::string::npos) {
    std::string portPart = hostOnly.substr(colonPos + 1);
    hostOnly = hostOnly.substr(0, colonPos);
    if (portPart.empty() || !std::all_of(portPart.begin(), portPart.end(), [](unsigned char c) { return std::isdigit(c); })) {
      out.error = "Base URL port is invalid.";
      return out;
    }
  }
  std::string hostLower = to_lower_ascii(hostOnly);

  if (scheme == "https") {
    if (hostLower.empty()) {
      out.error = "Base URL hostname is required.";
      return out;
    }
  } else if (scheme == "http") {
    if (hostLower != "127.0.0.1" && hostLower != "localhost") {
      out.error = "Plain HTTP baseUrl is only permitted for localhost or 127.0.0.1.";
      return out;
    }
  } else {
    out.error = "Base URL scheme must be https (or http for local testing).";
    return out;
  }

  out.valid = true;
  out.normalized = scheme + "://" + rest;
  return out;
}

struct JsonCatalogValidator {
  std::string_view src;
  size_t pos = 0;
  std::string error;

  void skip_ws() {
    while (pos < src.size()) {
      char c = src[pos];
      if (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
        ++pos;
      } else {
        break;
      }
    }
  }

  bool fail(const std::string& msg) {
    if (error.empty()) error = msg;
    return false;
  }

  bool parse_string(std::string* decodedOut = nullptr) {
    if (pos >= src.size() || src[pos] != '"') return fail("Expected string.");
    ++pos;
    if (decodedOut) decodedOut->clear();

    while (pos < src.size()) {
      unsigned char ch = static_cast<unsigned char>(src[pos++]);
      if (ch == '"') return true;
      if (ch < 0x20) return fail("Unescaped control character in JSON string.");
      if (ch == '\\') {
        if (pos >= src.size()) return fail("Unterminated string escape.");
        char esc = src[pos++];
        switch (esc) {
          case '"': case '\\': case '/':
            if (decodedOut) decodedOut->push_back(esc);
            break;
          case 'b': if (decodedOut) decodedOut->push_back('\b'); break;
          case 'f': if (decodedOut) decodedOut->push_back('\f'); break;
          case 'n': if (decodedOut) decodedOut->push_back('\n'); break;
          case 'r': if (decodedOut) decodedOut->push_back('\r'); break;
          case 't': if (decodedOut) decodedOut->push_back('\t'); break;
          case 'u': {
            if (pos + 4 > src.size()) return fail("Invalid \\u escape.");
            for (int i = 0; i < 4; ++i) {
              if (!std::isxdigit(static_cast<unsigned char>(src[pos + i]))) {
                return fail("Invalid hex in \\u escape.");
              }
            }
            if (decodedOut) decodedOut->push_back('?');
            pos += 4;
            break;
          }
          default:
            return fail("Invalid escape character in JSON string.");
        }
      } else if (decodedOut) {
        decodedOut->push_back(static_cast<char>(ch));
      }
    }
    return fail("Unterminated JSON string.");
  }

  bool parse_number() {
    size_t start = pos;
    if (pos < src.size() && src[pos] == '-') ++pos;
    if (pos >= src.size()) return fail("Invalid number.");
    if (src[pos] == '0') {
      ++pos;
    } else if (std::isdigit(static_cast<unsigned char>(src[pos]))) {
      while (pos < src.size() && std::isdigit(static_cast<unsigned char>(src[pos]))) ++pos;
    } else {
      return fail("Invalid number.");
    }
    if (pos < src.size() && src[pos] == '.') {
      ++pos;
      if (pos >= src.size() || !std::isdigit(static_cast<unsigned char>(src[pos]))) {
        return fail("Invalid fraction in number.");
      }
      while (pos < src.size() && std::isdigit(static_cast<unsigned char>(src[pos]))) ++pos;
    }
    if (pos < src.size() && (src[pos] == 'e' || src[pos] == 'E')) {
      ++pos;
      if (pos < src.size() && (src[pos] == '+' || src[pos] == '-')) ++pos;
      if (pos >= src.size() || !std::isdigit(static_cast<unsigned char>(src[pos]))) {
        return fail("Invalid exponent in number.");
      }
      while (pos < src.size() && std::isdigit(static_cast<unsigned char>(src[pos]))) ++pos;
    }
    return pos > start;
  }

  bool parse_literal(std::string_view lit) {
    if (src.substr(pos, lit.size()) == lit) {
      pos += lit.size();
      return true;
    }
    return fail("Invalid JSON literal.");
  }

  bool parse_value(int depth) {
    if (depth > 64) return fail("JSON nesting depth exceeded.");
    skip_ws();
    if (pos >= src.size()) return fail("Unexpected end of JSON.");

    char c = src[pos];
    if (c == '"') return parse_string();
    if (c == '{') return parse_object(depth + 1);
    if (c == '[') return parse_array(depth + 1);
    if (c == 't') return parse_literal("true");
    if (c == 'f') return parse_literal("false");
    if (c == 'n') return parse_literal("null");
    if (c == '-' || std::isdigit(static_cast<unsigned char>(c))) return parse_number();
    return fail("Unexpected token in JSON.");
  }

  bool parse_array(int depth) {
    if (depth > 64) return fail("JSON nesting depth exceeded.");
    ++pos;  // '['
    skip_ws();
    if (pos < src.size() && src[pos] == ']') {
      ++pos;
      return true;
    }
    for (;;) {
      if (!parse_value(depth)) return false;
      skip_ws();
      if (pos >= src.size()) return fail("Unterminated JSON array.");
      if (src[pos] == ']') {
        ++pos;
        return true;
      }
      if (src[pos] != ',') return fail("Expected ',' or ']' in array.");
      ++pos;
    }
  }

  bool parse_object(int depth) {
    if (depth > 64) return fail("JSON nesting depth exceeded.");
    ++pos;  // '{'
    skip_ws();
    if (pos < src.size() && src[pos] == '}') {
      ++pos;
      return true;
    }
    for (;;) {
      skip_ws();
      if (!parse_string()) return false;
      skip_ws();
      if (pos >= src.size() || src[pos] != ':') return fail("Expected ':' after object key.");
      ++pos;
      if (!parse_value(depth)) return false;
      skip_ws();
      if (pos >= src.size()) return fail("Unterminated JSON object.");
      if (src[pos] == '}') {
        ++pos;
        return true;
      }
      if (src[pos] != ',') return fail("Expected ',' or '}' in object.");
      ++pos;
    }
  }

  bool validate_catalog_array(const std::string& expectedPlatform) {
    skip_ws();
    if (pos >= src.size() || src[pos] != '[') {
      return fail("Catalog root must be a JSON array.");
    }
    ++pos;
    skip_ws();
    if (pos >= src.size() || src[pos] == ']') {
      return fail("Catalog array must contain at least one item.");
    }

    std::string key;
    std::string strVal;

    for (;;) {
      skip_ws();
      if (pos >= src.size() || src[pos] != '{') {
        return fail("Every catalog entry must be a JSON object.");
      }
      ++pos;
      skip_ws();
      if (pos < src.size() && src[pos] == '}') {
        return fail("Catalog entry cannot be empty.");
      }

      bool hasSlug = false;
      bool hasTitle = false;
      bool hasCatalogId = false;

      for (;;) {
        skip_ws();
        if (!parse_string(&key)) return false;
        skip_ws();
        if (pos >= src.size() || src[pos] != ':') return fail("Expected ':' in catalog item.");
        ++pos;
        skip_ws();

        if (key == "slug") {
          if (!parse_string(&strVal) || strVal.empty()) {
            return fail("Catalog item missing valid slug string.");
          }
          hasSlug = true;
        } else if (key == "catalogId") {
          if (!parse_string(&strVal) || strVal != expectedPlatform) {
            return fail("Catalog item catalogId does not match target platform.");
          }
          hasCatalogId = true;
        } else if (key == "title") {
          if (pos >= src.size() || src[pos] != '{') {
            return fail("Catalog item title must be a localized object.");
          }
          if (!parse_object(2)) return false;
          hasTitle = true;
        } else {
          if (!parse_value(2)) return false;
        }

        skip_ws();
        if (pos >= src.size()) return fail("Unterminated catalog item object.");
        if (src[pos] == '}') {
          ++pos;
          break;
        }
        if (src[pos] != ',') return fail("Expected ',' or '}' in catalog item.");
        ++pos;
      }

      if (!hasSlug || !hasTitle || !hasCatalogId) {
        return fail("Catalog item missing required slug, title, or catalogId fields.");
      }

      skip_ws();
      if (pos >= src.size()) return fail("Unterminated catalog root array.");
      if (src[pos] == ']') {
        ++pos;
        break;
      }
      if (src[pos] != ',') return fail("Expected ',' or ']' after catalog item.");
      ++pos;
    }

    skip_ws();
    if (pos != src.size()) {
      return fail("Unexpected trailing characters after JSON array.");
    }
    return true;
  }
};

struct HttpDownloadOutcome {
  bool ok = false;
  int httpStatus = 0;
  std::string contentType;
  std::string body;
  std::string error;
};

HttpDownloadOutcome fetch_catalog_json(const std::string& url) {
  HttpDownloadOutcome out{};

#ifdef EMUSTORE_USE_CURL
  CURL* curl = curl_easy_init();
  if (!curl) {
    out.error = "Failed to initialize libcurl.";
    return out;
  }

  struct WriteCtx {
    HttpDownloadOutcome* out;
    bool overflow = false;
  } ctx{ &out, false };

  auto headerCb = +[](char* buffer, size_t size, size_t nitems, void* userdata) -> size_t {
    size_t total = size * nitems;
    auto* c = static_cast<WriteCtx*>(userdata);
    std::string line(buffer, total);
    if (line.rfind("HTTP/", 0) == 0) {
      c->out->contentType.clear();
    } else {
      size_t colon = line.find(':');
      if (colon != std::string::npos) {
        std::string key = to_lower_ascii(trim_ascii(line.substr(0, colon)));
        if (key == "content-type") {
          c->out->contentType = trim_ascii(line.substr(colon + 1));
        }
      }
    }
    return total;
  };

  auto writeCb = +[](char* ptr, size_t size, size_t nmemb, void* userdata) -> size_t {
    auto* c = static_cast<WriteCtx*>(userdata);
    size_t bytes = size * nmemb;
    if (c->out->body.size() + bytes > kMaxCatalogBytes) {
      c->overflow = true;
      return 0;
    }
    c->out->body.append(ptr, bytes);
    return bytes;
  };

  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  curl_easy_setopt(curl, CURLOPT_MAXREDIRS, 5L);
  curl_easy_setopt(curl, CURLOPT_USERAGENT, kSyncUserAgent);
  curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 15L);
  curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, headerCb);
  curl_easy_setopt(curl, CURLOPT_HEADERDATA, &ctx);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCb);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &ctx);

  CURLcode res = curl_easy_perform(curl);
  long code = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
  curl_easy_cleanup(curl);

  out.httpStatus = static_cast<int>(code);
  if (ctx.overflow) {
    out.error = "Remote catalog exceeds 16 MB limit.";
    return out;
  }
  if (res != CURLE_OK) {
    out.error = curl_easy_strerror(res);
    return out;
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
    out.error = "Invalid catalog URL.";
    return out;
  }

  HINTERNET hSession = WinHttpOpen(utf8_to_wide(kSyncUserAgent).c_str(), WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, nullptr, nullptr, 0);
  HINTERNET hConnect = hSession ? WinHttpConnect(hSession, hostBuf, uc.nPort, 0) : nullptr;
  DWORD flags = uc.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
  HINTERNET hRequest = hConnect ? WinHttpOpenRequest(hConnect, L"GET", pathBuf, nullptr, nullptr, nullptr, flags) : nullptr;

  if (hRequest) {
    DWORD redirectPolicy = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
    WinHttpSetOption(hRequest, WINHTTP_OPTION_REDIRECT_POLICY, &redirectPolicy, sizeof(redirectPolicy));
    WinHttpSetTimeouts(hRequest, 10000, 10000, 15000, 15000);
  }

  if (!hRequest || !WinHttpSendRequest(hRequest, nullptr, 0, nullptr, 0, 0, 0) || !WinHttpReceiveResponse(hRequest, nullptr)) {
    out.error = "Failed fetching remote catalog via WinHTTP.";
  } else {
    DWORD statusCode = 0;
    DWORD statusSize = sizeof(statusCode);
    WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &statusCode, &statusSize, nullptr);
    out.httpStatus = static_cast<int>(statusCode);

    wchar_t ctBuf[256]{};
    DWORD ctSize = sizeof(ctBuf);
    if (WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_CONTENT_TYPE, nullptr, ctBuf, &ctSize, nullptr)) {
      out.contentType = wide_to_utf8(ctBuf);
    }

    char buf[16384];
    DWORD avail = 0;
    while (WinHttpQueryDataAvailable(hRequest, &avail) && avail > 0) {
      DWORD toRead = static_cast<DWORD>(std::min<size_t>(avail, sizeof(buf)));
      DWORD got = 0;
      if (!WinHttpReadData(hRequest, buf, toRead, &got) || got == 0) break;
      if (out.body.size() + got > kMaxCatalogBytes) {
        out.error = "Remote catalog exceeds 16 MB limit.";
        break;
      }
      out.body.append(buf, got);
    }
  }

  if (hRequest) WinHttpCloseHandle(hRequest);
  if (hConnect) WinHttpCloseHandle(hConnect);
  if (hSession) WinHttpCloseHandle(hSession);
  if (!out.error.empty()) return out;
#else
  out.error = "Catalog HTTP sync requires libcurl or WinHTTP.";
  return out;
#endif

  if (out.httpStatus != 200) {
    out.error = "HTTP " + std::to_string(out.httpStatus);
    return out;
  }
  if (is_html_content_type(out.contentType)) {
    out.error = "Server returned HTML instead of catalog JSON.";
    return out;
  }
  std::string_view view(out.body);
  size_t nonWs = view.find_first_not_of(" \t\r\n");
  if (nonWs == std::string_view::npos) {
    out.error = "Remote catalog body is empty.";
    return out;
  }
  if (view[nonWs] == '<') {
    out.error = "Server returned markup instead of catalog JSON.";
    return out;
  }

  out.ok = true;
  return out;
}

}  // namespace

CatalogSyncService::CatalogSyncService(const std::string& cacheDirOverride) {
  cacheDir_ = cacheDirOverride.empty() ? resolve_default_cache_dir() : to_fs_path(cacheDirOverride);
  std::lock_guard<std::mutex> lock(mutex_);
  load_sync_meta_locked();
}

bool CatalogSyncService::is_valid_platform(const std::string& platform) const {
  for (const char* allowed : kAllowedCatalogPlatforms) {
    if (platform == allowed) return true;
  }
  return false;
}

std::string CatalogSyncService::cache_dir() const {
  return from_fs_path(cacheDir_);
}

void CatalogSyncService::load_sync_meta_locked() {
  lastSyncedAt_.clear();
  platformUpdatedAt_.clear();

  std::string rawMeta;
  if (!read_file_bytes(cacheDir_ / "sync-meta.json", rawMeta)) {
    return;
  }
  if (auto last = json_get_string(rawMeta, "lastSyncedAt")) {
    lastSyncedAt_ = *last;
  }
  for (const char* platform : kAllowedCatalogPlatforms) {
    if (auto ts = json_get_string(rawMeta, platform)) {
      platformUpdatedAt_[platform] = *ts;
    }
  }
}

void CatalogSyncService::save_sync_meta_locked() const {
  std::string json = "{";
  json += "\"lastSyncedAt\":" + (lastSyncedAt_.empty() ? std::string("null") : json_string(lastSyncedAt_)) + ",";
  json += "\"platforms\":{";
  for (size_t i = 0; i < kAllowedCatalogPlatforms.size(); ++i) {
    const char* platform = kAllowedCatalogPlatforms[i];
    if (i > 0) json.push_back(',');
    auto it = platformUpdatedAt_.find(platform);
    std::string val = (it != platformUpdatedAt_.end() && !it->second.empty())
        ? json_string(it->second)
        : "null";
    json += json_string(platform) + ":" + val;
  }
  json += "}}";
  write_file_atomic(cacheDir_ / "sync-meta.json", json);
}

std::string CatalogSyncService::get_status_json() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::error_code ec;

  std::string json = "{";
  json += "\"ok\":true,";
  json += "\"cacheDir\":" + json_string(from_fs_path(cacheDir_)) + ",";
  json += "\"lastSyncedAt\":" + (lastSyncedAt_.empty() ? std::string("null") : json_string(lastSyncedAt_)) + ",";
  json += "\"platforms\":{";

  for (size_t i = 0; i < kAllowedCatalogPlatforms.size(); ++i) {
    const char* platform = kAllowedCatalogPlatforms[i];
    if (i > 0) json.push_back(',');

    fs::path filePath = cacheDir_ / (std::string(platform) + ".json");
    bool cached = fs::is_regular_file(filePath, ec);
    uint64_t bytes = 0;
    if (cached) {
      uintmax_t sz = fs::file_size(filePath, ec);
      if (!ec) bytes = static_cast<uint64_t>(sz);
    }

    std::string updatedAt;
    auto it = platformUpdatedAt_.find(platform);
    if (cached && it != platformUpdatedAt_.end()) {
      updatedAt = it->second;
    }

    json += json_string(platform) + ":{";
    json += "\"cached\":" + std::string(cached ? "true" : "false") + ",";
    json += "\"updatedAt\":" + (updatedAt.empty() ? std::string("null") : json_string(updatedAt)) + ",";
    json += "\"bytes\":" + std::to_string(bytes);
    json.push_back('}');
  }

  json += "}}";
  return json;
}

std::optional<std::string> CatalogSyncService::read_cached_catalog(const std::string& platform) {
  if (!is_valid_platform(platform)) return std::nullopt;
  std::lock_guard<std::mutex> lock(mutex_);
  std::string content;
  if (!read_file_bytes(cacheDir_ / (platform + ".json"), content)) {
    return std::nullopt;
  }
  return content;
}

CatalogSyncResponse CatalogSyncService::sync(
    const std::string& requestedBaseUrl,
    const std::vector<std::string>& requestedPlatforms) {
  ParsedBaseUrl parsedUrl = validate_base_url(requestedBaseUrl);
  if (!parsedUrl.valid) {
    return { 400, "{\"ok\":false,\"error\":" + json_string(parsedUrl.error) + "}" };
  }

  std::vector<std::string> targets;
  if (requestedPlatforms.empty()) {
    for (const char* platform : kAllowedCatalogPlatforms) {
      targets.emplace_back(platform);
    }
  } else {
    for (const std::string& platform : requestedPlatforms) {
      if (!is_valid_platform(platform)) {
        return {
          400,
          "{\"ok\":false,\"error\":" + json_string("Unsupported platform catalog: " + platform) + "}"
        };
      }
      if (std::find(targets.begin(), targets.end(), platform) == targets.end()) {
        targets.push_back(platform);
      }
    }
  }

  std::map<std::string, CatalogPlatformSyncResult> results;
  int updatedCount = 0;
  int skippedCount = 0;
  int errorCount = 0;

  for (const std::string& platform : targets) {
    CatalogPlatformSyncResult entry{};
    std::string sourceUrl = parsedUrl.normalized + "/" + platform + ".json";
    HttpDownloadOutcome dl = fetch_catalog_json(sourceUrl);
    if (!dl.ok) {
      entry.error = dl.error.empty() ? "Download failed." : dl.error;
      errorCount += 1;
      results[platform] = entry;
      continue;
    }

    JsonCatalogValidator validator{ dl.body };
    if (!validator.validate_catalog_array(platform)) {
      entry.error = validator.error.empty() ? "Invalid catalog JSON payload." : validator.error;
      errorCount += 1;
      results[platform] = entry;
      continue;
    }

    entry.bytes = static_cast<uint64_t>(dl.body.size());

    std::lock_guard<std::mutex> lock(mutex_);
    fs::path destPath = cacheDir_ / (platform + ".json");
    std::string existingBytes;
    if (read_file_bytes(destPath, existingBytes) && existingBytes == dl.body) {
      entry.skipped = true;
      skippedCount += 1;
      results[platform] = entry;
      continue;
    }

    if (!write_file_atomic(destPath, dl.body)) {
      entry.error = "Failed writing cached catalog to disk.";
      errorCount += 1;
      results[platform] = entry;
      continue;
    }

    entry.updated = true;
    updatedCount += 1;
    platformUpdatedAt_[platform] = iso8601_utc_now();
    results[platform] = entry;
  }

  std::string syncedAt = iso8601_utc_now();
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (errorCount < static_cast<int>(targets.size())) {
      lastSyncedAt_ = syncedAt;
      save_sync_meta_locked();
    }
  }

  std::string json = "{";
  json += "\"ok\":" + std::string(errorCount == 0 ? "true" : "false") + ",";
  json += "\"baseUrl\":" + json_string(parsedUrl.normalized) + ",";
  json += "\"syncedAt\":" + json_string(syncedAt) + ",";
  json += "\"updatedCount\":" + std::to_string(updatedCount) + ",";
  json += "\"skippedCount\":" + std::to_string(skippedCount) + ",";
  json += "\"errorCount\":" + std::to_string(errorCount) + ",";
  json += "\"platforms\":{";

  for (size_t i = 0; i < targets.size(); ++i) {
    const std::string& platform = targets[i];
    const CatalogPlatformSyncResult& entry = results[platform];
    if (i > 0) json.push_back(',');
    json += json_string(platform) + ":{";
    json += "\"updated\":" + std::string(entry.updated ? "true" : "false") + ",";
    json += "\"skipped\":" + std::string(entry.skipped ? "true" : "false") + ",";
    json += "\"bytes\":" + std::to_string(entry.bytes) + ",";
    json += "\"error\":" + (entry.error.empty() ? std::string("null") : json_string(entry.error));
    json.push_back('}');
  }

  json += "}}";
  return { 200, json };
}

int CatalogSyncService::clear_cache() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::error_code ec;
  int removed = 0;

  for (const char* platform : kAllowedCatalogPlatforms) {
    fs::path filePath = cacheDir_ / (std::string(platform) + ".json");
    if (fs::remove(filePath, ec)) {
      removed += 1;
    }
    fs::path tmpPath = to_fs_path(from_fs_path(filePath) + ".tmp");
    fs::remove(tmpPath, ec);
  }
  fs::remove(cacheDir_ / "sync-meta.json", ec);

  lastSyncedAt_.clear();
  platformUpdatedAt_.clear();
  return removed;
}
