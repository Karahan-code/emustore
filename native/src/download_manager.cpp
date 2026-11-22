#include "download_manager.hpp"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <vector>

#include "json_util.hpp"
#include "platform.hpp"
#include "zip_extractor.hpp"

#ifdef EMUSTORE_USE_CURL
  #include <curl/curl.h>
#elif defined(_WIN32)
  #include <winhttp.h>
#endif

namespace fs = std::filesystem;

namespace {

bool is_archive_ext(const std::string& format) {
  std::string lower;
  for (char ch : format) {
    lower.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(ch))));
  }
  return lower == ".zip" || lower == ".7z";
}

std::string sanitize_filename(const std::string& raw) {
  std::string out;
  for (unsigned char ch : raw) {
    if (std::isalnum(ch) || ch == '-' || ch == '_' || ch == '.') {
      out.push_back(static_cast<char>(ch));
    } else if (ch == ' ') {
      out.push_back('_');
    }
  }
  while (!out.empty() && out.front() == '.') out.erase(out.begin());
  return out.empty() ? "download.bin" : out;
}

std::string resolve_target_filename(const DownloadRequest& request) {
  std::string base = sanitize_filename(request.slug);
  std::string ext = request.format;
  if (!ext.empty() && ext.front() != '.') ext = "." + ext;
  for (char& ch : ext) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  if (ext.empty()) ext = ".bin";
  if (base.size() >= ext.size() && base.compare(base.size() - ext.size(), ext.size(), ext) == 0) {
    return base;
  }
  return base + ext;
}

}  // namespace

DownloadManager::~DownloadManager() {
  shutdown();
}

void DownloadManager::shutdown() {
  std::vector<std::thread> toJoin;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    shuttingDown_ = true;
    for (const auto& task : tasks_) {
      task->cancelRequested.store(true);
    }
    toJoin.swap(workers_);
  }

  for (auto& worker : toJoin) {
    if (worker.joinable()) worker.join();
  }
}

DownloadRecordSnapshot DownloadManager::start_download(const DownloadRequest& request) {
  auto task = std::make_shared<ManagedDownload>();
  {
    std::lock_guard<std::mutex> lock(mutex_);
    task->snapshot.id = "dl-" + std::to_string(nextId_++);
    task->snapshot.catalogId = request.catalogId;
    task->snapshot.slug = request.slug;
    task->snapshot.title = request.title.empty() ? request.slug : request.title;
    task->snapshot.url = request.url;
    task->snapshot.format = request.format.empty() ? ".bin" : request.format;
    task->snapshot.targetDir = request.targetDir;
    task->snapshot.totalBytes = request.expectedBytes > 0 ? static_cast<uint64_t>(request.expectedBytes) : 0;
    task->snapshot.status = "queued";

    fs::path targetDirPath = to_fs_path(request.targetDir);
    fs::path tmpDir = targetDirPath / ".tmp";
    std::string filename = resolve_target_filename(request);
    task->partPath = from_fs_path(tmpDir / (filename + ".part"));
    task->finalPath = from_fs_path(targetDirPath / filename);

    tasks_.push_back(task);
    if (!shuttingDown_) {
      workers_.emplace_back(&DownloadManager::run_download_worker, this, task);
    }
  }
  return task->snapshot;
}

std::optional<DownloadRecordSnapshot> DownloadManager::pause_download(const std::string& id) {
  std::lock_guard<std::mutex> lock(mutex_);
  for (const auto& task : tasks_) {
    if (task->snapshot.id == id) {
      if (task->snapshot.status == "downloading" || task->snapshot.status == "queued") {
        task->pauseRequested.store(true);
        task->snapshot.status = "paused";
        task->snapshot.speedBps = 0;
      }
      return task->snapshot;
    }
  }
  return std::nullopt;
}

std::optional<DownloadRecordSnapshot> DownloadManager::resume_download(const std::string& id) {
  std::lock_guard<std::mutex> lock(mutex_);
  for (const auto& task : tasks_) {
    if (task->snapshot.id == id) {
      if (task->snapshot.status == "paused" || task->snapshot.status == "error") {
        task->pauseRequested.store(false);
        task->cancelRequested.store(false);
        task->snapshot.error.clear();
        task->snapshot.status = "queued";
        if (!shuttingDown_) {
          workers_.emplace_back(&DownloadManager::run_download_worker, this, task);
        }
      }
      return task->snapshot;
    }
  }
  return std::nullopt;
}

