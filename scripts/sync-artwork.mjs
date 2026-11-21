import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_IDS = ["ps1", "ps2", "ps3", "switch", "wii", "wiiu"];

function printUsage() {
  console.log("Usage: npm run sync:artwork [-- --platform=ps2] [--only-missing] [--force] [--dry-run] [--concurrency=2] [--delay-ms=250]");
  console.log("Resolves CDN URLs in catalog JSON. It never downloads image files.");
}

function parseCliArgs(argv) {
  let platformFilter = null;
  let force = false;
  let dryRun = false;
  let concurrency = 2;
  let delayMs = 250;
  let help = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--only-missing") {
      // Explicit alias for default behavior when --force is not set.
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--platform=")) {
      const candidate = arg.slice("--platform=".length).trim().toLowerCase();
      if (!CATALOG_IDS.includes(candidate)) {
        throw new Error(`Unknown platform "${candidate}". Expected one of: ${CATALOG_IDS.join(", ")}.`);
      }
      platformFilter = candidate;
    } else if (arg.startsWith("--concurrency=")) {
      const parsed = Number(arg.slice("--concurrency=".length));
      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4) {
        throw new Error(`Invalid --concurrency value. Expected an integer between 1 and 4.`);
      }
      concurrency = parsed;
    } else if (arg.startsWith("--delay-ms=")) {
      const parsed = Number(arg.slice("--delay-ms=".length));
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 5000) {
        throw new Error(`Invalid --delay-ms value. Expected an integer between 0 and 5000.`);
      }
      delayMs = parsed;
    } else {
      throw new Error(`Unknown option "${arg}". Run with --help for usage.`);
    }
  }

  return { platformFilter, force, dryRun, concurrency, delayMs, help };
}

function loadEnvironment() {
  const environment = { ...process.env };
  const envPath = path.join(projectRoot, ".env.local");
  if (!existsSync(envPath)) return environment;

  let envText = "";
  try {
    envText = readFileSync(envPath, "utf8");
  } catch {
    return environment;
  }

  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || (environment[match[1]] !== undefined && environment[match[1]] !== "")) continue;

    let value = match[2];
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    environment[match[1]] = value;
  }

  return environment;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRateLimiter(delayMs) {
  let queue = Promise.resolve();
  let lastRequestAt = 0;

  return async function schedule(task) {
    const run = queue.then(async () => {
      const waitMs = Math.max(0, lastRequestAt + delayMs - Date.now());
      if (waitMs > 0) await sleep(waitMs);
      lastRequestAt = Date.now();
      return task();
    });
    queue = run.catch(() => undefined);
    return run;
  };
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]/g, "");
}

function stripYearSuffix(value) {
  return String(value ?? "").replace(/\s*\(\d{4}\)\s*$/, "").trim();
}

function hasUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function ensureArtwork(item) {
  item.artwork ??= {};
  return item.artwork;
}

async function fetchJsonWithRetry(url, options, scheduleRequest) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await scheduleRequest(() =>
      fetch(url, {
        ...options,
        signal: AbortSignal.timeout(20_000),
      }),
    );

    if (response.ok) {
      return response.json();
    }

    const retryable = response.status === 429 || (response.status >= 502 && response.status <= 504);
    if (retryable && attempt < 4) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 15_000)
        : 750 * (2 ** (attempt - 1));
      await sleep(backoffMs);
      continue;
    }

    throw new Error("HTTP " + response.status);
  }
}

async function findSteamGridDbId(item, query, artwork, steamGridDbKey, scheduleSteamGrid) {
  if (Number.isSafeInteger(artwork.steamGridDbId) && artwork.steamGridDbId > 0) {
    return artwork.steamGridDbId;
  }

  const endpoint = "https://www.steamgriddb.com/api/v2/search/autocomplete/" + encodeURIComponent(query);
  const response = await fetchJsonWithRetry(
    endpoint,
    { headers: { Authorization: "Bearer " + steamGridDbKey } },
    scheduleSteamGrid,
  );
  const results = Array.isArray(response.data) ? response.data : [];
  const normalizedQuery = normalizeName(query);
  const normalizedBaseQuery = normalizeName(stripYearSuffix(query));
  const normalizedEn = normalizeName(item.title.en);
  const normalizedTr = normalizeName(item.title.tr);

  const exactMatch = results.find((result) => normalizeName(result.name ?? "") === normalizedQuery);
  const yearTrimmedMatch = exactMatch ?? results.find(
    (result) => normalizeName(stripYearSuffix(result.name ?? "")) === normalizedBaseQuery,
  );
  const itemMatch = yearTrimmedMatch ?? results.find((result) => {
    const candidate = normalizeName(result.name ?? "");
    return candidate === normalizedEn || candidate === normalizedTr;
  });

  if (itemMatch) return itemMatch.id;

  const first = results[0];
  if (first && normalizedQuery.length >= 4) {
    const firstNorm = normalizeName(first.name ?? "");
    if (firstNorm.includes(normalizedQuery) || normalizedQuery.includes(firstNorm)) {
      return first.id;
    }
  }

  return undefined;
}

