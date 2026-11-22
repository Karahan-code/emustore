#include <atomic>
#include <cctype>
#include <cerrno>
#include <chrono>
#include <csignal>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "catalog_sync.hpp"
#include "download_manager.hpp"
#include "fs_service.hpp"
#include "json_util.hpp"
#include "platform.hpp"

#ifdef EMUSTORE_USE_CURL
  #include <curl/curl.h>
#endif

namespace fs = std::filesystem;

namespace {

std::atomic<bool> g_running{true};
socket_t g_listenSocket = INVALID_SOCK;

void handle_signal(int) {
  g_running.store(false);
  socket_t sock = g_listenSocket;
  g_listenSocket = INVALID_SOCK;
  if (sock != INVALID_SOCK) {
    close_socket(sock);
  }
}

enum class OpenMode {
  Auto,
  ForceOpen,
  NoOpen,
};

struct ServerConfig {
  std::string host = "127.0.0.1";
  int port = 9021;
  std::string staticDir;
  std::string rootDir;
  std::string catalogCacheDir;
  OpenMode openMode = OpenMode::Auto;
};

struct HttpRequest {
  std::string method;
  std::string rawTarget;
  std::string path;
  std::string query;
  std::string body;
};

std::string mime_type_for_path(const std::string& path) {
  auto dot = path.rfind('.');
  std::string ext = dot == std::string::npos ? "" : path.substr(dot);
  for (char& ch : ext) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));

  if (ext == ".html" || ext == ".htm") return "text/html; charset=utf-8";
  if (ext == ".js" || ext == ".mjs") return "application/javascript; charset=utf-8";
  if (ext == ".css") return "text/css; charset=utf-8";
  if (ext == ".json" || ext == ".map") return "application/json; charset=utf-8";
  if (ext == ".svg") return "image/svg+xml";
  if (ext == ".png") return "image/png";
  if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
  if (ext == ".webp") return "image/webp";
  if (ext == ".avif") return "image/avif";
  if (ext == ".ico") return "image/x-icon";
  if (ext == ".woff2") return "font/woff2";
  if (ext == ".woff") return "font/woff";
  if (ext == ".ttf") return "font/ttf";
  if (ext == ".txt") return "text/plain; charset=utf-8";
  if (ext == ".zip") return "application/zip";
  return "application/octet-stream";
}

bool send_all(socket_t sock, const char* data, size_t len) {
  size_t sent = 0;
  while (sent < len) {
    int n = send(sock, data + sent, static_cast<int>(len - sent), 0);
    if (n <= 0) return false;
    sent += static_cast<size_t>(n);
  }
  return true;
}

void send_http_response(
    socket_t sock,
    int status,
    const std::string& statusText,
    const std::string& contentType,
    const std::string& body,
    const std::string& cacheControl = "private, no-store",
    bool sendBody = true) {
  std::ostringstream hdr;
  hdr << "HTTP/1.1 " << status << " " << statusText << "\r\n";
  hdr << "Access-Control-Allow-Origin: *\r\n";
  hdr << "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n";
  hdr << "Access-Control-Allow-Headers: Content-Type, Accept\r\n";
  hdr << "Cache-Control: " << (cacheControl.empty() ? "private, no-store" : cacheControl) << "\r\n";
  if (!contentType.empty()) {
    hdr << "Content-Type: " << contentType << "\r\n";
  }
  hdr << "Content-Length: " << body.size() << "\r\n";
  hdr << "Connection: close\r\n\r\n";

  std::string headerStr = hdr.str();
  send_all(sock, headerStr.data(), headerStr.size());
  if (sendBody && !body.empty()) {
    send_all(sock, body.data(), body.size());
  }
}

void send_redirect(socket_t sock, const std::string& location) {
  std::ostringstream hdr;
  hdr << "HTTP/1.1 302 Found\r\n";
  hdr << "Location: " << location << "\r\n";
  hdr << "Cache-Control: no-cache\r\n";
  hdr << "Content-Length: 0\r\n";
  hdr << "Connection: close\r\n\r\n";

  std::string headerStr = hdr.str();
  send_all(sock, headerStr.data(), headerStr.size());
}

void send_json(socket_t sock, int status, const std::string& statusText, const std::string& json) {
  send_http_response(sock, status, statusText, "application/json; charset=utf-8", json, "private, no-store", true);
}

