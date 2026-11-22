#include "zip_extractor.hpp"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <vector>

#include "fs_service.hpp"
#include "platform.hpp"

#ifdef EMUSTORE_USE_MINIZ
  #include "miniz.h"
#else
  #include <zlib.h>
#endif

namespace fs = std::filesystem;

namespace {

bool ends_with_ci(const std::string& value, const std::string& suffix) {
  if (value.size() < suffix.size()) return false;
  size_t offset = value.size() - suffix.size();
  for (size_t i = 0; i < suffix.size(); ++i) {
    if (std::tolower(static_cast<unsigned char>(value[offset + i])) !=
        std::tolower(static_cast<unsigned char>(suffix[i]))) {
      return false;
    }
  }
  return true;
}

bool validate_relative_zip_path(const std::string& rawName, std::vector<std::string>& outSegments) {
  outSegments.clear();
  if (rawName.empty() || rawName.find('\0') != std::string::npos) return false;
  if (rawName.front() == '/' || rawName.front() == '\\') return false;
  if (rawName.size() >= 2 && std::isalpha(static_cast<unsigned char>(rawName[0])) && rawName[1] == ':') {
    return false;
  }

  std::string normalized = rawName;
  std::replace(normalized.begin(), normalized.end(), '\\', '/');

  std::stringstream ss(normalized);
  std::string segment;
  while (std::getline(ss, segment, '/')) {
    if (segment.empty() || segment == ".") continue;
    if (segment == "..") return false;
    if (segment.find(':') != std::string::npos) return false;
    outSegments.push_back(segment);
  }
  return true;
}

std::string join_segments(const std::vector<std::string>& segments, size_t startIndex) {
  std::string out;
  for (size_t i = startIndex; i < segments.size(); ++i) {
    if (!out.empty()) out.push_back('/');
    out += segments[i];
  }
  return out;
}

#ifndef EMUSTORE_USE_MINIZ

uint16_t read_u16(const uint8_t* p) {
  return static_cast<uint16_t>(p[0]) | (static_cast<uint16_t>(p[1]) << 8);
}

uint32_t read_u32(const uint8_t* p) {
  return static_cast<uint32_t>(p[0]) |
         (static_cast<uint32_t>(p[1]) << 8) |
         (static_cast<uint32_t>(p[2]) << 16) |
         (static_cast<uint32_t>(p[3]) << 24);
}

uint64_t read_u64(const uint8_t* p) {
  return static_cast<uint64_t>(read_u32(p)) |
         (static_cast<uint64_t>(read_u32(p + 4)) << 32);
}

struct ZipEntryMeta {
  std::vector<std::string> segments;
  bool isDir = false;
  uint16_t method = 0;
  uint32_t crc32 = 0;
  uint64_t compSize = 0;
  uint64_t uncompSize = 0;
  uint64_t localHeaderOffset = 0;
};

bool seek_and_read(std::ifstream& file, uint64_t offset, void* dest, size_t len) {
  file.clear();
  file.seekg(static_cast<std::streamoff>(offset), std::ios::beg);
  if (!file) return false;
  file.read(static_cast<char*>(dest), static_cast<std::streamsize>(len));
  return static_cast<size_t>(file.gcount()) == len;
}

bool locate_central_directory(
    std::ifstream& file,
    uint64_t fileSize,
    uint64_t& cdOffset,
    uint64_t& cdSize,
    uint64_t& entryCount) {
  if (fileSize < 22) return false;

  const uint64_t maxSearch = std::min<uint64_t>(fileSize, 65535 + 22);
  const uint64_t startOffset = fileSize - maxSearch;
  std::vector<uint8_t> tail(static_cast<size_t>(maxSearch));
  if (!seek_and_read(file, startOffset, tail.data(), tail.size())) return false;

  size_t eocdRel = std::string::npos;
  for (size_t i = tail.size() - 22 + 1; i-- > 0;) {
    if (tail[i] == 0x50 && tail[i + 1] == 0x4b && tail[i + 2] == 0x05 && tail[i + 3] == 0x06) {
      uint16_t commentLen = read_u16(tail.data() + i + 20);
      if (i + 22 + commentLen == tail.size()) {
        eocdRel = i;
        break;
      }
    }
  }
  if (eocdRel == std::string::npos) return false;

  const uint64_t eocdOffset = startOffset + eocdRel;
  const uint8_t* eocd = tail.data() + eocdRel;
  uint64_t entries16 = read_u16(eocd + 10);
  uint64_t cdSize32 = read_u32(eocd + 12);
  uint64_t cdOffset32 = read_u32(eocd + 16);

  if (eocdOffset >= 20) {
    uint8_t loc[20]{};
    if (seek_and_read(file, eocdOffset - 20, loc, 20) && read_u32(loc) == 0x07064b50) {
      uint64_t zip64EocdOffset = read_u64(loc + 8);
      uint8_t z64[56]{};
      if (!seek_and_read(file, zip64EocdOffset, z64, 56) || read_u32(z64) != 0x06064b50) {
        return false;
      }
      entryCount = read_u64(z64 + 32);
      cdSize = read_u64(z64 + 40);
      cdOffset = read_u64(z64 + 48);
      return true;
    }
  }

  entryCount = entries16;
  cdSize = cdSize32;
  cdOffset = cdOffset32;
  return true;
}

#endif

}  // namespace