async function findSteamGridDbCover(item, query, artwork, steamGridDbKey, scheduleSteamGrid) {
  const id = await findSteamGridDbId(item, query, artwork, steamGridDbKey, scheduleSteamGrid);
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  const endpoint = "https://www.steamgriddb.com/api/v2/grids/game/" + id + "?dimensions=600x900&types=static&nsfw=false&humor=false";
  const response = await fetchJsonWithRetry(
    endpoint,
    { headers: { Authorization: "Bearer " + steamGridDbKey } },
    scheduleSteamGrid,
  );
  const grids = Array.isArray(response.data) ? response.data : [];
  const portrait = grids.find((grid) => {
    if (!hasUrl(grid.url)) return false;
    if (!Number.isFinite(grid.width) || !Number.isFinite(grid.height) || grid.height <= 0) return true;
    return Math.abs(grid.width / grid.height - 2 / 3) < 0.035;
  });

  if (!portrait) return null;
  artwork.steamGridDbId = id;
  return portrait.url;
}

async function findRawgGame(item, query, artwork, rawgKey, scheduleRawg) {
  if (typeof artwork.rawgSlug === "string" && artwork.rawgSlug.trim() !== "") {
    const detailsUrl = new URL("https://api.rawg.io/api/games/" + encodeURIComponent(artwork.rawgSlug));
    detailsUrl.searchParams.set("key", rawgKey);
    return fetchJsonWithRetry(detailsUrl, {}, scheduleRawg);
  }

  const searchUrl = new URL("https://api.rawg.io/api/games");
  searchUrl.searchParams.set("key", rawgKey);
  searchUrl.searchParams.set("search", query);
  searchUrl.searchParams.set("page_size", "10");
  searchUrl.searchParams.set("search_precise", "true");
  const response = await fetchJsonWithRetry(searchUrl, {}, scheduleRawg);
  const results = Array.isArray(response.results) ? response.results : [];
  const normalizedQuery = normalizeName(query);
  const titleMatch = results.find((game) => normalizeName(game.name ?? "") === normalizedQuery);
  const itemMatch = results.find((game) =>
    normalizeName(game.name ?? "") === normalizeName(item.title.en) ||
    normalizeName(game.name ?? "") === normalizeName(item.title.tr),
  );
  return titleMatch ?? itemMatch ?? null;
}

async function fetchRawgScreenshots(game, rawgKey, scheduleRawg) {
  if (!Number.isSafeInteger(game.id)) return [];
  const screenshotsUrl = new URL("https://api.rawg.io/api/games/" + game.id + "/screenshots");
  screenshotsUrl.searchParams.set("key", rawgKey);
  screenshotsUrl.searchParams.set("page_size", "6");
  const response = await fetchJsonWithRetry(screenshotsUrl, {}, scheduleRawg);
  return Array.isArray(response.results) ? response.results : [];
}

