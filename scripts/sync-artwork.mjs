import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogIds = ["ps1", "ps2", "ps3", "switch", "wii", "wiiu"];
const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const dryRun = args.has("--dry-run");

if ([...args].some((arg) => arg !== "--force" && arg !== "--dry-run" && arg !== "--help")) {
  console.error("Usage: npm run sync:artwork [-- --dry-run] [--force]");
  process.exit(1);
}

if (args.has("--help")) {
  console.log("Usage: npm run sync:artwork [-- --dry-run] [--force]");
  console.log("Resolves CDN URLs in catalog JSON. It never downloads image files.");
  process.exit(0);
}

function loadEnvironment() {
  const environment = { ...process.env };
  const envPath = path.join(projectRoot, ".env.local");
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

const environment = loadEnvironment();
const steamGridDbKey = environment.STEAMGRIDDB_API_KEY?.trim();
const rawgKey = environment.RAWG_API_KEY?.trim();

function normalizeName(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]/g, "");
}

function hasUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function ensureArtwork(item) {
  item.artwork ??= {};
  return item.artwork;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  return response.json();
}

async function findSteamGridDbId(item, query, artwork) {
  if (Number.isSafeInteger(artwork.steamGridDbId) && artwork.steamGridDbId > 0) {
    return artwork.steamGridDbId;
  }

  const endpoint = "https://www.steamgriddb.com/api/v2/search/autocomplete/" + encodeURIComponent(query);
  const response = await fetchJson(endpoint, {
    headers: { Authorization: "Bearer " + steamGridDbKey },
  });
  const results = Array.isArray(response.data) ? response.data : [];
  const normalizedQuery = normalizeName(query);
  const titleMatch = results.find((result) => normalizeName(result.name ?? "") === normalizedQuery);
  const itemMatch = results.find((result) =>
    normalizeName(result.name ?? "") === normalizeName(item.title.en) ||
    normalizeName(result.name ?? "") === normalizeName(item.title.tr),
  );
  return (titleMatch ?? itemMatch)?.id;
}

async function findSteamGridDbCover(item, query, artwork) {
  const id = await findSteamGridDbId(item, query, artwork);
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  const endpoint = "https://www.steamgriddb.com/api/v2/grids/game/" + id + "?dimensions=600x900";
  const response = await fetchJson(endpoint, {
    headers: { Authorization: "Bearer " + steamGridDbKey },
  });
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

async function findRawgGame(item, query, artwork) {
  if (typeof artwork.rawgSlug === "string" && artwork.rawgSlug.trim() !== "") {
    const detailsUrl = new URL("https://api.rawg.io/api/games/" + encodeURIComponent(artwork.rawgSlug));
    detailsUrl.searchParams.set("key", rawgKey);
    return fetchJson(detailsUrl);
  }

  const searchUrl = new URL("https://api.rawg.io/api/games");
  searchUrl.searchParams.set("key", rawgKey);
  searchUrl.searchParams.set("search", query);
  searchUrl.searchParams.set("page_size", "10");
  searchUrl.searchParams.set("search_precise", "true");
  const response = await fetchJson(searchUrl);
  const results = Array.isArray(response.results) ? response.results : [];
  const normalizedQuery = normalizeName(query);
  const titleMatch = results.find((game) => normalizeName(game.name ?? "") === normalizedQuery);
  const itemMatch = results.find((game) =>
    normalizeName(game.name ?? "") === normalizeName(item.title.en) ||
    normalizeName(game.name ?? "") === normalizeName(item.title.tr),
  );
  return titleMatch ?? itemMatch ?? null;
}

async function fetchRawgScreenshots(game) {
  if (!Number.isSafeInteger(game.id)) return [];
  const screenshotsUrl = new URL("https://api.rawg.io/api/games/" + game.id + "/screenshots");
  screenshotsUrl.searchParams.set("key", rawgKey);
  screenshotsUrl.searchParams.set("page_size", "6");
  const response = await fetchJson(screenshotsUrl);
  return Array.isArray(response.results) ? response.results : [];
}

function updateItem(item, catalogId) {
  const artwork = ensureArtwork(item);
  const query = typeof artwork.query === "string" && artwork.query.trim() !== ""
    ? artwork.query.trim()
    : item.title.en;
  let changed = false;
  let rawgGame = null;

  return (async () => {
    const needsCover = force || !hasUrl(item.coverPath);
    const needsScreenshots = force || !Array.isArray(item.screenshots) ||
      !item.screenshots.some((screenshot) => hasUrl(screenshot.src));
    let steamCover = null;

    if (needsCover && steamGridDbKey) {
      try {
        steamCover = await findSteamGridDbCover(item, query, artwork);
        if (steamCover) {
          item.coverPath = steamCover;
          artwork.coverProvider = "steamgriddb";
          changed = true;
        }
      } catch (error) {
        console.warn("[" + catalogId + "/" + item.slug + "] SteamGridDB: " + error.message);
      }
    }

    if ((needsScreenshots || (needsCover && !steamCover)) && rawgKey) {
      try {
        rawgGame = await findRawgGame(item, query, artwork);
        if (rawgGame) {
          artwork.rawgSlug = rawgGame.slug;
          if (needsCover && !steamCover && hasUrl(rawgGame.background_image)) {
            item.coverPath = rawgGame.background_image;
            artwork.coverProvider = "rawg";
            changed = true;
          }
          if (needsScreenshots) {
            const screenshots = await fetchRawgScreenshots(rawgGame);
            const validScreenshots = screenshots
              .filter((screenshot) => hasUrl(screenshot.image))
              .slice(0, 4)
              .map((screenshot, index) => ({
                src: screenshot.image,
                alt: {
                  en: item.title.en + " gameplay screenshot " + (index + 1),
                  tr: item.title.tr + " oynanış ekran görüntüsü " + (index + 1),
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
    return changed;
  })();
}

async function main() {
  if (!steamGridDbKey) console.warn("STEAMGRIDDB_API_KEY is missing; SteamGridDB cover lookups will be skipped.");
  if (!rawgKey) console.warn("RAWG_API_KEY is missing; RAWG screenshot and fallback cover lookups will be skipped.");

  if (!steamGridDbKey && !rawgKey) {
    console.log("No artwork updates were attempted. Add API keys to .env.local or the process environment.");
    return;
  }

  let updatedItems = 0;
  let changedCatalogs = 0;
  for (const catalogId of catalogIds) {
    const filePath = path.join(projectRoot, "data", "catalog", catalogId + ".json");
    const items = JSON.parse(readFileSync(filePath, "utf8"));
    let catalogChanged = false;

    for (const item of items) {
      if (await updateItem(item, catalogId)) {
        updatedItems += 1;
        catalogChanged = true;
        console.log((dryRun ? "[dry-run] " : "") + catalogId + "/" + item.slug + ": artwork URLs resolved.");
      }
    }

    if (catalogChanged) {
      changedCatalogs += 1;
      if (!dryRun) writeFileSync(filePath, JSON.stringify(items, null, 2) + "\n", "utf8");
    }
  }

  if (updatedItems === 0) {
    console.log("No artwork matches were found; catalog JSON files were left unchanged.");
  } else if (dryRun) {
    console.log("Dry run: " + updatedItems + " item(s) in " + changedCatalogs + " catalog(s) would be updated.");
  } else {
    console.log("Updated artwork URLs for " + updatedItems + " item(s) in " + changedCatalogs + " catalog(s).");
  }
}

main().catch((error) => {
  console.error("Artwork sync failed: " + error.message);
  process.exitCode = 1;
});