std::optional<DownloadRecordSnapshot> DownloadManager::install_archive(
    const std::string& id,
    const InstallArchiveRequest& options) {
  std::lock_guard<std::mutex> lock(mutex_);
  for (const auto& task : tasks_) {
    if (task->snapshot.id == id) {
      if (task->snapshot.status != "ready_to_install" && task->snapshot.status != "error") {
        return task->snapshot;
      }
      task->cancelRequested.store(false);
      task->snapshot.error.clear();
      task->snapshot.status = "extracting";
      task->snapshot.progress = 0;
      if (!options.targetDir.empty()) {
        task->snapshot.targetDir = options.targetDir;
      }
      if (!shuttingDown_) {
        workers_.emplace_back(&DownloadManager::run_extract_worker, this, task, options);
      }
      return task->snapshot;
    }
  }
  return std::nullopt;
}

bool DownloadManager::cancel_download(const std::string& id) {
  std::lock_guard<std::mutex> lock(mutex_);
  for (auto it = tasks_.begin(); it != tasks_.end(); ++it) {
    if ((*it)->snapshot.id == id) {
      (*it)->cancelRequested.store(true);
      std::error_code ec;
      fs::remove(to_fs_path((*it)->partPath), ec);
      tasks_.erase(it);
      return true;
    }
  }
  return false;
}

std::vector<DownloadRecordSnapshot> DownloadManager::list_downloads() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<DownloadRecordSnapshot> out;
  out.reserve(tasks_.size());
  for (const auto& task : tasks_) {
    out.push_back(task->snapshot);
  }
  return out;
}

std::optional<DownloadRecordSnapshot> DownloadManager::get_download(const std::string& id) {
  std::lock_guard<std::mutex> lock(mutex_);
  for (const auto& task : tasks_) {
    if (task->snapshot.id == id) return task->snapshot;
  }
  return std::nullopt;
}

void DownloadManager::run_download_worker(const std::shared_ptr<ManagedDownload>& task) {
  std::string url;
  std::string partPath;
  std::string finalPath;
  std::string format;

  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (task->cancelRequested.load() || task->pauseRequested.load()) return;
    task->snapshot.status = "downloading";
    url = task->snapshot.url;
    partPath = task->partPath;
    finalPath = task->finalPath;
    format = task->snapshot.format;
  }

  std::error_code ec;
  fs::path partFs = to_fs_path(partPath);
  fs::create_directories(partFs.parent_path(), ec);
  if (ec) {
    std::lock_guard<std::mutex> lock(mutex_);
    task->snapshot.status = "error";
    task->snapshot.error = "Could not create staging directory.";
    return;
  }

  uint64_t existingBytes = 0;
  if (fs::exists(partFs, ec) && fs::is_regular_file(partFs, ec)) {
    existingBytes = static_cast<uint64_t>(fs::file_size(partFs, ec));
  }

  bool downloadSucceeded = false;
  std::string errorMsg;

