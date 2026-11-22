#pragma once

#include <atomic>
#include <functional>
#include <string>

struct ExtractOptions {
  bool deleteArchive = true;
  bool flattenSingleRoot = true;
};

struct ExtractResult {
  bool ok = false;
  std::string targetDir;
  std::string error;
  size_t filesExtracted = 0;
};

ExtractResult extract_zip_archive(
    const std::string& archivePathUtf8,
    const std::string& targetDirUtf8,
    const ExtractOptions& options,
    const std::function<void(int)>& onProgress,
    const std::atomic<bool>& cancelFlag);