std::string cache_control_for_static(const std::string& urlPath, const fs::path& resolvedFile) {
  if (urlPath.rfind("/_next/static/", 0) == 0) {
    return "public, max-age=31536000, immutable";
  }
  if (resolvedFile.extension() == ".html" || resolvedFile.extension() == ".htm") {
    return "no-cache";
  }
  return "public, max-age=300";
}

std::string auto_detect_static_dir() {
  std::error_code ec;
  std::vector<fs::path> candidates;
#if defined(__PS5__) || defined(__PROSPERO__)
  candidates.emplace_back("/app0/assets/out");
  candidates.emplace_back("/data/emustore/out");
#endif
  fs::path exeDir = get_executable_dir();
  if (!exeDir.empty()) {
    candidates.push_back(exeDir / "out");
  }
  candidates.emplace_back("out");
  candidates.emplace_back("../out");
  if (!exeDir.empty()) {
    candidates.push_back(exeDir / ".." / ".." / "out");
  }

  for (const fs::path& dir : candidates) {
    if (!fs::exists(dir, ec) || !fs::is_directory(dir, ec)) continue;
    if (fs::is_regular_file(dir / "index.html", ec) || fs::is_regular_file(dir / "tr" / "index.html", ec)) {
      fs::path canon = fs::weakly_canonical(dir, ec);
      return from_fs_path(ec ? dir.lexically_normal() : canon);
    }
  }
  return {};
}

