#include "fs_service.hpp"

#include <algorithm>
#include <cctype>
#include <filesystem>

#include "json_util.hpp"
#include "platform.hpp"

#ifndef _WIN32
  #include <sys/statvfs.h>
#endif

namespace fs = std::filesystem;

namespace {

std::string to_lower_ascii(std::string value) {
  for (char& ch : value) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return value;
}

fs::path find_existing_ancestor(fs::path probe) {
  std::error_code ec;
  if (probe.empty()) {
#ifdef _WIN32
    return fs::current_path(ec);
#else
    return fs::path("/");
#endif
  }

  while (!probe.empty() && !fs::exists(probe, ec)) {
    fs::path parent = probe.parent_path();
    if (parent == probe) break;
    probe = parent;
  }
  return probe;
}

bool paths_equal(const fs::path& left, const fs::path& right) {
#ifdef _WIN32
  return to_lower_ascii(from_fs_path(left)) == to_lower_ascii(from_fs_path(right));
#else
  return left == right;
#endif
}

}  // namespace

DiskSpaceInfo get_disk_space(const std::string& pathUtf8) {
  DiskSpaceInfo info{};
  fs::path existing = find_existing_ancestor(to_fs_path(pathUtf8));
  if (existing.empty()) return info;

#ifdef _WIN32
  ULARGE_INTEGER avail{};
  ULARGE_INTEGER total{};
  std::wstring wide = existing.wstring();
  if (GetDiskFreeSpaceExW(wide.c_str(), &avail, &total, nullptr)) {
    info.freeBytes = static_cast<uint64_t>(avail.QuadPart);
    info.totalBytes = static_cast<uint64_t>(total.QuadPart);
    info.ok = true;
  }
#else
  struct statvfs vfs{};
  std::string narrow = from_fs_path(existing);
  if (statvfs(narrow.c_str(), &vfs) == 0) {
    uint64_t blockSize = static_cast<uint64_t>(vfs.f_frsize > 0 ? vfs.f_frsize : vfs.f_bsize);
    info.freeBytes = static_cast<uint64_t>(vfs.f_bavail) * blockSize;
    info.totalBytes = static_cast<uint64_t>(vfs.f_blocks) * blockSize;
    info.ok = true;
  }
#endif

  return info;
}

bool is_subpath_within(const std::string& candidateUtf8, const std::string& rootUtf8) {
  if (rootUtf8.empty()) return true;
  std::error_code ec;
  fs::path canonRoot = fs::weakly_canonical(to_fs_path(rootUtf8), ec);
  if (ec) canonRoot = to_fs_path(rootUtf8).lexically_normal();

  fs::path canonCand = fs::weakly_canonical(to_fs_path(candidateUtf8), ec);
  if (ec) canonCand = to_fs_path(candidateUtf8).lexically_normal();

  auto rootIt = canonRoot.begin();
  auto candIt = canonCand.begin();
  while (rootIt != canonRoot.end()) {
    if (candIt == canonCand.end()) return false;
#ifdef _WIN32
    if (to_lower_ascii(from_fs_path(*rootIt)) != to_lower_ascii(from_fs_path(*candIt))) return false;
#else
    if (*rootIt != *candIt) return false;
#endif
    ++rootIt;
    ++candIt;
  }
  return true;
}

