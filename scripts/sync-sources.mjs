import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const registrySource = readFileSync(path.join(projectRoot, "lib/catalog/platforms.ts"), "utf8");
const registryModule = ts.transpileModule(registrySource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { PLATFORM_CATALOGS, PLATFORM_CATALOG_IDS } = await import(
  `data:text/javascript;base64,${Buffer.from(registryModule).toString("base64")}`
);

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) EmuStore/0.1 Chrome/126.0.0.0 Safari/537.36";

const BYTES_PER_MB = 1024 * 1024;

const DEFAULT_MIN_MB_BY_PLATFORM = {
  ps1: 10,
  ps2: 50,
  ps3: 100,
  switch: 100,
  wii: 50,
  wiiu: 50,
};

const DISALLOWED_PATTERNS = [
  /\(\s*demo\s*\)/i,
  /\(\s*beta(?:\s*\d+)?\s*\)/i,
  /\(\s*proto(?:type)?(?:\s*\d+)?\s*\)/i,
  /\(\s*sample\s*\)/i,
  /\(\s*unl(?:icensed)?\s*\)/i,
  /\baction\s+replay\b/i,
  /\bgameshark\b/i,
  /\bcodebreaker\b/i,
  /\bcheat\b/i,
  /\br\.?\s*g\.?\s*mechanics\b/i,
  /\bfitgirl\b/i,
  /\bdodi\b/i,
  /\b1c\b/i,
  /\bgame\s*cube\b/i,
  /\bgamecube\b/i,
  /\bgc\b/i,
  /\bpc[\s-]*dvd\b/i,
  /\breview\b/i,
];

const NON_GAME_PRIMARY_PATTERN =
  /\b(?:ost|soundtrack|original\s+soundtrack|music\s+cd|audio\s+cd|bgm|manual|instruction\s+manual|booklet|strategy\s+guide|official\s+guide|artbook|art\s+book|trailer|commercial|promo|promotional|magazine|cover\s+scan|box\s+art|patch|translation\s+patch|xdelta|ips\s+patch|bps\s+patch|update\s+only|title\s+update|game\s+update|patch\s+only|dlc\s+only|save\s*file|save\s*data|save\s*game|savedata|savegame|memory\s+card|trainer|firmware|bios|r\s*g\s*mechanics|rg\s*mechanics|fitgirl|dodi|1c|game\s*cube|gamecube|pc\s*dvd|review)\b/i;

const NON_GAME_FILENAME_PATTERN =
  /\b(?:ost|soundtrack|manual|booklet|guide|artbook|trailer|promo|patch|update|dlc|save\s*file|savedata|savegame|memory\s+card|firmware|bios|r\s*g\s*mechanics|rg\s*mechanics|fitgirl|dodi|1c|game\s*cube|gamecube|gc|pc\s*dvd|review)\b/i;

const NON_GAME_DESCRIPTION_PATTERN =
  /\b(?:original\s+soundtrack|official\s+soundtrack|game\s+soundtrack|soundtrack\s+(?:rip|cd|album|collection)|ost\s+(?:rip|cd|album)|instruction\s+manual|game\s+manual|user\s+manual|manual\s+scan|strategy\s+guide|official\s+trailer|update\s+only|patch\s+only|dlc\s+only|save\s+file|memory\s+card\s+save|dosbox|ms\s*dos\s+(?:version|port|game|release)|pc\s+(?:version|port|release)\s+of)\b/i;

const COMMON_WRONG_PLATFORM_PATTERN =
  /\b(?:msdos|ms\s*dos|dos|dosbox|pc|pc\s*dvd|ibm\s+pc|windows|win32|win64|win95|win98|winxp|macos|mac\s+os|linux|amiga|atari|c64|commodore|zx\s+spectrum|nes|famicom|snes|super\s+nintendo|n64|nintendo\s+64|game\s*cube|gamecube|gcn|gc|game\s+boy|gameboy|gba|gbc|nds|nintendo\s+ds|3ds|nintendo\s+3ds|sega\s+genesis|mega\s+drive|dreamcast|sega\s+saturn|master\s+system|game\s+gear|xbox|xbox\s*360|xbox\s+one|ps4|playstation\s*4|ps5|playstation\s*5|psp|playstation\s+portable|ps\s*vita|psvita|android|ios)\b/i;

