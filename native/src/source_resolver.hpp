#pragma once

#include <cstdint>
#include <string>

struct ResolvedSource {
  bool ok = false;
  bool requiresBrowserVerify = false;
  std::string finalUrl;
  std::string browserUrl;
  std::string provider;
  std::string contentType;
  int httpStatus = 0;
  uint64_t contentLength = 0;
  std::string error;
};

bool is_html_content_type(const std::string& contentType);

ResolvedSource resolve_download_source(
    const std::string& inputUrl,
    const std::string& expectedFormat);