DirectoryListing list_directory(const std::string& requestedUtf8, const std::string& rootDirUtf8) {
  DirectoryListing listing{};

  if (requestedUtf8.find('\0') != std::string::npos) {
    listing.error = "Invalid null byte in path.";
    return listing;
  }

#ifdef _WIN32
  if (rootDirUtf8.empty() && requestedUtf8.empty()) {
    DWORD drivesMask = GetLogicalDrives();
    listing.path = "";
    listing.hasParent = false;
    for (int i = 0; i < 26; ++i) {
      if ((drivesMask & (1u << i)) == 0) continue;
      char driveRoot[4] = { static_cast<char>('A' + i), ':', '\\', '\0' };
      FsEntry entry;
      entry.name = driveRoot;
      entry.path = driveRoot;
      entry.isDir = true;
      listing.entries.push_back(entry);
    }
    if (!listing.entries.empty()) {
      DiskSpaceInfo disk = get_disk_space(listing.entries.front().path);
      listing.freeBytes = disk.freeBytes;
      listing.totalBytes = disk.totalBytes;
    }
    return listing;
  }
#endif

  std::error_code ec;
  fs::path targetPath;
  fs::path canonRoot;

  if (!rootDirUtf8.empty()) {
    canonRoot = fs::weakly_canonical(to_fs_path(rootDirUtf8), ec);
    if (ec) canonRoot = to_fs_path(rootDirUtf8).lexically_normal();

    if (requestedUtf8.empty()) {
      targetPath = canonRoot;
    } else {
      fs::path req = to_fs_path(requestedUtf8);
      targetPath = req.is_absolute() ? req : (canonRoot / req);
    }
  } else if (requestedUtf8.empty()) {
    targetPath = fs::path("/");
  } else {
    targetPath = to_fs_path(requestedUtf8);
  }

  fs::path canonTarget = fs::weakly_canonical(targetPath, ec);
  if (ec) canonTarget = targetPath.lexically_normal();

  std::string canonTargetUtf8 = from_fs_path(canonTarget);
  if (!rootDirUtf8.empty() && !is_subpath_within(canonTargetUtf8, from_fs_path(canonRoot))) {
    canonTarget = canonRoot;
    canonTargetUtf8 = from_fs_path(canonRoot);
  }

  if (!fs::exists(canonTarget, ec) || !fs::is_directory(canonTarget, ec)) {
    listing.path = canonTargetUtf8;
    listing.error = "Directory does not exist.";
    return listing;
  }

  listing.path = canonTargetUtf8;

  if (!rootDirUtf8.empty()) {
    if (!paths_equal(canonTarget, canonRoot)) {
      fs::path parent = canonTarget.parent_path();
      if (!parent.empty() && is_subpath_within(from_fs_path(parent), from_fs_path(canonRoot))) {
        listing.hasParent = true;
        listing.parentPath = from_fs_path(parent);
      }
    }
  } else {
    fs::path parent = canonTarget.parent_path();
    if (!parent.empty() && !paths_equal(parent, canonTarget)) {
      listing.hasParent = true;
      listing.parentPath = from_fs_path(parent);
    } else {
#ifdef _WIN32
      listing.hasParent = true;
      listing.parentPath = "";
#endif
    }
  }

  DiskSpaceInfo disk = get_disk_space(canonTargetUtf8);
  listing.freeBytes = disk.freeBytes;
  listing.totalBytes = disk.totalBytes;

  constexpr size_t kMaxEntries = 500;
  for (const auto& dirEntry : fs::directory_iterator(canonTarget, fs::directory_options::skip_permission_denied, ec)) {
    if (listing.entries.size() >= kMaxEntries) break;
    std::error_code itemEc;
    bool isDir = dirEntry.is_directory(itemEc);
    if (itemEc) continue;

    FsEntry item;
    item.name = from_fs_path(dirEntry.path().filename());
    item.path = from_fs_path(dirEntry.path());
    item.isDir = isDir;
    if (!isDir) {
      uintmax_t sz = dirEntry.file_size(itemEc);
      item.sizeBytes = itemEc ? 0 : static_cast<uint64_t>(sz);
    }
    listing.entries.push_back(std::move(item));
  }

  std::sort(listing.entries.begin(), listing.entries.end(), [](const FsEntry& a, const FsEntry& b) {
    if (a.isDir != b.isDir) return a.isDir > b.isDir;
    return to_lower_ascii(a.name) < to_lower_ascii(b.name);
  });

  return listing;
}

std::string directory_listing_to_json(const DirectoryListing& listing) {
  std::string out = "{";
  out += "\"path\":" + json_string(listing.path) + ",";
  if (listing.hasParent) {
    out += "\"parentPath\":" + json_string(listing.parentPath) + ",";
  } else {
    out += "\"parentPath\":null,";
  }
  out += "\"freeBytes\":" + std::to_string(listing.freeBytes) + ",";
  out += "\"totalBytes\":" + std::to_string(listing.totalBytes) + ",";
  if (!listing.error.empty()) {
    out += "\"error\":" + json_string(listing.error) + ",";
  }
  out += "\"entries\":[";
  for (size_t i = 0; i < listing.entries.size(); ++i) {
    const auto& entry = listing.entries[i];
    if (i > 0) out.push_back(',');
    out += "{";
    out += "\"name\":" + json_string(entry.name) + ",";
    out += "\"path\":" + json_string(entry.path) + ",";
    out += "\"isDir\":" + std::string(entry.isDir ? "true" : "false");
    if (!entry.isDir) {
      out += ",\"sizeBytes\":" + std::to_string(entry.sizeBytes);
    }
    out.push_back('}');
  }
  out += "]}";
  return out;
}
