# EmuStore Native Daemon (`emustore-daemon`)

Self-contained C++17 local service and future embedded PS5 `eboot.bin` backend for EmuStore.

## Features
- **Embedded HTTP/1.1 Server (port `9021`):** Serves static UI assets (`--static-dir`) on the same origin alongside JSON REST APIs with CORS enabled.
- **Directory & Disk Space Browser (`GET /api/fs/list`):** Path sanitization with optional `--root-dir` containment and live free/total bytes (`GetDiskFreeSpaceExW` on Windows, `statvfs` on Linux/PS5).
- **Resumable Download Queue (`GET/POST /api/downloads`, `pause`, `resume`, `DELETE`):** Atomic `.tmp/<file>.part` staging, speed/progress tracking, automatic transition to `ready_to_install` for `.zip`/`.7z` archives and `installed` for direct files.
- **ZIP64 Streaming Extractor (`POST /api/downloads/:id/install`):** Uses `ZLIB` (or optional `miniz` via `-DEMUSTORE_FETCH_MINIZ=ON`), validates >= `2x` archive / uncompressed free space, enforces strict Zip-Slip traversal protection, verifies CRC-32, optionally flattens a single root directory, and deletes source `.zip` archives when `deleteArchive` is `true`.

## Build & Run on Windows (MSYS2 UCRT64 / CMake + Ninja)
```powershell
cmake -S native -B native/build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
.\native\build\emustore-daemon.exe --port 9021
```

Optional flags:
- `--port=9021` — Bind port (default `9021`)
- `--host=127.0.0.1` — Bind IP (default `127.0.0.1`)
- `--static-dir=.\out` — Serve static frontend assets on the same origin
- `--root-dir=D:\EmuStore` — Sandbox filesystem browsing and installs to a root folder

## Build & Run on Linux
```bash
sudo apt install build-essential cmake zlib1g-dev libcurl4-openssl-dev
cmake -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
./native/build/emustore-daemon --port 9021
```

## PS5 Payload SDK Cross-Compile (WSL2)
```bash
export PS5_PAYLOAD_SDK=/opt/ps5-payload-sdk
make -C native -f Makefile.ps5
```
PS5-specific syscalls and HTTP hooks are isolated behind `#ifdef __PS5__` / `#ifdef __PROSPERO__`.
