#pragma once

#include <cstdint>
#include <filesystem>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

struct CatalogPlatformSyncResult {
  bool updated = false;
  bool skipped = false;
  uint64_t bytes = 0;
  std::string error;
};

struct CatalogSyncResponse {
  int httpStatus = 200;
  std::string bodyJson;
};

class CatalogSyncService {
 public:
  explicit CatalogSyncService(const std::string& cacheDirOverride = "");

  bool is_valid_platform(const std::string& platform) const;
  std::string cache_dir() const;

  std::string get_status_json();
  std::optional<std::string> read_cached_catalog(const std::string& platform);
  CatalogSyncResponse sync(
      const std::string& requestedBaseUrl,
      const std::vector<std::string>& requestedPlatforms);
  int clear_cache();

 private:
  std::filesystem::path cacheDir_;
  std::mutex mutex_;
  std::string lastSyncedAt_;
  std::map<std::string, std::string> platformUpdatedAt_;

  void load_sync_meta_locked();
  void save_sync_meta_locked() const;
};