async function updateItem(item, catalogId, context) {
  const { force, steamGridDbKey, rawgKey, scheduleSteamGrid, scheduleRawg } = context;
  const artwork = ensureArtwork(item);
  const query = typeof artwork.query === "string" && artwork.query.trim() !== ""
    ? artwork.query.trim()
    : item.title.en;

  const hasCover = hasUrl(item.coverPath);
  const hasSteamGridCover = hasCover && artwork.coverProvider === "steamgriddb";
  const hasScreenshots = Array.isArray(item.screenshots) &&
    item.screenshots.some((screenshot) => hasUrl(screenshot.src));

  const needsSteamGridCover = Boolean(steamGridDbKey) && (force || !hasSteamGridCover);
  const needsRawgCoverFallback = Boolean(rawgKey) && (force || !hasCover);
  const needsScreenshots = Boolean(rawgKey) && (force || !hasScreenshots);

  if (!needsSteamGridCover && !needsRawgCoverFallback && !needsScreenshots) {
    return { changed: false, skipped: true };
  }

  let changed = false;
  let steamCover = null;

  if (needsSteamGridCover) {
    try {
      steamCover = await findSteamGridDbCover(item, query, artwork, steamGridDbKey, scheduleSteamGrid);
      if (steamCover) {
        item.coverPath = steamCover;
        artwork.coverProvider = "steamgriddb";
        changed = true;
      }
    } catch (error) {
      console.warn("[" + catalogId + "/" + item.slug + "] SteamGridDB: " + error.message);
    }
  }

  const shouldQueryRawg = needsScreenshots || (needsRawgCoverFallback && !steamCover && !hasCover);
  if (shouldQueryRawg) {
    try {
      const rawgGame = await findRawgGame(item, query, artwork, rawgKey, scheduleRawg);
      if (rawgGame) {
        if (typeof rawgGame.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawgGame.slug)) {
          artwork.rawgSlug = rawgGame.slug;
        }
        if ((force || !hasCover) && !steamCover && hasUrl(rawgGame.background_image)) {
          item.coverPath = rawgGame.background_image;
          artwork.coverProvider = "rawg";
          changed = true;
        }
        if (needsScreenshots) {
          const screenshots = await fetchRawgScreenshots(rawgGame, rawgKey, scheduleRawg);
          const validScreenshots = screenshots
            .filter((screenshot) => hasUrl(screenshot.image))
            .slice(0, 6)
            .map((screenshot, index) => ({
              src: screenshot.image,
              alt: {
                en: item.title.en + " screenshot " + (index + 1),
                tr: item.title.tr + " ekran görüntüsü " + (index + 1),
              },
            }));
          if (validScreenshots.length > 0) {
            item.screenshots = validScreenshots;
            artwork.screenshotProvider = "rawg";
            changed = true;
          }
        }
      }
    } catch (error) {
      console.warn("[" + catalogId + "/" + item.slug + "] RAWG: " + error.message);
    }
  }

  if (changed) artwork.syncedAt = new Date().toISOString();
  return { changed, skipped: false };
}

async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const environment = loadEnvironment();
  const steamGridDbKey = environment.STEAMGRIDDB_API_KEY?.trim();
  const rawgKey = environment.RAWG_API_KEY?.trim();

  if (!steamGridDbKey) console.warn("STEAMGRIDDB_API_KEY is missing; SteamGridDB cover lookups will be skipped.");
  if (!rawgKey) console.warn("RAWG_API_KEY is missing; RAWG screenshot and fallback cover lookups will be skipped.");

  if (!steamGridDbKey && !rawgKey) {
    console.log("No artwork updates were attempted. Add API keys to .env.local or the process environment.");
    return;
  }

  const scheduleSteamGrid = createRateLimiter(options.delayMs);
  const scheduleRawg = createRateLimiter(options.delayMs);
  const targetCatalogs = options.platformFilter ? [options.platformFilter] : CATALOG_IDS;

  let updatedItems = 0;
  let skippedItems = 0;
  let changedCatalogs = 0;

  for (const catalogId of targetCatalogs) {
    const filePath = path.join(projectRoot, "data", "catalog", catalogId + ".json");
    const items = JSON.parse(readFileSync(filePath, "utf8"));
    let platformUpdated = 0;
    let platformSkipped = 0;

    await runWithConcurrency(items, options.concurrency, async (item) => {
      const result = await updateItem(item, catalogId, {
        force: options.force,
        steamGridDbKey,
        rawgKey,
        scheduleSteamGrid,
        scheduleRawg,
      });

      if (result.changed) {
        platformUpdated += 1;
        updatedItems += 1;
        console.log((options.dryRun ? "[dry-run] " : "") + catalogId + "/" + item.slug + ": artwork URLs resolved.");
      } else if (result.skipped) {
        platformSkipped += 1;
        skippedItems += 1;
      }
    });

    if (platformUpdated > 0) {
      changedCatalogs += 1;
      if (!options.dryRun) writeFileSync(filePath, JSON.stringify(items, null, 2) + "\n", "utf8");
    }

    console.log(`${catalogId}: ${platformUpdated} updated, ${platformSkipped} skipped (${items.length} total).`);
  }

  if (updatedItems === 0) {
    console.log(`No artwork updates needed (${skippedItems} skipped); catalog JSON files were left unchanged.`);
  } else if (options.dryRun) {
    console.log(`Dry run: ${updatedItems} item(s) in ${changedCatalogs} catalog(s) would be updated (${skippedItems} skipped).`);
  } else {
    console.log(`Updated artwork URLs for ${updatedItems} item(s) in ${changedCatalogs} catalog(s) (${skippedItems} skipped).`);
  }
}

main().catch((error) => {
  console.error("Artwork sync failed: " + error.message);
  process.exitCode = 1;
});
