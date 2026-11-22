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
const WEB_PAGE_EXTENSIONS = new Set([".html", ".htm", ".php", ".asp", ".aspx", ".jsp"]);

function printUsage() {
  console.log(
    "Usage: npm run check:sources [-- --platform=<id|all>] [--delay-ms=3000] [--remove-dead] [--dry-run]",
  );
  console.log("Verifies existing catalog sources[] URLs for HTTP 200/206, non-HTML Content-Type, and Content-Length.");
}

function parseArgs(argv) {
  let platformArg = "all";
  let delayMs = 3000;
  let removeDead = false;
  let dryRun = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--remove-dead") {
      removeDead = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--platform=")) {
      const val = arg.slice("--platform=".length).trim().toLowerCase();
      if (val !== "all" && !PLATFORM_CATALOG_IDS.includes(val)) {
        throw new Error(`Invalid --platform "${val}". Expected all or one of: ${PLATFORM_CATALOG_IDS.join(", ")}.`);
      }
      platformArg = val;
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

  return { platformArg, delayMs, removeDead, dryRun, help };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      format.extensions.map((extension) => extension.toLowerCase()),
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

function extractUrlExtension(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const rawSegment = parsed.pathname.split("/").pop() ?? "";
    if (!rawSegment) return null;

    let decoded = rawSegment;
    try {
      decoded = decodeURIComponent(rawSegment);
    } catch {
      // Keep raw segment if percent-encoding is malformed.
    }

    const match = decoded.match(/(\.[a-z0-9]{1,12})$/i);
    if (!match) return null;
    const extension = match[1].toLowerCase();
    return WEB_PAGE_EXTENSIONS.has(extension) ? null : extension;
  } catch {
    return null;
  }
}

function extractResponseSizeBytes(response) {
  const rangeTotal = parseContentRangeTotal(response.headers.get("content-range"));
  if (rangeTotal) return rangeTotal;
  const lenHeader = response.headers.get("content-length");
  const parsedLen = lenHeader ? Number(lenHeader) : Number.NaN;
  return Number.isSafeInteger(parsedLen) && parsedLen > 0 ? parsedLen : null;
}

