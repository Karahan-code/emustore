#pragma once

#include <cstdint>
#include <string>
#include <vector>

struct DiskSpaceInfo {
  uint64_t freeBytes = 0;
  uint64_t totalBytes = 0;
  bool ok = false;
};

struct FsEntry {
  std::string name;
  std::string path;
  bool isDir = false;
  uint64_t sizeBytes = 0;
};

struct DirectoryListing {
  std::string path;
  std::string parentPath;
  bool hasParent = false;
  uint64_t freeBytes = 0;
  uint64_t totalBytes = 0;
  std::vector<FsEntry> entries;
  std::string error;
};

DiskSpaceInfo get_disk_space(const std::string& pathUtf8);

bool is_subpath_within(const std::string& candidateUtf8, const std::string& rootUtf8);

DirectoryListing list_directory(const std::string& requestedUtf8, const std::string& rootDirUtf8);

std::string directory_listing_to_json(const DirectoryListing& listing);