bool read_http_request(socket_t sock, HttpRequest& req) {
  std::string buffer;
  buffer.reserve(4096);
  char chunk[4096];
  size_t headerEnd = std::string::npos;

  while (buffer.size() < 65536) {
    int n = recv(sock, chunk, sizeof(chunk), 0);
    if (n <= 0) break;
    buffer.append(chunk, static_cast<size_t>(n));
    headerEnd = buffer.find("\r\n\r\n");
    if (headerEnd != std::string::npos) break;
  }
  if (headerEnd == std::string::npos) return false;

  std::string headerBlock = buffer.substr(0, headerEnd);
  std::istringstream headerStream(headerBlock);
  std::string requestLine;
  if (!std::getline(headerStream, requestLine)) return false;
  if (!requestLine.empty() && requestLine.back() == '\r') requestLine.pop_back();

  std::istringstream lineStream(requestLine);
  std::string version;
  if (!(lineStream >> req.method >> req.rawTarget >> version)) return false;

  size_t qPos = req.rawTarget.find('?');
  if (qPos == std::string::npos) {
    req.path = req.rawTarget;
  } else {
    req.path = req.rawTarget.substr(0, qPos);
    req.query = req.rawTarget.substr(qPos + 1);
  }

  size_t contentLength = 0;
  std::string line;
  while (std::getline(headerStream, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    size_t colon = line.find(':');
    if (colon == std::string::npos) continue;
    std::string key = line.substr(0, colon);
    for (char& ch : key) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    if (key == "content-length") {
      std::string val = line.substr(colon + 1);
      size_t first = val.find_first_not_of(" \t");
      if (first != std::string::npos) {
        try {
          contentLength = static_cast<size_t>(std::stoull(val.substr(first)));
        } catch (...) {
          contentLength = 0;
        }
      }
    }
  }

  constexpr size_t kMaxBody = 1024 * 1024;
  if (contentLength > kMaxBody) return false;

  req.body = buffer.substr(headerEnd + 4);
  while (req.body.size() < contentLength) {
    int n = recv(sock, chunk, sizeof(chunk), 0);
    if (n <= 0) break;
    req.body.append(chunk, static_cast<size_t>(n));
  }
  if (req.body.size() > contentLength) {
    req.body.resize(contentLength);
  }
  return true;
}

bool try_serve_static(
    socket_t sock,
    const ServerConfig& cfg,
    const std::string& method,
    const std::string& urlPath) {
  if (cfg.staticDir.empty()) return false;
  if (urlPath == "/api" || urlPath.rfind("/api/", 0) == 0) return false;

  std::string decoded = url_decode(urlPath, false);
  if (decoded.find('\0') != std::string::npos ||
      decoded.find('\\') != std::string::npos ||
      decoded.find("..") != std::string::npos) {
    send_json(sock, 400, "Bad Request", "{\"error\":\"Invalid static path\"}");
    return true;
  }

  while (!decoded.empty() && decoded.front() == '/') {
    decoded.erase(decoded.begin());
  }
  while (!decoded.empty() && decoded.back() == '/') {
    decoded.pop_back();
  }

  std::error_code ec;
  fs::path staticRoot = fs::weakly_canonical(to_fs_path(cfg.staticDir), ec);
  if (ec || !fs::exists(staticRoot, ec)) return false;

  if (decoded.empty()) {
    if (fs::is_regular_file(staticRoot / "index.html", ec)) {
      decoded = "index.html";
    } else if (fs::is_regular_file(staticRoot / "tr" / "index.html", ec)) {
      send_redirect(sock, "/tr/");
      return true;
    } else {
      return false;
    }
  }

  fs::path candidate = staticRoot / to_fs_path(decoded);
  if (fs::is_directory(candidate, ec)) {
    candidate /= "index.html";
  } else if (!fs::exists(candidate, ec)) {
    fs::path indexCandidate = candidate / "index.html";
    if (fs::is_regular_file(indexCandidate, ec)) {
      candidate = indexCandidate;
    } else if (candidate.extension().empty()) {
      fs::path htmlCandidate = to_fs_path(from_fs_path(candidate) + ".html");
      if (fs::is_regular_file(htmlCandidate, ec)) candidate = htmlCandidate;
    }
  }

  fs::path canonCandidate = fs::weakly_canonical(candidate, ec);
  if (ec || !is_subpath_within(from_fs_path(canonCandidate), from_fs_path(staticRoot))) {
    return false;
  }
  if (!fs::is_regular_file(canonCandidate, ec)) return false;

  std::ifstream file(canonCandidate, std::ios::binary);
  if (!file) return false;

  std::ostringstream ss;
  ss << file.rdbuf();
  std::string content = ss.str();
  std::string cacheControl = cache_control_for_static(urlPath, canonCandidate);
  bool sendBody = (method != "HEAD");
  send_http_response(
      sock,
      200,
      "OK",
      mime_type_for_path(from_fs_path(canonCandidate)),
      content,
      cacheControl,
      sendBody);
  return true;
}

bool probe_existing_daemon_health(const std::string& host, int port) {
  std::string probeHost = (host.empty() || host == "0.0.0.0") ? "127.0.0.1" : host;
  socket_t sock = socket(AF_INET, SOCK_STREAM, 0);
  if (sock == INVALID_SOCK) return false;

  set_socket_timeouts(sock, 1200);

  sockaddr_in target{};
  target.sin_family = AF_INET;
  target.sin_port = htons(static_cast<uint16_t>(port));
  if (inet_pton(AF_INET, probeHost.c_str(), &target.sin_addr) != 1) {
    close_socket(sock);
    return false;
  }

  if (connect(sock, reinterpret_cast<sockaddr*>(&target), sizeof(target)) != 0) {
    close_socket(sock);
    return false;
  }

  std::string req =
      "GET /api/native/health HTTP/1.1\r\nHost: " + probeHost +
      "\r\nConnection: close\r\n\r\n";
  if (!send_all(sock, req.data(), req.size())) {
    close_socket(sock);
    return false;
  }

  std::string reply;
  char buf[1024];
  for (;;) {
    int n = recv(sock, buf, sizeof(buf), 0);
    if (n <= 0) break;
    reply.append(buf, static_cast<size_t>(n));
    if (reply.size() >= 4096) break;
  }
  close_socket(sock);

  return reply.find("200") != std::string::npos &&
         reply.find("emustore-daemon") != std::string::npos &&
         reply.find("\"ok\":true") != std::string::npos;
}

void handle_client(
    socket_t sock,
    const ServerConfig& cfg,
    DownloadManager& manager,
    CatalogSyncService& catalogSync) {
  set_socket_timeouts(sock, 5000);
  HttpRequest req;
  if (!read_http_request(sock, req)) {
    close_socket(sock);
    return;
  }

  if (req.method == "OPTIONS") {
    send_http_response(sock, 204, "No Content", "", "");
    close_socket(sock);
    return;
  }

  if (req.method == "GET" && req.path == "/api/native/health") {
    std::string json = "{";
    json += "\"ok\":true,";
    json += "\"service\":\"emustore-daemon\",";
    json += "\"version\":\"0.1.0\",";
    json += "\"platform\":" + json_string(emustore_platform_name()) + ",";
    json += "\"port\":" + std::to_string(cfg.port) + ",";
    json += "\"rootDir\":" + json_string(cfg.rootDir);
    json.push_back('}');
    send_json(sock, 200, "OK", json);
  } else if (req.method == "GET" && req.path == "/api/native/catalog/status") {
    send_json(sock, 200, "OK", catalogSync.get_status_json());
  } else if (req.method == "POST" && req.path == "/api/native/catalog/sync") {
    std::string baseUrl = json_get_string(req.body, "baseUrl").value_or("");
    std::vector<std::string> platforms =
        json_get_string_array(req.body, "platforms").value_or(std::vector<std::string>{});
    CatalogSyncResponse syncResp = catalogSync.sync(baseUrl, platforms);
    const char* statusText = syncResp.httpStatus == 200 ? "OK" : "Bad Request";
    send_json(sock, syncResp.httpStatus, statusText, syncResp.bodyJson);
  } else if (req.method == "DELETE" && req.path == "/api/native/catalog") {
    int removed = catalogSync.clear_cache();
    send_json(sock, 200, "OK", "{\"ok\":true,\"removed\":" + std::to_string(removed) + "}");
  } else if (req.method == "GET" && req.path.rfind("/api/native/catalog/", 0) == 0) {
    std::string platform = url_decode(req.path.substr(std::strlen("/api/native/catalog/")), false);
    if (!catalogSync.is_valid_platform(platform)) {
      send_json(sock, 400, "Bad Request", "{\"ok\":false,\"error\":\"Unsupported platform catalog\"}");
    } else if (auto cachedJson = catalogSync.read_cached_catalog(platform)) {
      send_http_response(
          sock,
          200,
          "OK",
          "application/json; charset=utf-8",
          *cachedJson,
          "private, no-store",
          true);
    } else {
      send_json(sock, 404, "Not Found", "{\"ok\":false,\"error\":\"Catalog is not cached\"}");
    }
  } else if (req.method == "GET" && req.path == "/api/fs/list") {
    std::string requestedPath = parse_query_param(req.query, "path").value_or("");
    DirectoryListing listing = list_directory(requestedPath, cfg.rootDir);
    int status = listing.error.empty() ? 200 : 400;
    send_json(sock, status, status == 200 ? "OK" : "Bad Request", directory_listing_to_json(listing));
  } else if (req.method == "GET" && req.path == "/api/downloads") {
    send_json(sock, 200, "OK", download_list_to_json(manager.list_downloads()));
  } else if (req.method == "POST" && req.path == "/api/downloads") {
    DownloadRequest dlReq;
    dlReq.catalogId = json_get_string(req.body, "catalogId").value_or("ps1");
    dlReq.slug = json_get_string(req.body, "slug").value_or("item");
    dlReq.title = json_get_string(req.body, "title").value_or(dlReq.slug);
    dlReq.url = json_get_string(req.body, "url").value_or("");
    dlReq.format = json_get_string(req.body, "format").value_or(".bin");
    dlReq.targetDir = json_get_string(req.body, "targetDir").value_or(cfg.rootDir);
    dlReq.expectedBytes = json_get_int64(req.body, "sizeBytes").value_or(0);

    bool validUrl = dlReq.url.rfind("https://", 0) == 0 || dlReq.url.rfind("http://", 0) == 0;
    if (!validUrl || dlReq.targetDir.empty()) {
      send_json(sock, 400, "Bad Request", "{\"error\":\"Valid http/https url and targetDir are required\"}");
    } else if (!cfg.rootDir.empty() && !is_subpath_within(dlReq.targetDir, cfg.rootDir)) {
      send_json(sock, 403, "Forbidden", "{\"error\":\"targetDir must be inside configured rootDir\"}");
    } else {
      DownloadRecordSnapshot snap = manager.start_download(dlReq);
      send_json(sock, 201, "Created", "{\"item\":" + download_snapshot_to_json(snap) + "}");
    }
  } else if (req.path.rfind("/api/downloads/", 0) == 0) {
    std::string rest = req.path.substr(std::strlen("/api/downloads/"));
    size_t slash = rest.find('/');
    std::string id = url_decode(slash == std::string::npos ? rest : rest.substr(0, slash), false);
    std::string action = slash == std::string::npos ? "" : rest.substr(slash + 1);

    if (req.method == "POST" && action == "pause") {
      auto item = manager.pause_download(id);
      if (item) send_json(sock, 200, "OK", "{\"item\":" + download_snapshot_to_json(*item) + "}");
      else send_json(sock, 404, "Not Found", "{\"error\":\"Download not found\"}");
    } else if (req.method == "POST" && action == "resume") {
      auto item = manager.resume_download(id);
      if (item) send_json(sock, 200, "OK", "{\"item\":" + download_snapshot_to_json(*item) + "}");
      else send_json(sock, 404, "Not Found", "{\"error\":\"Download not found\"}");
    } else if (req.method == "POST" && action == "install") {
      InstallArchiveRequest opts;
      opts.deleteArchive = json_get_bool(req.body, "deleteArchive").value_or(true);
      opts.flattenSingleRoot = json_get_bool(req.body, "flattenSingleRoot").value_or(true);
      opts.targetDir = json_get_string(req.body, "targetDir").value_or("");
      if (!opts.targetDir.empty() && !cfg.rootDir.empty() && !is_subpath_within(opts.targetDir, cfg.rootDir)) {
        send_json(sock, 403, "Forbidden", "{\"error\":\"targetDir must be inside configured rootDir\"}");
      } else {
        auto item = manager.install_archive(id, opts);
        if (item) send_json(sock, 200, "OK", "{\"item\":" + download_snapshot_to_json(*item) + "}");
        else send_json(sock, 404, "Not Found", "{\"error\":\"Download not found\"}");
      }
    } else if (req.method == "DELETE" && action.empty()) {
      if (manager.cancel_download(id)) {
        send_json(sock, 200, "OK", "{\"ok\":true}");
      } else {
        send_json(sock, 404, "Not Found", "{\"error\":\"Download not found\"}");
      }
    } else {
      send_json(sock, 404, "Not Found", "{\"error\":\"Unknown downloads endpoint\"}");
    }
  } else if (req.path == "/api" || req.path.rfind("/api/", 0) == 0) {
    send_json(sock, 404, "Not Found", "{\"error\":\"Not found\"}");
  } else if ((req.method == "GET" || req.method == "HEAD") && try_serve_static(sock, cfg, req.method, req.path)) {
    // Served static asset
  } else {
    send_json(sock, 404, "Not Found", "{\"error\":\"Not found\"}");
  }

  close_socket(sock);
}

void print_usage(const char* argv0) {
  std::cout << "Usage: " << argv0
            << " [--port=9021] [--host=127.0.0.1] [--static-dir=PATH] [--root-dir=PATH]"
            << " [--catalog-cache-dir=PATH] [--open | --no-open]\n";
}

}  // namespace

