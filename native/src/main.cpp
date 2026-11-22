#include <atomic>
#include <cctype>
#include <csignal>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>

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

struct ServerConfig {
  std::string host = "127.0.0.1";
  int port = 9021;
  std::string staticDir;
  std::string rootDir;
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
  if (ext == ".json") return "application/json; charset=utf-8";
  if (ext == ".png") return "image/png";
  if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
  if (ext == ".webp") return "image/webp";
  if (ext == ".svg") return "image/svg+xml";
  if (ext == ".ico") return "image/x-icon";
  if (ext == ".woff2") return "font/woff2";
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
    const std::string& body) {
  std::ostringstream hdr;
  hdr << "HTTP/1.1 " << status << " " << statusText << "\r\n";
  hdr << "Access-Control-Allow-Origin: *\r\n";
  hdr << "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n";
  hdr << "Access-Control-Allow-Headers: Content-Type, Accept\r\n";
  hdr << "Cache-Control: private, no-store\r\n";
  if (!contentType.empty()) {
    hdr << "Content-Type: " << contentType << "\r\n";
  }
  hdr << "Content-Length: " << body.size() << "\r\n";
  hdr << "Connection: close\r\n\r\n";

  std::string headerStr = hdr.str();
  send_all(sock, headerStr.data(), headerStr.size());
  if (!body.empty()) {
    send_all(sock, body.data(), body.size());
  }
}

void send_json(socket_t sock, int status, const std::string& statusText, const std::string& json) {
  send_http_response(sock, status, statusText, "application/json; charset=utf-8", json);
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

bool try_serve_static(socket_t sock, const ServerConfig& cfg, const std::string& urlPath) {
  if (cfg.staticDir.empty()) return false;

  std::string decoded = url_decode(urlPath, false);
  if (decoded.find('\0') != std::string::npos || decoded.find("..") != std::string::npos) {
    send_json(sock, 400, "Bad Request", "{\"error\":\"Invalid static path\"}");
    return true;
  }

  while (!decoded.empty() && decoded.front() == '/') {
    decoded.erase(decoded.begin());
  }
  if (decoded.empty()) decoded = "index.html";

  std::error_code ec;
  fs::path staticRoot = fs::weakly_canonical(to_fs_path(cfg.staticDir), ec);
  if (ec || !fs::exists(staticRoot, ec)) return false;

  fs::path candidate = staticRoot / to_fs_path(decoded);
  if (fs::is_directory(candidate, ec)) {
    candidate /= "index.html";
  } else if (!fs::exists(candidate, ec) && candidate.extension().empty()) {
    fs::path htmlCandidate = to_fs_path(from_fs_path(candidate) + ".html");
    if (fs::is_regular_file(htmlCandidate, ec)) candidate = htmlCandidate;
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
  send_http_response(sock, 200, "OK", mime_type_for_path(from_fs_path(canonCandidate)), content);
  return true;
}

void handle_client(socket_t sock, const ServerConfig& cfg, DownloadManager& manager) {
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
  } else if ((req.method == "GET" || req.method == "HEAD") && try_serve_static(sock, cfg, req.path)) {
    // Served static asset
  } else {
    send_json(sock, 404, "Not Found", "{\"error\":\"Not found\"}");
  }

  close_socket(sock);
}

void print_usage(const char* argv0) {
  std::cout << "Usage: " << argv0 << " [--port=9021] [--host=127.0.0.1] [--static-dir=PATH] [--root-dir=PATH]\n";
}

}  // namespace

int main(int argc, char* argv[]) {
  ServerConfig cfg;
  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--help" || arg == "-h") {
      print_usage(argv[0]);
      return 0;
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
    } else {
      std::cerr << "Unknown argument: " << arg << "\n";
      print_usage(argv[0]);
      return 1;
    }
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
    return 1;
  }

  int reuse = 1;
  setsockopt(listenSock, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&reuse), sizeof(reuse));

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(cfg.port));
  if (inet_pton(AF_INET, cfg.host.c_str(), &addr.sin_addr) != 1) {
    std::cerr << "Invalid bind IP address: " << cfg.host << "\n";
    close_socket(listenSock);
    return 1;
  }

  if (bind(listenSock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
    std::cerr << "Failed binding to " << cfg.host << ":" << cfg.port << "\n";
    close_socket(listenSock);
    return 1;
  }

  if (listen(listenSock, 32) != 0) {
    std::cerr << "Failed listening on port " << cfg.port << "\n";
    close_socket(listenSock);
    return 1;
  }

  g_listenSocket = listenSock;
  DownloadManager manager;

  std::cout << "EmuStore native daemon listening on http://" << cfg.host << ":" << cfg.port
            << " (" << emustore_platform_name() << ")\n" << std::flush;

  while (g_running.load()) {
    socket_t clientSock = accept(listenSock, nullptr, nullptr);
    if (clientSock == INVALID_SOCK) {
      if (!g_running.load()) break;
      continue;
    }
    std::thread([clientSock, &cfg, &manager]() {
      handle_client(clientSock, cfg, manager);
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
