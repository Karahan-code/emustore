#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

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
  #include <shellapi.h>

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

  inline std::filesystem::path get_executable_dir() {
    std::wstring buf(512, L'\0');
    for (;;) {
      DWORD len = GetModuleFileNameW(nullptr, buf.data(), static_cast<DWORD>(buf.size()));
      if (len == 0) return {};
      if (len < buf.size()) {
        buf.resize(len);
        return std::filesystem::path(buf).parent_path();
      }
      if (buf.size() >= 32768) return {};
      buf.resize(buf.size() * 2);
    }
  }

  inline bool launch_windows_app_window(const std::string& urlUtf8) {
    if (urlUtf8.empty()) return false;
    std::wstring wideUrl = utf8_to_wide(urlUtf8);
    if (wideUrl.empty()) return false;

    auto readEnvDir = [](const wchar_t* name) -> std::filesystem::path {
      DWORD len = GetEnvironmentVariableW(name, nullptr, 0);
      if (len == 0) return {};
      std::wstring val(len, L'\0');
      DWORD written = GetEnvironmentVariableW(name, val.data(), len);
      if (written == 0) return {};
      val.resize(written);
      return std::filesystem::path(val);
    };

    std::filesystem::path pfx86 = readEnvDir(L"ProgramFiles(x86)");
    std::filesystem::path pf = readEnvDir(L"ProgramFiles");
    std::filesystem::path localApp = readEnvDir(L"LOCALAPPDATA");

    std::vector<std::filesystem::path> browsers;
    if (!pfx86.empty()) browsers.push_back(pfx86 / L"Microsoft" / L"Edge" / L"Application" / L"msedge.exe");
    if (!pf.empty()) browsers.push_back(pf / L"Microsoft" / L"Edge" / L"Application" / L"msedge.exe");
    if (!pf.empty()) browsers.push_back(pf / L"Google" / L"Chrome" / L"Application" / L"chrome.exe");
    if (!pfx86.empty()) browsers.push_back(pfx86 / L"Google" / L"Chrome" / L"Application" / L"chrome.exe");
    if (!localApp.empty()) browsers.push_back(localApp / L"Google" / L"Chrome" / L"Application" / L"chrome.exe");

    std::error_code ec;
    for (const auto& browser : browsers) {
      if (!std::filesystem::is_regular_file(browser, ec)) continue;
      std::wstring cmd = L"\"" + browser.wstring() + L"\" --app=" + wideUrl + L" --window-size=1280,800";
      std::vector<wchar_t> mutableCmd(cmd.begin(), cmd.end());
      mutableCmd.push_back(L'\0');

      STARTUPINFOW si{};
      si.cb = sizeof(si);
      PROCESS_INFORMATION pi{};
      if (CreateProcessW(nullptr, mutableCmd.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        return true;
      }
    }

    HINSTANCE res = ShellExecuteW(nullptr, L"open", wideUrl.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    return reinterpret_cast<intptr_t>(res) > 32;
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

  inline std::filesystem::path get_executable_dir() {
#if defined(__linux__)
    std::string buf(1024, '\0');
    ssize_t len = ::readlink("/proc/self/exe", buf.data(), buf.size() - 1);
    if (len > 0) {
      buf.resize(static_cast<size_t>(len));
      return std::filesystem::path(buf).parent_path();
    }
#endif
    return {};
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