int main(int argc, char* argv[]) {
  ServerConfig cfg;
  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--help" || arg == "-h") {
      print_usage(argv[0]);
      return 0;
    } else if (arg == "--open") {
      cfg.openMode = OpenMode::ForceOpen;
    } else if (arg == "--no-open") {
      cfg.openMode = OpenMode::NoOpen;
    } else if (arg.rfind("--port=", 0) == 0) {
      cfg.port = std::stoi(arg.substr(7));
    } else if (arg == "--port" && i + 1 < argc) {
      cfg.port = std::stoi(argv[++i]);
    } else if (arg.rfind("--host=", 0) == 0) {
      cfg.host = arg.substr(7);
    } else if (arg == "--host" && i + 1 < argc) {
      cfg.host = argv[++i];
    } else if (arg.rfind("--static-dir=", 0) == 0) {
      cfg.staticDir = arg.substr(13);
    } else if (arg == "--static-dir" && i + 1 < argc) {
      cfg.staticDir = argv[++i];
    } else if (arg.rfind("--root-dir=", 0) == 0) {
      cfg.rootDir = arg.substr(11);
    } else if (arg == "--root-dir" && i + 1 < argc) {
      cfg.rootDir = argv[++i];
    } else if (arg.rfind("--catalog-cache-dir=", 0) == 0) {
      cfg.catalogCacheDir = arg.substr(20);
    } else if (arg == "--catalog-cache-dir" && i + 1 < argc) {
      cfg.catalogCacheDir = argv[++i];
    } else {
      std::cerr << "Unknown argument: " << arg << "\n";
      print_usage(argv[0]);
      return 1;
    }
  }

  if (cfg.staticDir.empty()) {
    cfg.staticDir = auto_detect_static_dir();
  }

  init_networking();