async function checkRemoteUrl(url, delayMs, lastRequestRef) {
  const wait = async () => {
    const gap = Math.max(0, lastRequestRef.at + delayMs - Date.now());
    if (gap > 0) await sleep(gap);
    lastRequestRef.at = Date.now();
  };

  try {
    await wait();
    let response = await fetch(url, {
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
      await wait();
      const rangeResponse = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Range: "bytes=0-0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (
        response.status === 405 ||
        response.status === 501 ||
        ((rangeResponse.status === 200 || rangeResponse.status === 206) &&
          !isHtmlContentType(rangeResponse.headers.get("content-type") ?? ""))
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
    if (isHtmlContentType(contentType)) {
      await response.body?.cancel?.().catch(() => {});
      return { ok: false, status: response.status, reason: "HTML response instead of binary" };
    }

    const sizeBytes = extractResponseSizeBytes(response);
    const finalUrl = response.url || url;
    await response.body?.cancel?.().catch(() => {});

    return { ok: true, status: response.status, sizeBytes, finalUrl };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const platforms = options.platformArg === "all" ? [...PLATFORM_CATALOG_IDS] : [options.platformArg];
  const lastRequestRef = { at: 0 };

  let totalChecked = 0;
  let totalHealthy = 0;
  let totalDead = 0;
  let totalRemoved = 0;

  for (const platformId of platforms) {
    const filePath = path.join(projectRoot, "data", "catalog", `${platformId}.json`);
    const items = JSON.parse(readFileSync(filePath, "utf8"));
    const allowedExts = getAllowedExtensions(platformId);
    let platformChanged = false;
    let platformHealthy = 0;
    let platformDead = 0;

    for (const item of items) {
      if (!Array.isArray(item.sources) || item.sources.length === 0) continue;

      const survivingSources = [];
      const healthyEntries = [];

      for (const [sourceIndex, source] of item.sources.entries()) {
        const sourceUrl = typeof source === "string" ? source : source?.url;
        if (typeof sourceUrl !== "string") continue;

        totalChecked += 1;
        const result = await checkRemoteUrl(sourceUrl, options.delayMs, lastRequestRef);

        if (result.ok) {
          totalHealthy += 1;
          platformHealthy += 1;
          if (typeof source === "object" && source !== null) {
            const checkedAt = new Date().toISOString();
            if (source.sourceCheckedAt !== checkedAt) {
              source.sourceCheckedAt = checkedAt;
              platformChanged = true;
            }
            if (result.sizeBytes && source.sizeBytes !== result.sizeBytes) {
              source.sizeBytes = result.sizeBytes;
              platformChanged = true;
            }
          }

          const priority =
            typeof source === "object" && source !== null && Number.isSafeInteger(source.priority)
              ? source.priority
              : sourceIndex + 1;
          const existingSize =
            typeof source === "object" &&
            source !== null &&
            Number.isSafeInteger(source.sizeBytes) &&
            source.sizeBytes > 0
              ? source.sizeBytes
              : null;
          const effectiveSize = result.sizeBytes ?? existingSize;

          let extension = null;
          if (typeof source === "object" && source !== null && typeof source.format === "string") {
            const candidateFormat = source.format.toLowerCase();
            if (allowedExts.has(candidateFormat)) {
              extension = candidateFormat;
            }
          }
          if (!extension) {
            const detected = extractUrlExtension(sourceUrl) ?? extractUrlExtension(result.finalUrl);
            if (detected && allowedExts.has(detected)) {
              extension = detected;
            }
          }

          healthyEntries.push({
            index: sourceIndex,
            priority,
            sizeBytes: effectiveSize,
            verifiedLive: result.sizeBytes !== null,
            extension,
          });

          survivingSources.push(source);
          console.log(
            `[OK ${result.status}] ${platformId}/${item.slug}: ${sourceUrl}` +
              (result.sizeBytes ? ` (${formatHumanSize(result.sizeBytes)} / ${result.sizeBytes} bytes)` : ""),
          );
        } else {
          totalDead += 1;
          platformDead += 1;
          console.warn(`[DEAD: ${result.reason}] ${platformId}/${item.slug}: ${sourceUrl}`);
          if (!options.removeDead) {
            survivingSources.push(source);
          } else {
            totalRemoved += 1;
            platformChanged = true;
          }
        }
      }

      if (options.removeDead && survivingSources.length !== item.sources.length) {
        item.sources = survivingSources;
      }

      if (healthyEntries.length > 0) {
        const primaryHealthy = [...healthyEntries].sort(
          (left, right) => left.priority - right.priority || left.index - right.index,
        )[0];

        if (primaryHealthy.sizeBytes && primaryHealthy.sizeBytes > 0) {
          if (item.sizeBytes !== primaryHealthy.sizeBytes) {
            item.sizeBytes = primaryHealthy.sizeBytes;
            platformChanged = true;
          }
          if (primaryHealthy.verifiedLive && item.sizeBytesEstimated !== false) {
            item.sizeBytesEstimated = false;
            platformChanged = true;
          }
        }

        if (primaryHealthy.extension && allowedExts.has(primaryHealthy.extension)) {
          if (item.fileExtension !== primaryHealthy.extension) {
            item.fileExtension = primaryHealthy.extension;
            platformChanged = true;
          }
          const formatLabel = getFormatLabel(platformId, primaryHealthy.extension);
          if (formatLabel && item.fileFormat !== formatLabel) {
            item.fileFormat = formatLabel;
            platformChanged = true;
          }
        }
      }
    }

    if (platformChanged && !options.dryRun) {
      writeFileSync(filePath, JSON.stringify(items, null, 2) + "\n", "utf8");
    }

    console.log(`${platformId}: ${platformHealthy} healthy, ${platformDead} dead.`);
  }

  console.log(
    `Source check complete: ${totalChecked} checked, ${totalHealthy} healthy, ${totalDead} dead` +
      (options.removeDead ? `, ${totalRemoved} removed` : "") +
      ".",
  );
}

main().catch((error) => {
  console.error(`Source check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
