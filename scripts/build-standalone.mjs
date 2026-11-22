import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(projectRoot, "out");
const nativeDir = path.join(projectRoot, "native");
const nativeBuildDir = path.join(nativeDir, "build-release");
const isWindows = process.platform === "win32";
const exeName = isWindows ? "emustore-daemon.exe" : "emustore-daemon";
const distDir = path.join(projectRoot, "dist", isWindows ? "emustore-win" : `emustore-${process.platform}`);

const SYSTEM_DLL_NAMES = new Set([
  "kernel32.dll",
  "user32.dll",
  "gdi32.dll",
  "advapi32.dll",
  "shell32.dll",
  "ws2_32.dll",
  "crypt32.dll",
  "bcrypt.dll",
  "secur32.dll",
  "iphlpapi.dll",
  "wldap32.dll",
  "winhttp.dll",
  "ole32.dll",
  "oleaut32.dll",
  "rpcrt4.dll",
  "shlwapi.dll",
  "msvcrt.dll",
  "ucrtbase.dll",
  "ntdll.dll",
]);

function runStep(command, args, env = process.env, cwd = projectRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function findTool(executableName, extraDirs = []) {
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of [...extraDirs, ...pathEntries]) {
    const candidate = path.join(dir, executableName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function collectPEImports(binaryPath, objdumpPath) {
  const result = spawnSync(objdumpPath, ["-p", binaryPath], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Failed inspecting PE imports for ${binaryPath}`);
  }

  const dlls = [];
  for (const line of (result.stdout ?? "").split(/\r?\n/)) {
    const match = line.match(/DLL Name:\s*([^\s]+\.dll)\s*$/i);
    if (match) {
      dlls.push(match[1]);
    }
  }
  return dlls;
}

function bundleWindowsRuntimeDlls(exePath, targetDir, toolchainBinDir) {
  const objdumpName = isWindows ? "objdump.exe" : "objdump";
  const objdumpPath = findTool(objdumpName, toolchainBinDir ? [toolchainBinDir] : []);
  if (!objdumpPath) {
    console.warn("objdump not found; skipping automatic MinGW/UCRT DLL bundling.");
    return [];
  }

  const visited = new Set();
  const queue = [exePath];
  const bundled = [];

  while (queue.length > 0) {
    const currentBinary = queue.shift();
    const imports = collectPEImports(currentBinary, objdumpPath);

    for (const dllName of imports) {
      const lower = dllName.toLowerCase();
      if (visited.has(lower)) continue;
      visited.add(lower);

      if (lower.startsWith("api-ms-win-") || lower.startsWith("ext-ms-") || SYSTEM_DLL_NAMES.has(lower)) {
        continue;
      }

      const sourceDll = toolchainBinDir ? path.join(toolchainBinDir, dllName) : findTool(dllName);
      if (sourceDll && existsSync(sourceDll)) {
        const destDll = path.join(targetDir, path.basename(sourceDll));
        cpSync(sourceDll, destDll, { force: true });
        bundled.push(path.basename(sourceDll));
        queue.push(destDll);
      }
    }
  }

  return bundled.sort((left, right) => left.localeCompare(right));
}

function countFilesRecursive(dirPath) {
  let total = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += countFilesRecursive(full);
    else total += 1;
  }
  return total;
}

function main() {
  console.log("[1/4] Validating catalog...");
  runStep(process.execPath, [path.join(projectRoot, "scripts", "validate-catalog.mjs")]);

  console.log("[2/4] Building static Next.js export (out/)...");
  for (const stalePath of [
    path.join(projectRoot, ".next", "build"),
    path.join(projectRoot, ".next", "cache", "turbopack"),
    path.join(projectRoot, ".next", "turbopack"),
    path.join(projectRoot, ".next", "server"),
    path.join(projectRoot, ".next", "static"),
    outDir,
  ]) {
    rmSync(stalePath, { recursive: true, force: true });
  }
  runStep(process.execPath, [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "build"]);
  if (!existsSync(path.join(outDir, "tr", "index.html"))) {
    throw new Error("Static export did not produce out/tr/index.html.");
  }

  console.log("[3/4] Configuring & building native daemon (Release)...");
  const extraToolchainDirs = isWindows
    ? ["C:\\msys64\\ucrt64\\bin", "C:\\msys64\\mingw64\\bin"]
    : [];
  const cmakePath = findTool(isWindows ? "cmake.exe" : "cmake", extraToolchainDirs);
  if (!cmakePath) {
    throw new Error("CMake executable not found in PATH or C:\\msys64\\ucrt64\\bin.");
  }

  const gxxPath = findTool(isWindows ? "g++.exe" : "g++", extraToolchainDirs);
  const toolchainBinDir = gxxPath ? path.dirname(gxxPath) : path.dirname(cmakePath);
  const ninjaPath = findTool(isWindows ? "ninja.exe" : "ninja", [toolchainBinDir, ...extraToolchainDirs]);

  const buildEnv = {
    ...process.env,
    PATH: `${toolchainBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
  };

  const configureArgs = ["-S", nativeDir, "-B", nativeBuildDir, "-DCMAKE_BUILD_TYPE=Release"];
  if (ninjaPath) {
    configureArgs.push("-G", "Ninja");
  }
  runStep(cmakePath, configureArgs, buildEnv);
  runStep(cmakePath, ["--build", nativeBuildDir, "--config", "Release"], buildEnv);

  const builtExeCandidates = [
    path.join(nativeBuildDir, exeName),
    path.join(nativeBuildDir, "Release", exeName),
  ];
  const builtExe = builtExeCandidates.find((candidate) => existsSync(candidate));
  if (!builtExe) {
    throw new Error(`Built native binary not found in ${nativeBuildDir}`);
  }

  console.log(`[4/4] Assembling portable bundle at ${distDir}...`);
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });

  const distExe = path.join(distDir, exeName);
  cpSync(builtExe, distExe, { force: true });
  cpSync(outDir, path.join(distDir, "out"), { recursive: true });

  const bundledDlls = isWindows ? bundleWindowsRuntimeDlls(distExe, distDir, toolchainBinDir) : [];
  const staticFileCount = countFilesRecursive(path.join(distDir, "out"));

  console.log("");
  console.log(`Standalone bundle ready: ${distDir}`);
  console.log(`- Executable: ${distExe}`);
  console.log(`- Static assets: ${path.join(distDir, "out")} (${staticFileCount} files)`);
  if (isWindows) {
    console.log(`- Bundled DLLs (${bundledDlls.length}): ${bundledDlls.join(", ") || "none"}`);
  }
}

main();