#ifdef EMUSTORE_USE_CURL
  curl_global_init(CURL_GLOBAL_DEFAULT);
#endif

  std::signal(SIGINT, handle_signal);
  std::signal(SIGTERM, handle_signal);

  socket_t listenSock = socket(AF_INET, SOCK_STREAM, 0);
  if (listenSock == INVALID_SOCK) {
    std::cerr << "Failed creating TCP socket.\n";
#ifdef EMUSTORE_USE_CURL
    curl_global_cleanup();
#endif
    cleanup_networking();
    return 1;
  }

#ifdef _WIN32
  #ifndef SO_EXCLUSIVEADDRUSE
    #define SO_EXCLUSIVEADDRUSE ((int)(~SO_REUSEADDR))
  #endif
  int exclusive = 1;
  setsockopt(listenSock, SOL_SOCKET, SO_EXCLUSIVEADDRUSE, reinterpret_cast<const char*>(&exclusive), sizeof(exclusive));
#else
  int reuse = 1;
  setsockopt(listenSock, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&reuse), sizeof(reuse));
#endif

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(cfg.port));
  if (inet_pton(AF_INET, cfg.host.c_str(), &addr.sin_addr) != 1) {
    std::cerr << "Invalid bind IP address: " << cfg.host << "\n";
    close_socket(listenSock);
#ifdef EMUSTORE_USE_CURL
    curl_global_cleanup();
#endif
    cleanup_networking();
    return 1;
  }

  if (bind(listenSock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
#ifdef _WIN32
    int bindErr = WSAGetLastError();
    bool portInUse = (bindErr == WSAEADDRINUSE || bindErr == WSAEACCES);
#else
    bool portInUse = (errno == EADDRINUSE);
#endif
    close_socket(listenSock);

    if (portInUse && probe_existing_daemon_health(cfg.host, cfg.port)) {
      std::cout << "EmuStore daemon is already running on http://" << cfg.host << ":" << cfg.port << ".\n";
#ifdef _WIN32
      if (cfg.openMode != OpenMode::NoOpen) {
        std::string launchHost = (cfg.host == "0.0.0.0") ? "127.0.0.1" : cfg.host;
        std::string launchUrl = "http://" + launchHost + ":" + std::to_string(cfg.port) + "/tr/";
        launch_windows_app_window(launchUrl);
#ifdef EMUSTORE_USE_CURL
        curl_global_cleanup();
#endif
        cleanup_networking();
        return 0;
      }
#endif
      std::cerr << "Port " << cfg.port << " is already in use by an existing EmuStore daemon.\n";
    } else {
      std::cerr << "Failed binding to " << cfg.host << ":" << cfg.port
                << (portInUse ? " (port already in use)" : "") << "\n";
    }
#ifdef EMUSTORE_USE_CURL
    curl_global_cleanup();
#endif
    cleanup_networking();
    return 1;
  }

  if (listen(listenSock, 32) != 0) {
    std::cerr << "Failed listening on port " << cfg.port << "\n";
    close_socket(listenSock);
#ifdef EMUSTORE_USE_CURL
    curl_global_cleanup();
#endif
    cleanup_networking();
    return 1;
  }

  g_listenSocket = listenSock;
  DownloadManager manager;
  CatalogSyncService catalogSync(cfg.catalogCacheDir);

  std::cout << "EmuStore native daemon listening on http://" << cfg.host << ":" << cfg.port
            << " (" << emustore_platform_name() << ")";
  if (!cfg.staticDir.empty()) {
    std::cout << " [static: " << cfg.staticDir << "]";
  }
  std::cout << " [catalog-cache: " << catalogSync.cache_dir() << "]\n" << std::flush;

#ifdef _WIN32
  if (cfg.openMode == OpenMode::ForceOpen || (cfg.openMode == OpenMode::Auto && !cfg.staticDir.empty())) {
    std::string launchHost = (cfg.host == "0.0.0.0") ? "127.0.0.1" : cfg.host;
    std::string launchUrl = "http://" + launchHost + ":" + std::to_string(cfg.port) + "/tr/";
    std::thread([launchUrl]() {
      std::this_thread::sleep_for(std::chrono::milliseconds(150));
      launch_windows_app_window(launchUrl);
    }).detach();
  }
#endif

  while (g_running.load()) {
    socket_t clientSock = accept(listenSock, nullptr, nullptr);
    if (clientSock == INVALID_SOCK) {
      if (!g_running.load()) break;
      continue;
    }
    std::thread([clientSock, &cfg, &manager, &catalogSync]() {
      handle_client(clientSock, cfg, manager, catalogSync);
    }).detach();
  }

  manager.shutdown();
  if (g_listenSocket != INVALID_SOCK) {
    close_socket(g_listenSocket);
    g_listenSocket = INVALID_SOCK;
  }

#ifdef EMUSTORE_USE_CURL
  curl_global_cleanup();
#endif
  cleanup_networking();
  return 0;
}
