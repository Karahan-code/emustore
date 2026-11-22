#pragma once

#include <filesystem>
#include <string>

#ifdef _WIN32
  #ifndef WIN32_LEAN_AND_MEAN
    #define WIN32_LEAN_AND_MEAN
  #endif
  #ifndef NOMINMAX
    #define NOMINMAX
  #endif
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #include <windows.h>

  using socket_t = SOCKET;
  constexpr socket_t INVALID_SOCK = INVALID_SOCKET;

  inline void close_socket(socket_t sock) {
    if (sock != INVALID_SOCK) closesocket(sock);
  }

  inline void init_networking() {
    WSADATA wsa{};
    WSAStartup(MAKEWORD(2, 2), &wsa);
  }

  inline void cleanup_networking() {
    WSACleanup();
  }

  inline void set_socket_timeouts(socket_t sock, int timeoutMs) {
    DWORD tv = static_cast<DWORD>(timeoutMs);
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char*>(&tv), sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, reinterpret_cast<const char*>(&tv), sizeof(tv));
  }

  inline std::wstring utf8_to_wide(const std::string& utf8) {
    if (utf8.empty()) return {};
    int needed = MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
    if (needed <= 0) return {};
    std::wstring out(static_cast<size_t>(needed), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), out.data(), needed);
    return out;
  }

  inline std::string wide_to_utf8(const std::wstring& wide) {
    if (wide.empty()) return {};
    int needed = WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
    if (needed <= 0) return {};
    std::string out(static_cast<size_t>(needed), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide.data(), static_cast<int>(wide.size()), out.data(), needed, nullptr, nullptr);
    return out;
  }

  inline std::filesystem::path to_fs_path(const std::string& utf8) {
    return std::filesystem::path(utf8_to_wide(utf8));
  }

  inline std::string from_fs_path(const std::filesystem::path& path) {
    return wide_to_utf8(path.wstring());
  }
#else
  #include <arpa/inet.h>
  #include <csignal>
  #include <netinet/in.h>
  #include <sys/socket.h>
  #include <sys/time.h>
  #include <unistd.h>

  using socket_t = int;
  constexpr socket_t INVALID_SOCK = -1;

  inline void close_socket(socket_t sock) {
    if (sock >= 0) ::close(sock);
  }

  inline void init_networking() {
    std::signal(SIGPIPE, SIG_IGN);
  }

  inline void cleanup_networking() {}

  inline void set_socket_timeouts(socket_t sock, int timeoutMs) {
    timeval tv{};
    tv.tv_sec = timeoutMs / 1000;
    tv.tv_usec = (timeoutMs % 1000) * 1000;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
  }

  inline std::filesystem::path to_fs_path(const std::string& utf8) {
    return std::filesystem::path(utf8);
  }

  inline std::string from_fs_path(const std::filesystem::path& path) {
    return path.string();
  }
#endif

inline const char* emustore_platform_name() {
#if defined(__PS5__) || defined(__PROSPERO__)
  return "ps5";
#elif defined(_WIN32)
  return "windows";
#elif defined(__APPLE__)
  return "macos";
#else
  return "linux";
#endif
}
