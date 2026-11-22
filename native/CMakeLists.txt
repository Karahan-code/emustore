cmake_minimum_required(VERSION 3.16)
project(emustore_daemon VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(EMUSTORE_FETCH_MINIZ "Fetch single-file miniz archive library via CMake FetchContent" OFF)

find_package(Threads REQUIRED)
find_package(CURL QUIET)

add_executable(emustore-daemon
  src/main.cpp
  src/fs_service.cpp
  src/zip_extractor.cpp
  src/download_manager.cpp
)

target_include_directories(emustore-daemon PRIVATE src)
target_link_libraries(emustore-daemon PRIVATE Threads::Threads)

if(EMUSTORE_FETCH_MINIZ)
  include(FetchContent)
  FetchContent_Declare(
    miniz
    GIT_REPOSITORY https://github.com/richgel999/miniz.git
    GIT_TAG 3.0.2
  )
  FetchContent_MakeAvailable(miniz)
  target_compile_definitions(emustore-daemon PRIVATE EMUSTORE_USE_MINIZ=1)
  target_link_libraries(emustore-daemon PRIVATE miniz)
else()
  find_package(ZLIB REQUIRED)
  target_link_libraries(emustore-daemon PRIVATE ZLIB::ZLIB)
endif()

if(CURL_FOUND)
  message(STATUS "EmuStore daemon: using libcurl for HTTP transfers")
  target_compile_definitions(emustore-daemon PRIVATE EMUSTORE_USE_CURL=1)
  target_link_libraries(emustore-daemon PRIVATE CURL::libcurl)
elseif(WIN32)
  message(STATUS "EmuStore daemon: using WinHTTP fallback for HTTP transfers")
  target_link_libraries(emustore-daemon PRIVATE winhttp)
endif()

if(WIN32)
  target_link_libraries(emustore-daemon PRIVATE ws2_32)
endif()