ExtractResult extract_zip_archive(
    const std::string& archivePathUtf8,
    const std::string& targetDirUtf8,
    const ExtractOptions& options,
    const std::function<void(int)>& onProgress,
    const std::atomic<bool>& cancelFlag) {
  ExtractResult result{};
  result.targetDir = targetDirUtf8;

  if (ends_with_ci(archivePathUtf8, ".7z")) {
    result.error = "Built-in extractor supports .zip (ZIP64) archives; .7z extraction requires an external 7z module.";
    return result;
  }

  std::error_code ec;
  fs::path archivePath = to_fs_path(archivePathUtf8);
  if (!fs::exists(archivePath, ec) || !fs::is_regular_file(archivePath, ec)) {
    result.error = "Archive file was not found.";
    return result;
  }

  uint64_t archiveSize = static_cast<uint64_t>(fs::file_size(archivePath, ec));
  if (ec) {
    result.error = "Could not inspect archive file size.";
    return result;
  }

  fs::path targetDir = to_fs_path(targetDirUtf8);
  fs::create_directories(targetDir, ec);
  if (ec) {
    result.error = "Could not create target directory.";
    return result;
  }

  fs::path canonTarget = fs::weakly_canonical(targetDir, ec);
  if (ec) canonTarget = targetDir.lexically_normal();
  std::string canonTargetUtf8 = from_fs_path(canonTarget);
  result.targetDir = canonTargetUtf8;

#ifdef EMUSTORE_USE_MINIZ
  mz_zip_archive zip{};
  if (!mz_zip_reader_init_file(&zip, archivePathUtf8.c_str(), 0)) {
    result.error = "Failed to open ZIP archive.";
    return result;
  }

  mz_uint numFiles = mz_zip_reader_get_num_files(&zip);
  struct MinizItem {
    mz_uint index;
    std::vector<std::string> segments;
    bool isDir;
    uint64_t uncompSize;
  };
  std::vector<MinizItem> items;
  items.reserve(numFiles);
  uint64_t totalUncomp = 0;

  for (mz_uint i = 0; i < numFiles; ++i) {
    mz_zip_archive_file_stat stat{};
    if (!mz_zip_reader_file_stat(&zip, i, &stat)) {
      mz_zip_reader_end(&zip);
      result.error = "Failed to inspect ZIP central directory entry.";
      return result;
    }

    std::vector<std::string> segs;
    if (!validate_relative_zip_path(stat.m_filename, segs)) {
      mz_zip_reader_end(&zip);
      result.error = "Rejected unsafe archive entry path (Zip-Slip protection).";
      return result;
    }
    if (segs.empty()) continue;

    bool isDir = mz_zip_reader_is_file_a_directory(&zip, i) != 0;
    if (!isDir) {
      totalUncomp += static_cast<uint64_t>(stat.m_uncomp_size);
    }
    items.push_back({ i, std::move(segs), isDir, static_cast<uint64_t>(stat.m_uncomp_size) });
  }

  DiskSpaceInfo disk = get_disk_space(canonTargetUtf8);
  uint64_t requiredBytes = std::max<uint64_t>(archiveSize * 2, totalUncomp);
  if (disk.ok && disk.freeBytes < requiredBytes) {
    mz_zip_reader_end(&zip);
    result.error = "Insufficient free disk space for extraction.";
    return result;
  }

  bool stripFirst = false;
  if (options.flattenSingleRoot) {
    std::string commonRoot;
    bool allMultiSegment = true;
    size_t fileCount = 0;
    for (const auto& item : items) {
      if (item.isDir) continue;
      fileCount += 1;
      if (item.segments.size() < 2) {
        allMultiSegment = false;
        break;
      }
      if (commonRoot.empty()) commonRoot = item.segments[0];
      else if (commonRoot != item.segments[0]) {
        allMultiSegment = false;
        break;
      }
    }
    stripFirst = allMultiSegment && fileCount > 0 && !commonRoot.empty();
  }

  uint64_t extractedBytes = 0;
  int lastPercent = -1;

  for (const auto& item : items) {
    if (cancelFlag.load()) {
      mz_zip_reader_end(&zip);
      result.error = "Extraction cancelled.";
      return result;
    }
    size_t startSeg = stripFirst ? 1 : 0;
    if (startSeg >= item.segments.size()) continue;
    std::string relPath = join_segments(item.segments, startSeg);
    fs::path destPath = canonTarget / to_fs_path(relPath);
    if (!is_subpath_within(from_fs_path(destPath), canonTargetUtf8)) {
      mz_zip_reader_end(&zip);
      result.error = "Rejected destination outside target folder.";
      return result;
    }
    if (item.isDir) {
      fs::create_directories(destPath, ec);
      continue;
    }
    fs::create_directories(destPath.parent_path(), ec);
    if (!mz_zip_reader_extract_to_file(&zip, item.index, from_fs_path(destPath).c_str(), 0)) {
      mz_zip_reader_end(&zip);
      result.error = "Failed extracting entry from archive.";
      return result;
    }
    result.filesExtracted += 1;
    extractedBytes += item.uncompSize;
    int pct = totalUncomp > 0 ? static_cast<int>((extractedBytes * 100) / totalUncomp) : 100;
    pct = std::clamp(pct, 0, 100);
    if (pct != lastPercent) {
      lastPercent = pct;
      if (onProgress) onProgress(pct);
    }
  }

  mz_zip_reader_end(&zip);
#else
  std::ifstream file(archivePath, std::ios::binary);
  if (!file) {
    result.error = "Could not open ZIP archive for reading.";
    return result;
  }

  uint64_t cdOffset = 0;
  uint64_t cdSize = 0;
  uint64_t entryCount = 0;
  if (!locate_central_directory(file, archiveSize, cdOffset, cdSize, entryCount)) {
    result.error = "Invalid or unsupported ZIP archive (EOCD not found).";
    return result;
  }
  if (cdOffset + cdSize > archiveSize) {
    result.error = "Corrupt ZIP central directory offset.";
    return result;
  }

  std::vector<uint8_t> cdBuffer(static_cast<size_t>(cdSize));
  if (cdSize > 0 && !seek_and_read(file, cdOffset, cdBuffer.data(), cdBuffer.size())) {
    result.error = "Failed reading ZIP central directory.";
    return result;
  }

  std::vector<ZipEntryMeta> entries;
  entries.reserve(static_cast<size_t>(std::min<uint64_t>(entryCount, 200000)));
  uint64_t totalUncomp = 0;

  size_t cursor = 0;
  for (uint64_t i = 0; i < entryCount && cursor + 46 <= cdBuffer.size(); ++i) {
    const uint8_t* hdr = cdBuffer.data() + cursor;
    if (read_u32(hdr) != 0x02014b50) {
      result.error = "Corrupt central directory signature.";
      return result;
    }

    uint16_t flags = read_u16(hdr + 8);
    uint16_t method = read_u16(hdr + 10);
    uint32_t crc = read_u32(hdr + 16);
    uint64_t compSize = read_u32(hdr + 20);
    uint64_t uncompSize = read_u32(hdr + 24);
    uint16_t nameLen = read_u16(hdr + 28);
    uint16_t extraLen = read_u16(hdr + 30);
    uint16_t commentLen = read_u16(hdr + 32);
    uint32_t extAttrs = read_u32(hdr + 38);
    uint64_t localOffset = read_u32(hdr + 42);

    size_t recordSize = 46ULL + nameLen + extraLen + commentLen;
    if (cursor + recordSize > cdBuffer.size()) {
      result.error = "Truncated ZIP central directory record.";
      return result;
    }

    if ((flags & 0x0001u) != 0) {
      result.error = "Encrypted ZIP archives are not supported.";
      return result;
    }

    std::string rawName(reinterpret_cast<const char*>(hdr + 46), nameLen);
    const uint8_t* extra = hdr + 46 + nameLen;
    size_t exPos = 0;
    while (exPos + 4 <= extraLen) {
      uint16_t tag = read_u16(extra + exPos);
      uint16_t sz = read_u16(extra + exPos + 2);
      if (exPos + 4 + sz > extraLen) break;
      if (tag == 0x0001) {
        size_t fieldPos = exPos + 4;
        if (uncompSize == 0xFFFFFFFFULL && fieldPos + 8 <= exPos + 4 + sz) {
          uncompSize = read_u64(extra + fieldPos);
          fieldPos += 8;
        }
        if (compSize == 0xFFFFFFFFULL && fieldPos + 8 <= exPos + 4 + sz) {
          compSize = read_u64(extra + fieldPos);
          fieldPos += 8;
        }
        if (localOffset == 0xFFFFFFFFULL && fieldPos + 8 <= exPos + 4 + sz) {
          localOffset = read_u64(extra + fieldPos);
        }
      }
      exPos += 4 + sz;
    }

    cursor += recordSize;

    // Skip symlinks (POSIX mode 0120000 in upper 16 bits)
    if (((extAttrs >> 16) & 0xF000u) == 0xA000u) {
      continue;
    }

    std::vector<std::string> segs;
    if (!validate_relative_zip_path(rawName, segs)) {
      result.error = "Rejected unsafe archive entry path (Zip-Slip protection).";
      return result;
    }
    if (segs.empty()) continue;

    bool isDir = !rawName.empty() && (rawName.back() == '/' || rawName.back() == '\\');
    if (!isDir) {
      totalUncomp += uncompSize;
    }

    entries.push_back({ std::move(segs), isDir, method, crc, compSize, uncompSize, localOffset });
  }

  DiskSpaceInfo disk = get_disk_space(canonTargetUtf8);
  uint64_t requiredBytes = std::max<uint64_t>(archiveSize * 2, totalUncomp);
  if (disk.ok && disk.freeBytes < requiredBytes) {
    result.error = "Insufficient free disk space for extraction.";
    return result;
  }

  bool stripFirst = false;
  if (options.flattenSingleRoot) {
    std::string commonRoot;
    bool allMultiSegment = true;
    size_t fileCount = 0;
    for (const auto& entry : entries) {
      if (entry.isDir) continue;
      fileCount += 1;
      if (entry.segments.size() < 2) {
        allMultiSegment = false;
        break;
      }
      if (commonRoot.empty()) commonRoot = entry.segments[0];
      else if (commonRoot != entry.segments[0]) {
        allMultiSegment = false;
        break;
      }
    }
    stripFirst = allMultiSegment && fileCount > 0 && !commonRoot.empty();
  }

  uint64_t extractedBytes = 0;
  int lastPercent = -1;
  constexpr size_t kChunkSize = 65536;
  std::vector<uint8_t> inBuf(kChunkSize);
  std::vector<uint8_t> outBuf(kChunkSize);

  for (const auto& entry : entries) {
    if (cancelFlag.load()) {
      result.error = "Extraction cancelled.";
      return result;
    }

    size_t startSeg = stripFirst ? 1 : 0;
    if (startSeg >= entry.segments.size()) continue;

    std::string relPath = join_segments(entry.segments, startSeg);
    fs::path destPath = canonTarget / to_fs_path(relPath);
    if (!is_subpath_within(from_fs_path(destPath), canonTargetUtf8)) {
      result.error = "Rejected destination outside target folder.";
      return result;
    }

    if (entry.isDir) {
      fs::create_directories(destPath, ec);
      continue;
    }

    uint8_t localHdr[30]{};
    if (!seek_and_read(file, entry.localHeaderOffset, localHdr, 30) || read_u32(localHdr) != 0x04034b50) {
      result.error = "Corrupt ZIP local file header.";
      return result;
    }
    uint16_t localNameLen = read_u16(localHdr + 26);
    uint16_t localExtraLen = read_u16(localHdr + 28);
    uint64_t dataOffset = entry.localHeaderOffset + 30ULL + localNameLen + localExtraLen;
    if (dataOffset + entry.compSize > archiveSize) {
      result.error = "Truncated ZIP entry payload.";
      return result;
    }

    fs::create_directories(destPath.parent_path(), ec);
    if (ec) {
      result.error = "Could not create destination directory.";
      return result;
    }

    std::ofstream outFile(destPath, std::ios::binary | std::ios::trunc);
    if (!outFile) {
      result.error = "Could not open destination file for writing.";
      return result;
    }

    file.clear();
    file.seekg(static_cast<std::streamoff>(dataOffset), std::ios::beg);

    uLong computedCrc = crc32(0L, Z_NULL, 0);

    if (entry.method == 0) {
      uint64_t remaining = entry.compSize;
      while (remaining > 0) {
        if (cancelFlag.load()) {
          result.error = "Extraction cancelled.";
          return result;
        }
        size_t toRead = static_cast<size_t>(std::min<uint64_t>(remaining, inBuf.size()));
        file.read(reinterpret_cast<char*>(inBuf.data()), static_cast<std::streamsize>(toRead));
        size_t got = static_cast<size_t>(file.gcount());
        if (got == 0) {
          result.error = "Unexpected end of stored ZIP entry.";
          return result;
        }
        outFile.write(reinterpret_cast<const char*>(inBuf.data()), static_cast<std::streamsize>(got));
        if (!outFile) {
          result.error = "Disk write failed during extraction.";
          return result;
        }
        computedCrc = crc32(computedCrc, inBuf.data(), static_cast<uInt>(got));
        remaining -= got;
        extractedBytes += got;

        int pct = totalUncomp > 0 ? static_cast<int>((extractedBytes * 100) / totalUncomp) : 100;
        pct = std::clamp(pct, 0, 100);
        if (pct != lastPercent) {
          lastPercent = pct;
          if (onProgress) onProgress(pct);
        }
      }
    } else if (entry.method == 8) {
      z_stream zs{};
      if (inflateInit2(&zs, -MAX_WBITS) != Z_OK) {
        result.error = "Failed to initialize deflate stream.";
        return result;
      }

      uint64_t remaining = entry.compSize;
      int zStatus = Z_OK;
      while (zStatus != Z_STREAM_END) {
        if (cancelFlag.load()) {
          inflateEnd(&zs);
          result.error = "Extraction cancelled.";
          return result;
        }
        if (zs.avail_in == 0 && remaining > 0) {
          size_t toRead = static_cast<size_t>(std::min<uint64_t>(remaining, inBuf.size()));
          file.read(reinterpret_cast<char*>(inBuf.data()), static_cast<std::streamsize>(toRead));
          size_t got = static_cast<size_t>(file.gcount());
          if (got == 0) {
            inflateEnd(&zs);
            result.error = "Unexpected end of compressed ZIP entry.";
            return result;
          }
          remaining -= got;
          zs.next_in = inBuf.data();
          zs.avail_in = static_cast<uInt>(got);
        }

        zs.next_out = outBuf.data();
        zs.avail_out = static_cast<uInt>(outBuf.size());
        zStatus = inflate(&zs, Z_NO_FLUSH);
        if (zStatus != Z_OK && zStatus != Z_STREAM_END) {
          inflateEnd(&zs);
          result.error = "Corrupt deflate stream inside ZIP archive.";
          return result;
        }

        size_t produced = outBuf.size() - zs.avail_out;
        if (produced > 0) {
          outFile.write(reinterpret_cast<const char*>(outBuf.data()), static_cast<std::streamsize>(produced));
          if (!outFile) {
            inflateEnd(&zs);
            result.error = "Disk write failed during extraction.";
            return result;
          }
          computedCrc = crc32(computedCrc, outBuf.data(), static_cast<uInt>(produced));
          extractedBytes += produced;

          int pct = totalUncomp > 0 ? static_cast<int>((extractedBytes * 100) / totalUncomp) : 100;
          pct = std::clamp(pct, 0, 100);
          if (pct != lastPercent) {
            lastPercent = pct;
            if (onProgress) onProgress(pct);
          }
        }

        if (zStatus == Z_OK && zs.avail_in == 0 && remaining == 0 && zs.avail_out > 0) {
          inflateEnd(&zs);
          result.error = "Truncated deflate stream inside ZIP archive.";
          return result;
        }
      }
      inflateEnd(&zs);
    } else {
      result.error = "Unsupported ZIP compression method (only STORE and DEFLATE are supported).";
      return result;
    }

    outFile.close();
    if (static_cast<uint32_t>(computedCrc) != entry.crc32) {
      result.error = "CRC-32 verification failed for extracted entry.";
      return result;
    }

    result.filesExtracted += 1;
  }

  file.close();
#endif

  if (onProgress) onProgress(100);

  if (options.deleteArchive) {
    fs::remove(archivePath, ec);
  }

  result.ok = true;
  return result;
}