#ifdef EMUSTORE_USE_CURL
  struct CurlContext {
    DownloadManager* self;
    std::mutex* mtx;
    std::shared_ptr<ManagedDownload> task;
    std::ofstream* outFile;
    uint64_t baseOffset;
    uint64_t written;
    std::chrono::steady_clock::time_point lastSampleAt;
    uint64_t lastSampleBytes;
    bool truncatedOn200;
  };

  std::ofstream outFile(partFs, existingBytes > 0 ? (std::ios::binary | std::ios::app) : (std::ios::binary | std::ios::trunc));
  if (!outFile) {
    errorMsg = "Could not open staging file.";
  } else {
    CurlContext ctx{
      this,
      &mutex_,
      task,
      &outFile,
      existingBytes,
      0,
      std::chrono::steady_clock::now(),
      0,
      false,
    };

    CURL* curl = curl_easy_init();
    if (!curl) {
      errorMsg = "Failed to initialize libcurl.";
    } else {
      auto headerCb = +[](char* buffer, size_t size, size_t nitems, void* userdata) -> size_t {
        size_t total = size * nitems;
        auto* c = static_cast<CurlContext*>(userdata);
        std::string line(buffer, total);
        if (line.rfind("HTTP/", 0) == 0 && line.find(" 200 ") != std::string::npos && c->baseOffset > 0 && !c->truncatedOn200) {
          c->outFile->close();
          c->outFile->open(to_fs_path(c->task->partPath), std::ios::binary | std::ios::trunc);
          c->baseOffset = 0;
          c->truncatedOn200 = true;
        }
        return total;
      };

      auto writeCb = +[](char* ptr, size_t size, size_t nmemb, void* userdata) -> size_t {
        auto* c = static_cast<CurlContext*>(userdata);
        if (c->task->cancelRequested.load() || c->task->pauseRequested.load()) return 0;
        size_t bytes = size * nmemb;
        c->outFile->write(ptr, static_cast<std::streamsize>(bytes));
        if (!*c->outFile) return 0;
        c->written += bytes;
        return bytes;
      };

      auto progressCb = +[](void* clientp, curl_off_t dltotal, curl_off_t dlnow, curl_off_t, curl_off_t) -> int {
        auto* c = static_cast<CurlContext*>(clientp);
        if (c->task->cancelRequested.load() || c->task->pauseRequested.load()) return 1;

        uint64_t currentTotal = c->baseOffset + static_cast<uint64_t>(std::max<curl_off_t>(0, dltotal));
        uint64_t currentBytes = c->baseOffset + static_cast<uint64_t>(std::max<curl_off_t>(0, dlnow));
        auto now = std::chrono::steady_clock::now();
        auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(now - c->lastSampleAt).count();

        std::lock_guard<std::mutex> lock(*c->mtx);
        c->task->snapshot.bytesDownloaded = currentBytes;
        if (currentTotal > 0) {
          c->task->snapshot.totalBytes = currentTotal;
          c->task->snapshot.progress = static_cast<int>(std::min<uint64_t>(100, (currentBytes * 100) / currentTotal));
        }
        if (elapsedMs >= 250) {
          uint64_t delta = c->written - c->lastSampleBytes;
          c->task->snapshot.speedBps = (delta * 1000) / static_cast<uint64_t>(elapsedMs);
          c->lastSampleAt = now;
          c->lastSampleBytes = c->written;
        }
        return 0;
      };

      curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
      curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
      curl_easy_setopt(curl, CURLOPT_MAXREDIRS, 8L);
      curl_easy_setopt(curl, CURLOPT_FAILONERROR, 1L);
      curl_easy_setopt(curl, CURLOPT_USERAGENT, "EmuStoreDaemon/0.1");
      curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 15L);
      curl_easy_setopt(curl, CURLOPT_LOW_SPEED_LIMIT, 1024L);
      curl_easy_setopt(curl, CURLOPT_LOW_SPEED_TIME, 30L);
      if (existingBytes > 0) {
        curl_easy_setopt(curl, CURLOPT_RESUME_FROM_LARGE, static_cast<curl_off_t>(existingBytes));
      }
      curl_easy_setopt(curl, CURLOPT_HEADERFUNCTION, headerCb);
      curl_easy_setopt(curl, CURLOPT_HEADERDATA, &ctx);
      curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCb);
      curl_easy_setopt(curl, CURLOPT_WRITEDATA, &ctx);
      curl_easy_setopt(curl, CURLOPT_XFERINFOFUNCTION, progressCb);
      curl_easy_setopt(curl, CURLOPT_XFERINFODATA, &ctx);
      curl_easy_setopt(curl, CURLOPT_NOPROGRESS, 0L);

      CURLcode res = curl_easy_perform(curl);
      curl_easy_cleanup(curl);
      outFile.close();

      if (res == CURLE_OK) {
        downloadSucceeded = true;
      } else if (task->pauseRequested.load() || task->cancelRequested.load()) {
        return;
      } else {
        errorMsg = curl_easy_strerror(res);
      }
    }
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
    errorMsg = "Invalid HTTP/HTTPS download URL.";
  } else {
    HINTERNET hSession = WinHttpOpen(L"EmuStoreDaemon/0.1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, nullptr, nullptr, 0);
    HINTERNET hConnect = hSession ? WinHttpConnect(hSession, hostBuf, uc.nPort, 0) : nullptr;
    DWORD flags = uc.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET hRequest = hConnect ? WinHttpOpenRequest(hConnect, L"GET", pathBuf, nullptr, nullptr, nullptr, flags) : nullptr;

    if (hRequest && existingBytes > 0) {
      std::wstring rangeHdr = L"Range: bytes=" + std::to_wstring(existingBytes) + L"-";
      WinHttpAddRequestHeaders(hRequest, rangeHdr.c_str(), static_cast<DWORD>(-1), WINHTTP_ADDREQ_FLAG_ADD);
    }

    if (!hRequest || !WinHttpSendRequest(hRequest, nullptr, 0, nullptr, 0, 0, 0) || !WinHttpReceiveResponse(hRequest, nullptr)) {
      errorMsg = "HTTP download request failed.";
    } else {
      DWORD statusCode = 0;
      DWORD statusSize = sizeof(statusCode);
      WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &statusCode, &statusSize, nullptr);

      if (statusCode < 200 || statusCode >= 300) {
        errorMsg = "HTTP server returned status " + std::to_string(statusCode);
      } else {
        if (statusCode == 200 && existingBytes > 0) existingBytes = 0;

        wchar_t lenBuf[64]{};
        DWORD lenBufBytes = sizeof(lenBuf);
        uint64_t contentLen = 0;
        if (WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_CONTENT_LENGTH, nullptr, lenBuf, &lenBufBytes, nullptr)) {
          contentLen = std::stoull(wide_to_utf8(lenBuf));
        }
        uint64_t totalExpected = contentLen > 0 ? (existingBytes + contentLen) : task->snapshot.totalBytes;

        std::ofstream outFile(partFs, existingBytes > 0 ? (std::ios::binary | std::ios::app) : (std::ios::binary | std::ios::trunc));
        if (!outFile) {
          errorMsg = "Could not open staging file.";
        } else {
          std::vector<char> buf(65536);
          uint64_t totalRead = existingBytes;
          auto lastSampleAt = std::chrono::steady_clock::now();
          uint64_t lastSampleBytes = totalRead;

          while (true) {
            if (task->cancelRequested.load() || task->pauseRequested.load()) break;
            DWORD avail = 0;
            if (!WinHttpQueryDataAvailable(hRequest, &avail)) {
              errorMsg = "Failed checking available download bytes.";
              break;
            }
            if (avail == 0) {
              downloadSucceeded = true;
              break;
            }
            DWORD chunk = static_cast<DWORD>(std::min<size_t>(avail, buf.size()));
            DWORD actuallyRead = 0;
            if (!WinHttpReadData(hRequest, buf.data(), chunk, &actuallyRead)) {
              errorMsg = "Failed reading response body.";
              break;
            }
            if (actuallyRead == 0) {
              downloadSucceeded = true;
              break;
            }
            outFile.write(buf.data(), static_cast<std::streamsize>(actuallyRead));
            if (!outFile) {
              errorMsg = "Disk write failed.";
              break;
            }
            totalRead += actuallyRead;
            auto now = std::chrono::steady_clock::now();
            auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(now - lastSampleAt).count();

            std::lock_guard<std::mutex> lock(mutex_);
            task->snapshot.bytesDownloaded = totalRead;
            if (totalExpected > 0) {
              task->snapshot.totalBytes = totalExpected;
              task->snapshot.progress = static_cast<int>(std::min<uint64_t>(100, (totalRead * 100) / totalExpected));
            }
            if (elapsedMs >= 250) {
              task->snapshot.speedBps = ((totalRead - lastSampleBytes) * 1000) / static_cast<uint64_t>(elapsedMs);
              lastSampleAt = now;
              lastSampleBytes = totalRead;
            }
          }
          outFile.close();
        }
      }
    }
    if (hRequest) WinHttpCloseHandle(hRequest);
    if (hConnect) WinHttpCloseHandle(hConnect);
    if (hSession) WinHttpCloseHandle(hSession);

    if (task->pauseRequested.load() || task->cancelRequested.load()) return;
  }
