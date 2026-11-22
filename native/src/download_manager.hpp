#pragma once

#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

struct DownloadRequest {
  std::string catalogId;
  std::string slug;
  std::string title;
  std::string url;
  std::string format;
  std::string targetDir;
  int64_t expectedBytes = 0;
};

struct InstallArchiveRequest {
  bool deleteArchive = true;
  bool flattenSingleRoot = true;
  std::string targetDir;
};

struct DownloadRecordSnapshot {
  std::string id;
  std::string catalogId;
  std::string slug;
  std::string title;
  std::string url;
  std::string format;
  std::string targetDir;
  std::string archivePath;
  std::string installedPath;
  std::string browserUrl;
  std::string status;
  int progress = 0;
  uint64_t bytesDownloaded = 0;
  uint64_t totalBytes = 0;
  uint64_t speedBps = 0;
  std::string error;
};

struct ManagedDownload {
  DownloadRecordSnapshot snapshot;
  std::string partPath;
  std::string finalPath;
  std::atomic<bool> pauseRequested{false};
  std::atomic<bool> cancelRequested{false};
};

class DownloadManager {
 public:
  DownloadManager() = default;
  ~DownloadManager();

  DownloadManager(const DownloadManager&) = delete;
  DownloadManager& operator=(const DownloadManager&) = delete;

  DownloadRecordSnapshot start_download(const DownloadRequest& request);
  std::optional<DownloadRecordSnapshot> pause_download(const std::string& id);
  std::optional<DownloadRecordSnapshot> resume_download(const std::string& id);
  std::optional<DownloadRecordSnapshot> install_archive(const std::string& id, const InstallArchiveRequest& options);
  bool cancel_download(const std::string& id);

  std::vector<DownloadRecordSnapshot> list_downloads();
  std::optional<DownloadRecordSnapshot> get_download(const std::string& id);
  void shutdown();

 private:
  void run_download_worker(const std::shared_ptr<ManagedDownload>& task);
  void run_extract_worker(const std::shared_ptr<ManagedDownload>& task, InstallArchiveRequest options);

  std::mutex mutex_;
  std::vector<std::shared_ptr<ManagedDownload>> tasks_;
  std::vector<std::thread> workers_;
  uint64_t nextId_ = 1;
  bool shuttingDown_ = false;
};

std::string download_snapshot_to_json(const DownloadRecordSnapshot& item);
std::string download_list_to_json(const std::vector<DownloadRecordSnapshot>& items);