const PS1_SIDECAR_EXTENSIONS = new Set([".cue", ".ccd", ".sub"]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z"]);
const ARCHIVE_FALLBACK_MIN_BYTES = 50 * BYTES_PER_MB;
const WII_SINGLE_LAYER_ISO_BYTES = 4_699_979_776;
const WII_DUAL_LAYER_ISO_BYTES = 8_511_160_320;
const WII_ISO_SIZE_TOLERANCE_BYTES = 16 * BYTES_PER_MB;
const REGION_TAG_PATTERN =
  /[\[(]\s*(?:usa|europe|world|japan|eur|pal|us|jp|jpn)(?:\s*[,/]\s*(?:usa|europe|world|japan|eur|pal|us|jp|jpn))*\s*[\])]/i;

const FORMAT_SCORE_BY_PLATFORM = {
  ps1: { ".chd": 1060, ".zip": 1045, ".pbp": 1035, ".iso": 1025, ".7z": 1015, ".img": 20, ".bin": 0 },
  ps2: { ".chd": 1060, ".iso": 1050, ".zip": 1035, ".cso": 1030, ".zso": 1030, ".7z": 1015, ".elf": 100 },
  ps3: { ".iso": 1060, ".pkg": 1050, ".zip": 1035, ".7z": 1015 },
  switch: { ".nsp": 1060, ".xci": 1050, ".zip": 1035, ".7z": 1015, ".nro": 200, ".nso": 100 },
  wii: { ".wbfs": 1060, ".iso": 1050, ".ciso": 1040, ".gcz": 1040, ".zip": 1030, ".7z": 1015, ".dol": 100 },
  wiiu: { ".wua": 1060, ".wux": 1050, ".wud": 1045, ".zip": 1035, ".7z": 1015, ".wuhb": 400, ".rpx": 100 },
};

const ARCHIVE_PLATFORM_RULES = {
  ps1: {
    searchClause: '("PlayStation" OR "PlayStation 1" OR "Sony PlayStation" OR PS1 OR PSX OR PSOne)',
    strongFileExtensions: new Set([".chd", ".pbp", ".iso"]),
    primaryPositive:
      /\b(?:ps1|psx|psone|ps\s*1|playstation\s*1|playstation\s+one|psxredump|sonyplaystation)\b|\bplaystation\b(?!\s*(?:2|3|4|5|portable|vita|psp))/i,
    descriptionPositive:
      /\b(?:ps1|psx|psone|ps\s*1|playstation\s*1|playstation\s+one|sony\s+playstation(?!\s*(?:2|3|4|5|portable|vita|psp)))\b/i,
    otherConsolesPattern:
      /\b(?:ps2|ps\s*2|playstation\s*2|ps3|ps\s*3|playstation\s*3|nintendo\s+switch|nsw|wii|wii\s*u|wiiu)\b/i,
  },
  ps2: {
    searchClause: '("PlayStation 2" OR PS2)',
    strongFileExtensions: new Set([".chd", ".iso", ".cso", ".zso"]),
    primaryPositive: /\b(?:ps2|ps\s*2|playstation\s*2|ps2redump)\b/i,
    descriptionPositive: /\b(?:ps2|ps\s*2|playstation\s*2)\b/i,
    otherConsolesPattern:
      /\b(?:ps1|psx|psone|ps\s*1|playstation\s*1|playstation\s+one|ps3|ps\s*3|playstation\s*3|nintendo\s+switch|nsw|wii|wii\s*u|wiiu)\b/i,
  },
  ps3: {
    searchClause: '("PlayStation 3" OR PS3)',
    strongFileExtensions: new Set([".pkg", ".iso"]),
    primaryPositive: /\b(?:ps3|ps\s*3|playstation\s*3|ps3redump)\b/i,
    descriptionPositive: /\b(?:ps3|ps\s*3|playstation\s*3)\b/i,
    otherConsolesPattern:
      /\b(?:ps1|psx|psone|ps\s*1|playstation\s*1|playstation\s+one|ps2|ps\s*2|playstation\s*2|nintendo\s+switch|nsw|wii|wii\s*u|wiiu)\b/i,
  },
  switch: {
    searchClause: '("Nintendo Switch" OR NSW OR XCI OR NSP)',
    strongFileExtensions: new Set([".nsp", ".xci"]),
    primaryPositive: /\b(?:nintendo\s+switch|switch|nsw)\b/i,
    descriptionPositive: /\b(?:nintendo\s+switch|switch\s+(?:nsp|xci|rom|game|edition|version))\b/i,
    otherConsolesPattern:
      /\b(?:ps1|psx|psone|ps\s*1|playstation\s*1|ps2|ps\s*2|playstation\s*2|ps3|ps\s*3|playstation\s*3|wii|wii\s*u|wiiu)\b/i,
  },
  wii: {
    searchClause: '("Nintendo Wii" OR Wii)',
    strongFileExtensions: new Set([".wbfs", ".iso", ".ciso", ".gcz"]),
    primaryPositive: /\b(?:nintendo\s+wii|wii)\b(?!\s*u\b)/i,
    descriptionPositive: /\b(?:nintendo\s+wii|wii\s+(?:iso|wbfs|rvz|rom|game|disc|edition|version))\b/i,
    otherConsolesPattern:
      /\b(?:ps1|psx|psone|ps\s*1|playstation\s*1|ps2|ps\s*2|playstation\s*2|ps3|ps\s*3|playstation\s*3|nintendo\s+switch|nsw|wii\s*u|wiiu)\b/i,
  },
  wiiu: {
    searchClause: '("Wii U" OR WiiU OR "Nintendo Wii U")',
    strongFileExtensions: new Set([".wua", ".wux", ".wud", ".wuhb"]),
    primaryPositive: /\b(?:wii\s*u|wiiu|nintendo\s+wii\s*u)\b/i,
    descriptionPositive: /\b(?:wii\s*u|wiiu|nintendo\s+wii\s*u)\b/i,
    otherConsolesPattern:
      /\b(?:ps1|psx|psone|ps\s*1|playstation\s*1|ps2|ps\s*2|playstation\s*2|ps3|ps\s*3|playstation\s*3|nintendo\s+switch|nsw)\b/i,
  },
};

const ROMAN_MAP = new Map([
  ["ii", "2"],
  ["iii", "3"],
  ["iv", "4"],
  ["v", "5"],
  ["vi", "6"],
  ["vii", "7"],
  ["viii", "8"],
  ["ix", "9"],
  ["x", "10"],
]);

const REGION_MATCHERS = {
  europe: /\b(?:europe|eur|pal|e)\b/i,
  usa: /\b(?:usa|us|u)\b/i,
  world: /\b(?:world|w)\b/i,
  japan: /\b(?:japan|jp|jpn|j)\b/i,
};

function printUsage() {
  console.log(
    "Usage: npm run sync:sources -- --platform=<ps1|ps2|ps3|switch|wii|wiiu|all> " +
      "[--index-url=https://...] [--url-file=path] [--search-archive] [--append] " +
      "[--region-priority=Europe,USA,World,Japan] [--min-mb=N] [--allow-raw-bin] [--limit=N] [--delay-ms=1500] [--dry-run] [--overwrite]",
  );
  console.log("Matches and live-verifies download links into data/catalog/*.json.");
  console.log("Use --append to add new mirrors (Pixeldrain, Vikingfile, open directories, Archive.org) to games that already have sources[].");
  console.log("Default --min-mb thresholds: ps1=10, ps2=50, ps3=100, switch=100, wii=50, wiiu=50.");
  console.log("PS1 raw .bin files are excluded from auto-sync unless --allow-raw-bin is passed (with companion .cue).");
}

function parseArgs(argv) {
  let platformArg = null;
  let indexUrl = null;
  let urlFile = null;
  let searchArchive = false;
  let append = false;
  let regionPriority = ["europe", "usa", "world", "japan"];
  let minMb = null;
  let allowRawBin = false;
  let limit = null;
  let delayMs = 1500;
  let dryRun = false;
  let overwrite = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--search-archive") {
      searchArchive = true;
    } else if (arg === "--append") {
      append = true;
    } else if (arg === "--allow-raw-bin") {
      allowRawBin = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--overwrite") {
      overwrite = true;
    } else if (arg.startsWith("--platform=")) {
      const val = arg.slice("--platform=".length).trim().toLowerCase();
      if (val !== "all" && !PLATFORM_CATALOG_IDS.includes(val)) {
        throw new Error(`Invalid --platform "${val}". Expected all or one of: ${PLATFORM_CATALOG_IDS.join(", ")}.`);
      }
      platformArg = val;
    } else if (arg.startsWith("--index-url=")) {
      indexUrl = arg.slice("--index-url=".length).trim();
    } else if (arg.startsWith("--url-file=")) {
      urlFile = arg.slice("--url-file=".length).trim();
    } else if (arg.startsWith("--region-priority=")) {
      regionPriority = arg
        .slice("--region-priority=".length)
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg.startsWith("--min-mb=")) {
      const raw = arg.slice("--min-mb=".length).trim();
      const parsed = Number(raw);
      if (raw.length === 0 || !Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Invalid --min-mb value. Expected a non-negative number.");
      }
      minMb = parsed;
    } else if (arg.startsWith("--limit=")) {
      const parsed = Number(arg.slice("--limit=".length));
      if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new Error("Invalid --limit value. Expected a positive integer.");
      }
      limit = parsed;
    } else if (arg.startsWith("--delay-ms=")) {
      const parsed = Number(arg.slice("--delay-ms=".length));
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 60000) {
        throw new Error("Invalid --delay-ms value. Expected an integer between 0 and 60000.");
      }
      delayMs = parsed;
    } else {
      throw new Error(`Unknown option "${arg}". Run with --help for usage.`);
    }
  }

  return {
    platformArg,
    indexUrl,
    urlFile,
    searchArchive,
    append,
    regionPriority,
    minMb,
    allowRawBin,
    limit,
    delayMs,
    dryRun,
    overwrite,
    help,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createThrottler(delayMs) {
  let lastRequestAt = 0;
  return async function throttle() {
    const waitMs = Math.max(0, lastRequestAt + delayMs - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    lastRequestAt = Date.now();
  };
}

function isHtmlContentType(contentType) {
  if (typeof contentType !== "string") return false;
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return mime === "text/html" || mime === "application/xhtml+xml";
}

function parseContentRangeTotal(header) {
  if (typeof header !== "string") return null;
  const match = header.match(/\/(\d+)\s*$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatHumanSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes >= 1024 * BYTES_PER_MB) {
    return `${(bytes / (1024 * BYTES_PER_MB)).toFixed(2)} GB`;
  }
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function getAllowedExtensions(platformId) {
  return new Set(
    PLATFORM_CATALOGS[platformId].formats.flatMap((format) =>
      format.extensions.map((ext) => ext.toLowerCase()),
    ),
  );
}

function getFormatLabel(platformId, extension) {
  const normalized = String(extension ?? "").toLowerCase();
  const match = PLATFORM_CATALOGS[platformId].formats.find((format) =>
    format.extensions.some((candidate) => candidate.toLowerCase() === normalized),
  );
  return match ? match.label : null;
}

function extractResponseSizeBytes(response) {
  const contentRangeTotal = parseContentRangeTotal(response.headers.get("content-range"));
  if (contentRangeTotal) return contentRangeTotal;
  const contentLengthHeader = response.headers.get("content-length");
  const parsedLen = contentLengthHeader ? Number(contentLengthHeader) : Number.NaN;
  return Number.isSafeInteger(parsedLen) && parsedLen > 0 ? parsedLen : null;
}

function extractFilenameExtension(fileName) {
  const base = path.posix.basename(String(fileName ?? ""));
  const match = base.match(/(\.[a-z0-9]{1,12})$/i);
  return match ? match[1].toLowerCase() : null;
}

function extractUrlExtension(urlStr) {
  try {
    const url = new URL(urlStr);
    const seg = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    return extractFilenameExtension(seg);
  } catch {
    return null;
  }
}

function extractFilenameFromUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    return decodeURIComponent(url.pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

function toTextList(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toTextList(entry));
  }
  if (typeof value === "string") {
    return value ? [value] : [];
  }
  return [];
}

function normalizeMetadataText(value) {
  return toTextList(value)
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, " and ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-/.:;|,()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeArchiveUrl(candidateUrl, finalUrl) {
  const tryNormalizeArchive = (urlStr) => {
    if (!urlStr) return null;
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      if ((host === "archive.org" || host === "www.archive.org") && parsed.pathname.startsWith("/download/")) {
        return `https://archive.org${parsed.pathname}`;
      }
      if (host === "archive.org" || host.endsWith(".archive.org")) {
        const match = parsed.pathname.match(/^\/\d+\/items\/([^/]+)\/(.+)$/);
        if (match) {
          return `https://archive.org/download/${match[1]}/${match[2]}`;
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  return tryNormalizeArchive(candidateUrl) ?? tryNormalizeArchive(finalUrl) ?? finalUrl ?? candidateUrl;
}

function decodeUrlSafe(urlStr) {
  try {
    return decodeURIComponent(String(urlStr ?? ""));
  } catch {
    return String(urlStr ?? "");
  }
}

function isValidWiiIsoSize(sizeBytes) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return false;
  return (
    Math.abs(sizeBytes - WII_SINGLE_LAYER_ISO_BYTES) <= WII_ISO_SIZE_TOLERANCE_BYTES ||
    Math.abs(sizeBytes - WII_DUAL_LAYER_ISO_BYTES) <= WII_ISO_SIZE_TOLERANCE_BYTES
  );
}

function normalizeSourceUrl(urlStr) {
  if (typeof urlStr !== "string" || !urlStr.trim()) return "";
  const canonical = canonicalizeArchiveUrl(urlStr.trim(), urlStr.trim());
  try {
    const parsed = new URL(canonical);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return canonical.trim();
  }
}

function inspectProviderCandidate(rawUrl) {
  const defaultResult = {
    provider: "direct-mirror",
    deliveryMode: "direct",
    requiresVerification: false,
    fetchUrl: rawUrl,
    storedUrl: rawUrl,
    browserUrl: undefined,
    allowsExtensionlessUrl: false,
  };

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return defaultResult;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "archive.org" || host.endsWith(".archive.org")) {
    const canonical = canonicalizeArchiveUrl(rawUrl, rawUrl);
    return {
      provider: "archive.org",
      deliveryMode: "direct",
      requiresVerification: false,
      fetchUrl: rawUrl,
      storedUrl: canonical,
      browserUrl: undefined,
      allowsExtensionlessUrl: false,
    };
  }

  if (host === "pixeldrain.com" || host.endsWith(".pixeldrain.com")) {
    const shareMatch = parsed.pathname.match(/^\/u\/([A-Za-z0-9_-]+)/);
    const apiUrl = shareMatch ? `https://pixeldrain.com/api/file/${shareMatch[1]}?download` : rawUrl;
    return {
      provider: "pixeldrain.com",
      deliveryMode: "direct",
      requiresVerification: false,
      fetchUrl: apiUrl,
      storedUrl: apiUrl,
      browserUrl: shareMatch ? rawUrl : undefined,
      allowsExtensionlessUrl: true,
    };
  }

  if (
    host === "vikingfile.com" ||
    host.endsWith(".vikingfile.com") ||
    host === "vik1ngfile.site" ||
    host.endsWith(".vik1ngfile.site")
  ) {
    const isLandingPage = parsed.pathname.startsWith("/f/");
    return {
      provider: "vikingfile.com",
      deliveryMode: isLandingPage ? "browser_verify" : "direct",
      requiresVerification: isLandingPage,
      fetchUrl: rawUrl,
      storedUrl: rawUrl,
      browserUrl: isLandingPage ? rawUrl : undefined,
      allowsExtensionlessUrl: true,
    };
  }

  if (host === "r2.dev" || host.endsWith(".r2.dev")) {
    return {
      provider: "r2.dev",
      deliveryMode: "direct",
      requiresVerification: false,
      fetchUrl: rawUrl,
      storedUrl: rawUrl,
      browserUrl: undefined,
      allowsExtensionlessUrl: false,
    };
  }

  return {
    provider: host.slice(0, 80) || "direct-mirror",
    deliveryMode: "direct",
    requiresVerification: false,
    fetchUrl: rawUrl,
    storedUrl: rawUrl,
    browserUrl: undefined,
    allowsExtensionlessUrl: false,
  };
}

function parseContentDispositionFilename(header) {
  if (typeof header !== "string" || !header.trim()) return "";
  const extendedMatch = header.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')?([^;]+)/i);
  if (extendedMatch) {
    const raw = extendedMatch[1].trim().replace(/^["']|["']$/g, "");
    return decodeUrlSafe(raw);
  }
  const plainMatch = header.match(/filename\s*=\s*("([^"]+)"|([^;]+))/i);
  if (plainMatch) {
    return (plainMatch[2] ?? plainMatch[3] ?? "").trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

function registerUsedUrl(usedUrlsByPlatform, urlStr, platformId) {
  const norm = normalizeSourceUrl(urlStr);
  if (!norm) return;
  if (!usedUrlsByPlatform.has(norm)) {
    usedUrlsByPlatform.set(norm, new Set());
  }
  usedUrlsByPlatform.get(norm).add(platformId);
}

function loadCrossPlatformUrlMap() {
  const usedUrlsByPlatform = new Map();
  for (const platformId of PLATFORM_CATALOG_IDS) {
    const filePath = path.join(projectRoot, "data", "catalog", `${platformId}.json`);
    const items = JSON.parse(readFileSync(filePath, "utf8"));
    for (const item of items) {
      if (!Array.isArray(item.sources)) continue;
      for (const source of item.sources) {
        if (typeof source === "string") {
          registerUsedUrl(usedUrlsByPlatform, source, platformId);
        } else if (source && typeof source === "object") {
          if (typeof source.url === "string") {
            registerUsedUrl(usedUrlsByPlatform, source.url, platformId);
          }
          if (typeof source.browserUrl === "string") {
            registerUsedUrl(usedUrlsByPlatform, source.browserUrl, platformId);
          }
        }
      }
    }
  }
  return usedUrlsByPlatform;
}

function isUrlUsedOnOtherPlatform(usedUrlsByPlatform, urlStr, platformId) {
  const norm = normalizeSourceUrl(urlStr);
  if (!norm) return false;
  const owners = usedUrlsByPlatform.get(norm);
  if (!owners || owners.size === 0) return false;
  for (const owner of owners) {
    if (owner !== platformId) return true;
  }
  return false;
}

function hasDisallowedUrlTokens(candidate) {
  const rawCombined = [
    candidate.label ?? "",
    candidate.fullPath ?? "",
    decodeUrlSafe(candidate.url ?? ""),
  ]
    .filter(Boolean)
    .join(" ");
  if (isDisallowedCandidate(rawCombined)) return true;

  let pathText = "";
  try {
    pathText = decodeUrlSafe(new URL(candidate.url).pathname);
  } catch {
    pathText = decodeUrlSafe(candidate.url);
  }
  const normalizedPath = normalizeMetadataText(pathText);
  return NON_GAME_FILENAME_PATTERN.test(normalizedPath) || COMMON_WRONG_PLATFORM_PATTERN.test(normalizedPath);
}

function isDisallowedCandidate(text) {
  if (DISALLOWED_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return NON_GAME_FILENAME_PATTERN.test(normalizeMetadataText(text));
}

function normalizeTitleTokens(raw) {
  let clean = String(raw ?? "")
    .replace(/\.[a-z0-9]{1,12}$/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!clean) return [];

  return clean
    .split(/\s+/)
    .map((token) => ROMAN_MAP.get(token) ?? token)
    .filter((token) => token !== "the" && token !== "a" && token !== "an");
}

function titlesMatchStrictly(itemTitle, candidateLabel) {
  const itemTokens = normalizeTitleTokens(itemTitle);
  const candidateTokens = normalizeTitleTokens(candidateLabel);
  if (itemTokens.length === 0 || candidateTokens.length === 0) return false;

  if (itemTokens.join(" ") === candidateTokens.join(" ")) return true;

  // Allow identical sorted token set only if numeric tokens match identically (prevents sequel cross-matching).
  const itemNums = itemTokens.filter((t) => /^\d+$/.test(t)).join(",");
  const candNums = candidateTokens.filter((t) => /^\d+$/.test(t)).join(",");
  if (itemNums !== candNums) return false;

  if (itemTokens.length !== candidateTokens.length) return false;
  const sortedItem = [...itemTokens].sort().join(" ");
  const sortedCand = [...candidateTokens].sort().join(" ");
  return sortedItem === sortedCand;
}

function hasCompanionCue(files, binFileName) {
  if (!Array.isArray(files) || typeof binFileName !== "string") return false;
  const targetDir = path.posix.dirname(binFileName);
  const binExt = path.posix.extname(binFileName);
  const binBase = path.posix.basename(binFileName, binExt).trim();
  const binLower = binBase.toLowerCase();
  const strippedBinStem = binBase.replace(/\s*\(\s*track\s*\d+\s*\)$/i, "").trim().toLowerCase();

  return files.some((file) => {
    if (!file || typeof file.name !== "string" || file.source === "metadata") return false;
    const ext = extractFilenameExtension(file.name);
    if (ext !== ".cue") return false;
    if (path.posix.dirname(file.name) !== targetDir) return false;
    const cueStem = path.posix.basename(file.name, ext).trim();
    const cueLower = cueStem.toLowerCase();
    return cueLower === binLower || cueLower === strippedBinStem || titlesMatchStrictly(cueStem, binBase);
  });
}

function scoreCandidate(candidate, regionPriority, platformId) {
  const label = `${candidate.label ?? ""} ${candidate.url}`;
  let score = 0;

  const ext = extractUrlExtension(candidate.url) ?? extractFilenameExtension(candidate.label);
  const formatScores = FORMAT_SCORE_BY_PLATFORM[platformId];
  if (ext && formatScores && Object.prototype.hasOwnProperty.call(formatScores, ext)) {
    score += formatScores[ext];
  }

  for (let i = 0; i < regionPriority.length; i += 1) {
    const region = regionPriority[i];
    const matcher = REGION_MATCHERS[region];
    if (matcher && matcher.test(label)) {
      score += (regionPriority.length - i) * 100;
      break;
    }
  }

  if (/\b(?:disc\s*1|cd\s*1)\b/i.test(label)) score += 30;
  if (/\b(?:disc\s*[2-9]|cd\s*[2-9])\b/i.test(label)) score -= 40;

  return score;
}

async function verifyRemoteSource(url, throttle, minBytes = 0, fallbackSizeBytes = null, options = {}) {
  const providerInfo = options.providerInfo ?? inspectProviderCandidate(url);
  const requestUrl = providerInfo.fetchUrl || url;
  await throttle();
  let response = await fetch(requestUrl, {
    method: "HEAD",
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });

  const headContentType = response.headers.get("content-type") ?? "";
  const headMissingLength =
    response.status === 200 &&
    !isHtmlContentType(headContentType) &&
    extractResponseSizeBytes(response) === null;

  if (response.status === 405 || response.status === 501 || headMissingLength) {
    await throttle();
    const rangeResponse = await fetch(requestUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Range: "bytes=0-0",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (
      response.status === 405 ||
      response.status === 501 ||
      ((rangeResponse.status === 200 || rangeResponse.status === 206) &&
        (!isHtmlContentType(rangeResponse.headers.get("content-type") ?? "") ||
          providerInfo.deliveryMode === "browser_verify"))
    ) {
      await response.body?.cancel?.().catch(() => {});
      response = rangeResponse;
    } else {
      await rangeResponse.body?.cancel?.().catch(() => {});
    }
  }

  if (response.status !== 200 && response.status !== 206) {
    await response.body?.cancel?.().catch(() => {});
    return { ok: false, status: response.status, reason: `HTTP ${response.status}` };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = isHtmlContentType(contentType);
  if (isHtml && providerInfo.deliveryMode !== "browser_verify") {
    await response.body?.cancel?.().catch(() => {});
    return { ok: false, status: response.status, reason: "Returned HTML instead of binary" };
  }

  const dispositionFilename = parseContentDispositionFilename(response.headers.get("content-disposition"));
  const headerSizeBytes = isHtml ? null : extractResponseSizeBytes(response);
  const sizeBytes =
    headerSizeBytes ?? (Number.isSafeInteger(fallbackSizeBytes) && fallbackSizeBytes > 0 ? fallbackSizeBytes : null);

  if (!sizeBytes || sizeBytes <= 0) {
    await response.body?.cancel?.().catch(() => {});
    return { ok: false, status: response.status, reason: "Missing valid Content-Length" };
  }

  if (minBytes > 0 && sizeBytes < minBytes) {
    await response.body?.cancel?.().catch(() => {});
    const actualMb = (sizeBytes / BYTES_PER_MB).toFixed(2);
    const requiredMb = (minBytes / BYTES_PER_MB).toFixed(minBytes % BYTES_PER_MB === 0 ? 0 : 2);
    return {
      ok: false,
      status: response.status,
      reason: `File too small (${actualMb} MB < ${requiredMb} MB minimum)`,
    };
  }

  const finalUrl = response.url || requestUrl;
  const storedUrl =
    providerInfo.provider === "archive.org"
      ? canonicalizeArchiveUrl(requestUrl, finalUrl)
      : providerInfo.storedUrl || finalUrl;
  const detectedExt =
    extractUrlExtension(finalUrl) ??
    extractUrlExtension(storedUrl) ??
    extractFilenameExtension(dispositionFilename);

  await response.body?.cancel?.().catch(() => {});

  return {
    ok: true,
    status: response.status,
    finalUrl,
    storedUrl,
    browserUrl: providerInfo.browserUrl,
    provider: providerInfo.provider,
    deliveryMode: providerInfo.deliveryMode,
    requiresVerification: providerInfo.requiresVerification,
    detectedExt,
    dispositionFilename,
    sizeBytes,
    contentType,
  };
}

async function collectIndexUrlCandidates(indexUrl, throttle) {
  await throttle();
  const parsed = new URL(indexUrl);
  const candidates = [];

  if (parsed.hostname.endsWith("archive.org")) {
    const metaMatch = parsed.pathname.match(/^\/(?:metadata|details)\/([^/?#]+)/);
    if (metaMatch) {
      const identifier = metaMatch[1];
      const metaUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
      const res = await fetch(metaUrl, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Archive.org metadata HTTP ${res.status}`);
      const meta = await res.json();
      const files = Array.isArray(meta.files) ? meta.files : [];
      for (const file of files) {
        if (!file || typeof file.name !== "string" || file.source === "metadata") continue;
        const ext = extractFilenameExtension(file.name);
        const encoded = file.name.split("/").map(encodeURIComponent).join("/");
        const parsedSize = file.size !== undefined ? Number(file.size) : Number.NaN;
        const expectedSizeBytes = Number.isSafeInteger(parsedSize) && parsedSize > 0 ? parsedSize : undefined;
        candidates.push({
          url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encoded}`,
          label: path.posix.basename(file.name),
          fullPath: file.name,
          expectedSizeBytes,
          hasCue: ext === ".bin" ? hasCompanionCue(files, file.name) : undefined,
        });
      }
      return candidates;
    }
  }

  const res = await fetch(indexUrl, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Index URL returned HTTP ${res.status}`);
  const html = await res.text();
  const baseUrl = res.url || indexUrl;
  const hrefRegex = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const rawHref = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("?")) continue;
    try {
      const resolved = new URL(rawHref, baseUrl);
      if (resolved.protocol !== "https:" && resolved.protocol !== "http:") continue;
      if (resolved.pathname.endsWith("/")) continue;
      candidates.push({
        url: resolved.toString(),
        label: extractFilenameFromUrl(resolved.toString()),
      });
    } catch {
      // Skip malformed anchor links.
    }
  }

  return candidates;
}

function collectUrlFileCandidates(filePath) {
  const resolved = path.resolve(projectRoot, filePath);
  const lines = readFileSync(resolved, "utf8").split(/\r?\n/);
  const candidates = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.includes("\t")) {
      const parts = line.split("\t").map((part) => part.trim()).filter(Boolean);
      const urlPart = parts.find((part) => /^https?:\/\//i.test(part));
      if (!urlPart) continue;
      const titlePart = parts.find((part) => part !== urlPart) ?? extractFilenameFromUrl(urlPart);
      candidates.push({ url: urlPart, label: titlePart });
    } else if (/^https?:\/\//i.test(line)) {
      candidates.push({ url: line, label: extractFilenameFromUrl(line) });
    }
  }

  return candidates;
}

function hasQualifyingConsoleFile(files, item, platformId, allowedExts, minBytes = 0) {
  if (!Array.isArray(files) || !item) return false;
  const rule = ARCHIVE_PLATFORM_RULES[platformId];
  if (!rule) return false;

  for (const file of files) {
    if (!file || typeof file.name !== "string" || file.source === "metadata") continue;
    const ext = extractFilenameExtension(file.name);
    if (!ext) continue;
    if (allowedExts && !allowedExts.has(ext)) continue;
    if (PS1_SIDECAR_EXTENSIONS.has(ext) || ext === ".bin" || ext === ".img") continue;

    const normalizedFile = normalizeMetadataText(file.name);
    if (
      isDisallowedCandidate(file.name) ||
      COMMON_WRONG_PLATFORM_PATTERN.test(normalizedFile) ||
      rule.otherConsolesPattern.test(normalizedFile)
    ) {
      continue;
    }

    const label = path.posix.basename(file.name);
    if (!titlesMatchStrictly(item.title.en, label) && !titlesMatchStrictly(item.title.tr, label)) {
      continue;
    }

    const parsedSize = file.size !== undefined ? Number(file.size) : Number.NaN;
    const hasSize = Number.isSafeInteger(parsedSize) && parsedSize > 0;
    if (platformId === "wii" && ext === ".iso" && (!hasSize || !isValidWiiIsoSize(parsedSize))) {
      continue;
    }

    if (rule.strongFileExtensions.has(ext)) {
      if (!hasSize || minBytes === 0 || parsedSize >= minBytes) {
        return true;
      }
    } else if (ARCHIVE_EXTENSIONS.has(ext)) {
      const archiveMinBytes = Math.max(ARCHIVE_FALLBACK_MIN_BYTES, minBytes);
      if (REGION_TAG_PATTERN.test(label) && hasSize && parsedSize >= archiveMinBytes) {
        return true;
      }
    }
  }

  return false;
}

function evaluateArchiveMetadata(
  metadataObj,
  platformId,
  { requirePositive = true, files = null, item = null, allowedExts = null, minBytes = 0 } = {},
) {
  const rule = ARCHIVE_PLATFORM_RULES[platformId];
  if (!rule) return { ok: false, reason: "unknown-platform" };

  const collections = toTextList(metadataObj?.collection).map((entry) => entry.toLowerCase());
  if (collections.includes("access-restricted-item")) {
    return { ok: false, reason: "access-restricted" };
  }

  const titleText = normalizeMetadataText(metadataObj?.title);
  const identifierText = normalizeMetadataText(metadataObj?.identifier);
  const subjectText = normalizeMetadataText(metadataObj?.subject);
  const collectionText = normalizeMetadataText(metadataObj?.collection);
  const descriptionText = normalizeMetadataText(metadataObj?.description);
  const primaryText = [titleText, identifierText, subjectText, collectionText].filter(Boolean).join(" ");

  if (NON_GAME_PRIMARY_PATTERN.test(primaryText)) {
    return { ok: false, reason: "non-game-primary" };
  }
  if (/\bupdate\b/i.test(primaryText) && !/\b(?:base|full\s+game|complete)\b/i.test(primaryText)) {
    return { ok: false, reason: "update-only" };
  }
  if (NON_GAME_DESCRIPTION_PATTERN.test(descriptionText)) {
    return { ok: false, reason: "non-game-description" };
  }
  if (COMMON_WRONG_PLATFORM_PATTERN.test(primaryText)) {
    return { ok: false, reason: "wrong-platform-common" };
  }
  if (rule.otherConsolesPattern.test(primaryText)) {
    return { ok: false, reason: "wrong-platform-console" };
  }

  if (requirePositive) {
    const hasMetadataMatch = rule.primaryPositive.test(primaryText) || rule.descriptionPositive.test(descriptionText);
    const hasFileMatch = hasQualifyingConsoleFile(files, item, platformId, allowedExts, minBytes);
    if (!hasMetadataMatch && !hasFileMatch) {
      return { ok: false, reason: "missing-platform-match" };
    }
  }

  return { ok: true };
}

async function searchArchiveCandidatesForItem(
  item,
  platformId,
  allowedExts,
  throttle,
  minBytes = 0,
  allowRawBin = false,
) {
  const rule = ARCHIVE_PLATFORM_RULES[platformId];
  if (!rule) return [];

  const queryTitle = item.title.en.replace(/\(\d{4}\)/g, "").trim().replace(/"/g, "");
  const baseQuery = `title:("${queryTitle}") AND mediatype:(software)`;
  const exclusions = "NOT collection:(access-restricted-item OR softwarelibrary_msdos_games OR classicpcgames)";
  const seenIdentifiers = new Set();

  async function searchWithQuery(queryStr) {
    await throttle();
    const searchUrl = new URL("https://archive.org/advancedsearch.php");
    searchUrl.searchParams.set("q", queryStr);
    searchUrl.searchParams.append("fl[]", "identifier");
    searchUrl.searchParams.append("fl[]", "title");
    searchUrl.searchParams.append("fl[]", "subject");
    searchUrl.searchParams.append("fl[]", "collection");
    searchUrl.searchParams.append("fl[]", "description");
    searchUrl.searchParams.set("sort[]", "downloads desc");
    searchUrl.searchParams.set("rows", "10");
    searchUrl.searchParams.set("page", "1");
    searchUrl.searchParams.set("output", "json");

    const res = await fetch(searchUrl, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    const found = [];
    let checkedDocs = 0;

    for (const doc of docs) {
      if (!doc?.identifier || seenIdentifiers.has(doc.identifier)) continue;
      seenIdentifiers.add(doc.identifier);

      const preCheck = evaluateArchiveMetadata(doc, platformId, { requirePositive: false });
      if (!preCheck.ok) continue;

      if (checkedDocs >= 5) break;
      checkedDocs += 1;

      await throttle();
      const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      if (!metaRes.ok) continue;
      const meta = await metaRes.json();
      const files = Array.isArray(meta.files) ? meta.files : [];
      const verdict = evaluateArchiveMetadata(meta?.metadata ?? {}, platformId, {
        requirePositive: true,
        files,
        item,
        allowedExts,
        minBytes,
      });
      if (!verdict.ok) continue;

      for (const file of files) {
        if (!file || typeof file.name !== "string" || file.source === "metadata") continue;
        const ext = extractFilenameExtension(file.name);
        if (!ext || !allowedExts.has(ext)) continue;
        if (platformId === "ps1" && PS1_SIDECAR_EXTENSIONS.has(ext)) continue;
        if (platformId === "ps1" && ext === ".bin" && (!allowRawBin || !hasCompanionCue(files, file.name))) {
          continue;
        }

        const normalizedFile = normalizeMetadataText(file.name);
        if (
          isDisallowedCandidate(file.name) ||
          COMMON_WRONG_PLATFORM_PATTERN.test(normalizedFile) ||
          rule.otherConsolesPattern.test(normalizedFile)
        ) {
          continue;
        }

        const parsedSize = file.size !== undefined ? Number(file.size) : Number.NaN;
        const expectedSizeBytes = Number.isSafeInteger(parsedSize) && parsedSize > 0 ? parsedSize : undefined;
        if (minBytes > 0 && expectedSizeBytes !== undefined && expectedSizeBytes < minBytes) {
          continue;
        }
        if (platformId === "wii" && ext === ".iso" && expectedSizeBytes !== undefined && !isValidWiiIsoSize(expectedSizeBytes)) {
          continue;
        }

        const encoded = file.name.split("/").map(encodeURIComponent).join("/");
        found.push({
          url: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${encoded}`,
          label: path.posix.basename(file.name),
          fullPath: file.name,
          expectedSizeBytes,
          hasCue: ext === ".bin" ? true : undefined,
        });
      }
    }

    return found;
  }

  const candidates = await searchWithQuery(`${baseQuery} AND ${rule.searchClause} AND ${exclusions}`);
  const hasTitleMatch = candidates.some(
    (candidate) =>
      titlesMatchStrictly(item.title.en, candidate.label) || titlesMatchStrictly(item.title.tr, candidate.label),
  );

  if (!hasTitleMatch) {
    const fallbackCandidates = await searchWithQuery(`${baseQuery} AND ${exclusions}`);
    candidates.push(...fallbackCandidates);
  }

  return candidates;
}

function buildStructuredSource(verified, ext, priority, sourceId = `synced-${priority}`) {
  const targetUrl = verified.storedUrl || verified.finalUrl;
  let provider = verified.provider || "direct-mirror";
  if (!verified.provider) {
    try {
      provider = new URL(targetUrl).hostname.replace(/^www\./i, "").slice(0, 80) || "direct-mirror";
    } catch {
      // Keep default provider.
    }
  }

  return {
    id: sourceId,
    provider,
    deliveryMode: verified.deliveryMode || "direct",
    url: targetUrl,
    ...(verified.browserUrl ? { browserUrl: verified.browserUrl } : {}),
    format: ext,
    sizeBytes: verified.sizeBytes,
    requiresVerification: Boolean(verified.requiresVerification),
    priority,
    sourceCheckedAt: new Date().toISOString(),
  };
}

function nextUniqueSourceId(existingIds, seedNumber = 1) {
  let num = Math.max(1, seedNumber);
  while (existingIds.has(`synced-${num}`)) {
    num += 1;
  }
  existingIds.add(`synced-${num}`);
  return `synced-${num}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (!options.platformArg) {
    throw new Error("--platform=<id|all> is required. Run with --help for usage.");
  }
  if (!options.indexUrl && !options.urlFile && !options.searchArchive) {
    throw new Error("Provide at least one source input: --index-url=..., --url-file=..., or --search-archive.");
  }
  if (options.append && options.overwrite) {
    throw new Error("--append and --overwrite cannot be combined. Use --append to keep existing sources or --overwrite to replace them.");
  }

  const throttle = createThrottler(options.delayMs);
  const platforms = options.platformArg === "all" ? [...PLATFORM_CATALOG_IDS] : [options.platformArg];
  const usedUrlsByPlatform = loadCrossPlatformUrlMap();

  let sharedCandidates = [];
  if (options.indexUrl) {
    console.log(`Fetching index candidates from ${options.indexUrl}...`);
    sharedCandidates.push(...(await collectIndexUrlCandidates(options.indexUrl, throttle)));
  }
  if (options.urlFile) {
    console.log(`Loading URL candidates from ${options.urlFile}...`);
    sharedCandidates.push(...collectUrlFileCandidates(options.urlFile));
  }

  let totalMatched = 0;
  let totalSkipped = 0;

  for (const platformId of platforms) {
    const filePath = path.join(projectRoot, "data", "catalog", `${platformId}.json`);
    const items = JSON.parse(readFileSync(filePath, "utf8"));
    const allowedExts = getAllowedExtensions(platformId);
    const effectiveMinMb = options.minMb ?? DEFAULT_MIN_MB_BY_PLATFORM[platformId] ?? 0;
    const minBytes = Math.round(effectiveMinMb * BYTES_PER_MB);
    let platformMatched = 0;
    let platformSkipped = 0;
    let searched = 0;

    for (const item of items) {
      const existingSources = Array.isArray(item.sources) ? item.sources : [];
      if (!options.overwrite && !options.append && existingSources.length > 0) {
        platformSkipped += 1;
        totalSkipped += 1;
        continue;
      }

      const existingUrls = new Set();
      const existingIds = new Set();
      let maxPriority = 0;

      if (options.append) {
        existingSources.forEach((source, index) => {
          if (typeof source === "string") {
            const norm = normalizeSourceUrl(source);
            if (norm) existingUrls.add(norm);
            maxPriority = Math.max(maxPriority, index + 1);
          } else if (source && typeof source === "object") {
            if (typeof source.id === "string") existingIds.add(source.id);
            if (typeof source.url === "string") {
              const norm = normalizeSourceUrl(source.url);
              if (norm) existingUrls.add(norm);
            }
            if (typeof source.browserUrl === "string") {
              const norm = normalizeSourceUrl(source.browserUrl);
              if (norm) existingUrls.add(norm);
            }
            if (Number.isSafeInteger(source.priority)) {
              maxPriority = Math.max(maxPriority, source.priority);
            }
          }
        });
      }

      searched += 1;
      let pool = [...sharedCandidates];
      if (options.searchArchive) {
        try {
          const archivePool = await searchArchiveCandidatesForItem(
            item,
            platformId,
            allowedExts,
            throttle,
            minBytes,
            options.allowRawBin,
          );
          pool.push(...archivePool);
        } catch (error) {
          console.warn(`[${platformId}/${item.slug}] Archive search failed: ${error.message}`);
        }
      }

      const filtered = pool
        .filter((candidate) => {
          const providerInfo = inspectProviderCandidate(candidate.url);
          const ext =
            extractUrlExtension(providerInfo.fetchUrl) ??
            extractUrlExtension(candidate.url) ??
            extractFilenameExtension(candidate.label);
          if (ext) {
            if (!allowedExts.has(ext)) return false;
            if (platformId === "ps1" && PS1_SIDECAR_EXTENSIONS.has(ext)) return false;
            if (platformId === "ps1" && ext === ".bin" && (!options.allowRawBin || candidate.hasCue === false)) {
              return false;
            }
            if (
              platformId === "wii" &&
              ext === ".iso" &&
              candidate.expectedSizeBytes !== undefined &&
              !isValidWiiIsoSize(candidate.expectedSizeBytes)
            ) {
              return false;
            }
          } else if (!providerInfo.allowsExtensionlessUrl) {
            return false;
          }

          if (minBytes > 0 && candidate.expectedSizeBytes !== undefined && candidate.expectedSizeBytes < minBytes) {
            return false;
          }
          if (hasDisallowedUrlTokens(candidate)) return false;

          if (options.append) {
            const normRaw = normalizeSourceUrl(candidate.url);
            const normStored = normalizeSourceUrl(providerInfo.storedUrl);
            if ((normRaw && existingUrls.has(normRaw)) || (normStored && existingUrls.has(normStored))) {
              return false;
            }
          }

          if (
            isUrlUsedOnOtherPlatform(usedUrlsByPlatform, candidate.url, platformId) ||
            isUrlUsedOnOtherPlatform(usedUrlsByPlatform, providerInfo.storedUrl, platformId)
          ) {
            return false;
          }

          const label = candidate.label || extractFilenameFromUrl(candidate.url);
          return titlesMatchStrictly(item.title.en, label) || titlesMatchStrictly(item.title.tr, label);
        })
        .sort(
          (left, right) =>
            scoreCandidate(right, options.regionPriority, platformId) -
            scoreCandidate(left, options.regionPriority, platformId),
        );

      const addedSources = [];
      const addedProviderFormatKeys = new Set();
      const candidateLimit = options.append ? 12 : 6;
      const singleMirrorPerSearchOnly = options.searchArchive && !options.indexUrl && !options.urlFile;

      for (const candidate of filtered.slice(0, candidateLimit)) {
        const providerInfo = inspectProviderCandidate(candidate.url);
        const normCandidate = normalizeSourceUrl(candidate.url);
        const normPreStored = normalizeSourceUrl(providerInfo.storedUrl);

        if (
          (normCandidate && existingUrls.has(normCandidate)) ||
          (normPreStored && existingUrls.has(normPreStored)) ||
          isUrlUsedOnOtherPlatform(usedUrlsByPlatform, candidate.url, platformId) ||
          isUrlUsedOnOtherPlatform(usedUrlsByPlatform, providerInfo.storedUrl, platformId)
        ) {
          continue;
        }

        const fallbackSize =
          candidate.expectedSizeBytes ??
          (providerInfo.deliveryMode === "browser_verify" && Number.isSafeInteger(item.sizeBytes) && item.sizeBytes > 0
            ? item.sizeBytes
            : null);

        try {
          const check = await verifyRemoteSource(
            candidate.url,
            throttle,
            minBytes,
            fallbackSize,
            { providerInfo },
          );
          if (!check.ok) {
            console.log(`[${platformId}/${item.slug}] Rejected ${candidate.url} (${check.reason})`);
            continue;
          }

          const resolvedExt =
            check.detectedExt ??
            extractUrlExtension(check.storedUrl) ??
            extractUrlExtension(check.finalUrl) ??
            extractUrlExtension(candidate.url) ??
            extractFilenameExtension(candidate.label);

          if (resolvedExt && !allowedExts.has(resolvedExt)) {
            console.log(`[${platformId}/${item.slug}] Rejected ${candidate.url} (Unsupported extension ${resolvedExt})`);
            continue;
          }
          if (platformId === "ps1" && resolvedExt && (PS1_SIDECAR_EXTENSIONS.has(resolvedExt) || (resolvedExt === ".bin" && !options.allowRawBin))) {
            console.log(`[${platformId}/${item.slug}] Rejected ${candidate.url} (Disallowed PS1 extension ${resolvedExt})`);
            continue;
          }

          const ext = resolvedExt && allowedExts.has(resolvedExt) ? resolvedExt : item.fileExtension.toLowerCase();
          if (platformId === "wii" && ext === ".iso" && !isValidWiiIsoSize(check.sizeBytes)) {
            console.log(
              `[${platformId}/${item.slug}] Rejected ${candidate.url} (Non-standard Wii .iso size ${check.sizeBytes} bytes)`,
            );
            continue;
          }

          const normStored = normalizeSourceUrl(check.storedUrl);
          const normFinal = normalizeSourceUrl(check.finalUrl);
          if (
            (normStored && existingUrls.has(normStored)) ||
            (normFinal && existingUrls.has(normFinal)) ||
            isUrlUsedOnOtherPlatform(usedUrlsByPlatform, check.storedUrl, platformId) ||
            isUrlUsedOnOtherPlatform(usedUrlsByPlatform, check.finalUrl, platformId)
          ) {
            console.log(`[${platformId}/${item.slug}] Skipped duplicate URL ${check.storedUrl}`);
            continue;
          }

          const mirrorKey = `${check.provider}:${ext}`;
          if (options.append && addedProviderFormatKeys.has(mirrorKey)) {
            continue;
          }

          const priority = maxPriority + addedSources.length + 1;
          const sourceId = nextUniqueSourceId(existingIds, priority);
          const structured = buildStructuredSource(check, ext, priority, sourceId);

          addedSources.push(structured);
          addedProviderFormatKeys.add(mirrorKey);
          if (normStored) existingUrls.add(normStored);
          if (normFinal) existingUrls.add(normFinal);
          if (structured.browserUrl) existingUrls.add(normalizeSourceUrl(structured.browserUrl));

          if (!options.append || singleMirrorPerSearchOnly) {
            break;
          }
        } catch (error) {
          console.log(`[${platformId}/${item.slug}] Rejected ${candidate.url} (${error.message})`);
        }
      }

      if (addedSources.length > 0) {
        platformMatched += 1;
        totalMatched += 1;

        for (const added of addedSources) {
          registerUsedUrl(usedUrlsByPlatform, added.url, platformId);
          if (added.browserUrl) {
            registerUsedUrl(usedUrlsByPlatform, added.browserUrl, platformId);
          }
        }

        if (!options.dryRun) {
          const isInitialPopulation = !options.append || existingSources.length === 0;
          item.sources = options.append ? [...existingSources, ...addedSources] : [addedSources[0]];

          if (isInitialPopulation) {
            const primary = item.sources[0];
            if (primary.deliveryMode === "direct") {
              item.sizeBytes = primary.sizeBytes;
              item.sizeBytesEstimated = false;
            }
            const verifiedExt = primary.format.toLowerCase();
            if (allowedExts.has(verifiedExt)) {
              item.fileExtension = verifiedExt;
              const formatLabel = getFormatLabel(platformId, verifiedExt);
              if (formatLabel) {
                item.fileFormat = formatLabel;
              }
            }
          }
        }

        for (const added of addedSources) {
          const verb = options.append && existingSources.length > 0 ? "Appended" : "Matched";
          console.log(
            `${options.dryRun ? "[dry-run] " : ""}[${platformId}/${item.slug}] ${verb} [${added.provider}] ${added.url} (${formatHumanSize(added.sizeBytes)} / ${added.sizeBytes} bytes, ${added.format}, ${added.deliveryMode})`,
          );
        }
      }

      if (options.limit !== null && searched >= options.limit) break;
    }

    if (platformMatched > 0 && !options.dryRun) {
      writeFileSync(filePath, JSON.stringify(items, null, 2) + "\n", "utf8");
    }

    console.log(`${platformId}: ${platformMatched} game(s) updated (${searched} searched, ${platformSkipped} skipped).`);
  }

  console.log(
    `${options.dryRun ? "Dry run complete: " : "Source sync complete: "}${totalMatched} item(s) updated, ${totalSkipped} skipped (existing sources).`,
  );
}

main().catch((error) => {
  console.error(`Source sync failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