#elif defined(__PS5__) || defined(__PROSPERO__)
  // PS5 payload SDK sceHttp download adapter hook goes here when compiling eboot.bin.
  errorMsg = "PS5 sceHttp transport requires linking libSceHttp in PS5 build.";
#else
  errorMsg = "HTTP download requires libcurl on this platform.";
#endif

  if (!downloadSucceeded) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!task->pauseRequested.load() && !task->cancelRequested.load()) {
      task->snapshot.status = "error";
      task->snapshot.speedBps = 0;
      task->snapshot.error = errorMsg.empty() ? "Download failed." : errorMsg;
    }
    return;
  }

  fs::path finalFs = to_fs_path(finalPath);
  fs::create_directories(finalFs.parent_path(), ec);
  if (fs::exists(finalFs, ec)) {
    fs::remove(finalFs, ec);
  }
  fs::rename(partFs, finalFs, ec);
  if (ec) {
    std::lock_guard<std::mutex> lock(mutex_);
    task->snapshot.status = "error";
    task->snapshot.speedBps = 0;
    task->snapshot.error = "Failed moving downloaded file out of staging.";
    return;
  }

  // Clean up .tmp folder when empty
  fs::remove(partFs.parent_path(), ec);
  uint64_t finalSize = static_cast<uint64_t>(fs::file_size(finalFs, ec));

  std::lock_guard<std::mutex> lock(mutex_);
  task->snapshot.speedBps = 0;
  task->snapshot.progress = 100;
  task->snapshot.bytesDownloaded = finalSize;
  task->snapshot.totalBytes = finalSize;

  if (is_archive_ext(format)) {
    task->snapshot.archivePath = finalPath;
    task->snapshot.status = "ready_to_install";
  } else {
    task->snapshot.installedPath = finalPath;
    task->snapshot.status = "installed";
  }
}

void DownloadManager::run_extract_worker(
    const std::shared_ptr<ManagedDownload>& task,
    InstallArchiveRequest options) {
  std::string archivePath;
  std::string targetDir;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    archivePath = task->snapshot.archivePath.empty() ? task->finalPath : task->snapshot.archivePath;
    targetDir = options.targetDir.empty() ? task->snapshot.targetDir : options.targetDir;
  }

  ExtractOptions extractOpts;
  extractOpts.deleteArchive = options.deleteArchive;
  extractOpts.flattenSingleRoot = options.flattenSingleRoot;

  ExtractResult res = extract_zip_archive(
      archivePath,
      targetDir,
      extractOpts,
      [this, &task](int percent) {
        std::lock_guard<std::mutex> lock(mutex_);
        task->snapshot.progress = percent;
      },
      task->cancelRequested);

  std::lock_guard<std::mutex> lock(mutex_);
  if (res.ok) {
    task->snapshot.status = "installed";
    task->snapshot.progress = 100;
    task->snapshot.installedPath = res.targetDir;
    task->snapshot.error.clear();
    if (options.deleteArchive) {
      task->snapshot.archivePath.clear();
    }
  } else {
    task->snapshot.status = "error";
    task->snapshot.error = res.error.empty() ? "Archive extraction failed." : res.error;
  }
}

std::string download_snapshot_to_json(const DownloadRecordSnapshot& item) {
  std::string out = "{";
  out += "\"id\":" + json_string(item.id) + ",";
  out += "\"catalogId\":" + json_string(item.catalogId) + ",";
  out += "\"slug\":" + json_string(item.slug) + ",";
  out += "\"title\":" + json_string(item.title) + ",";
  out += "\"url\":" + json_string(item.url) + ",";
  out += "\"format\":" + json_string(item.format) + ",";
  out += "\"targetDir\":" + json_string(item.targetDir) + ",";
  if (!item.archivePath.empty()) {
    out += "\"archivePath\":" + json_string(item.archivePath) + ",";
  }
  if (!item.installedPath.empty()) {
    out += "\"installedPath\":" + json_string(item.installedPath) + ",";
  }
  out += "\"status\":" + json_string(item.status) + ",";
  out += "\"progress\":" + std::to_string(item.progress) + ",";
  out += "\"bytesDownloaded\":" + std::to_string(item.bytesDownloaded) + ",";
  out += "\"totalBytes\":" + std::to_string(item.totalBytes) + ",";
  out += "\"speedBps\":" + std::to_string(item.speedBps);
  if (!item.error.empty()) {
    out += ",\"error\":" + json_string(item.error);
  }
  out.push_back('}');
  return out;
}

std::string download_list_to_json(const std::vector<DownloadRecordSnapshot>& items) {
  std::string out = "{\"items\":[";
  for (size_t i = 0; i < items.size(); ++i) {
    if (i > 0) out.push_back(',');
    out += download_snapshot_to_json(items[i]);
  }
  out += "]}";
  return out;
}
