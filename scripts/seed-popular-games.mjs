import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_IDS = ["ps1", "ps2", "ps3", "switch", "wii", "wiiu"];
const DEFAULT_LIMIT = 50;
const PAGE_SIZE = 40;
const REQUEST_DELAY_MS = 250;

const PLATFORM_CONFIG = {
  ps1: {
    label: "PlayStation 1",
    fileFormat: "CHD disc image",
    fileExtension: ".chd",
    estimatedSizeBytes: 524288000,
    rawgSlugs: ["playstation1"],
    rawgNames: ["playstation", "playstation 1"],
  },
  ps2: {
    label: "PlayStation 2",
    fileFormat: "ISO disc image",
    fileExtension: ".iso",
    estimatedSizeBytes: 2684354560,
    rawgSlugs: ["playstation2"],
    rawgNames: ["playstation 2"],
  },
  ps3: {
    label: "PlayStation 3",
    fileFormat: "ISO disc image",
    fileExtension: ".iso",
    estimatedSizeBytes: 6442450944,
    rawgSlugs: ["playstation3"],
    rawgNames: ["playstation 3"],
  },
  switch: {
    label: "Nintendo Switch",
    fileFormat: "NSP package",
    fileExtension: ".nsp",
    estimatedSizeBytes: 4294967296,
    rawgSlugs: ["nintendo-switch"],
    rawgNames: ["nintendo switch"],
  },
  wii: {
    label: "Nintendo Wii",
    fileFormat: "WBFS image",
    fileExtension: ".wbfs",
    estimatedSizeBytes: 1610612736,
    rawgSlugs: ["wii"],
    rawgNames: ["wii", "nintendo wii"],
  },
  wiiu: {
    label: "Nintendo Wii U",
    fileFormat: "WUA archive",
    fileExtension: ".wua",
    estimatedSizeBytes: 3221225472,
    rawgSlugs: ["wii-u"],
    rawgNames: ["wii u", "nintendo wii u"],
  },
};

const GENRE_MAP = {
  action: { id: "action", en: "Action", tr: "Aksiyon" },
  adventure: { id: "adventure", en: "Adventure", tr: "Macera" },
  "role-playing-games-rpg": { id: "rpg", en: "RPG", tr: "RPG" },
  rpg: { id: "rpg", en: "RPG", tr: "RPG" },
  strategy: { id: "strategy", en: "Strategy", tr: "Strateji" },
  shooter: { id: "shooter", en: "Shooter", tr: "Nişancı" },
  casual: { id: "casual", en: "Casual", tr: "Günlük" },
  simulation: { id: "simulation", en: "Simulation", tr: "Simülasyon" },
  puzzle: { id: "puzzle", en: "Puzzle", tr: "Bulmaca" },
  arcade: { id: "arcade", en: "Arcade", tr: "Arcade" },
  platformer: { id: "platformer", en: "Platformer", tr: "Platform" },
  racing: { id: "racing", en: "Racing", tr: "Yarış" },
  "massively-multiplayer": { id: "multiplayer", en: "Multiplayer", tr: "Çok Oyunculu" },
  sports: { id: "sports", en: "Sports", tr: "Spor" },
  fighting: { id: "fighting", en: "Fighting", tr: "Dövüş" },
  family: { id: "family", en: "Family", tr: "Aile" },
  "board-games": { id: "board-games", en: "Board games", tr: "Masa oyunları" },
  educational: { id: "educational", en: "Educational", tr: "Eğitici" },
  card: { id: "card", en: "Card", tr: "Kart" },
  indie: { id: "indie", en: "Indie", tr: "Bağımsız" },
};

const ALLOWED_EXTENSIONS = {
  ps1: new Set([".chd", ".cue", ".bin", ".pbp", ".ccd", ".img", ".sub", ".iso"]),
  ps2: new Set([".iso", ".chd", ".cso", ".zso", ".elf"]),
  ps3: new Set([".pkg", ".iso"]),
  switch: new Set([".nro", ".nso", ".nsp", ".xci"]),
  wii: new Set([".wbfs", ".iso", ".ciso", ".gcz", ".dol"]),
  wiiu: new Set([".wud", ".wux", ".wua", ".rpx", ".wuhb"]),
};

function printUsage() {
  console.log("Usage: npm run seed:games [-- --limit=50] [--platform=ps2] [--dry-run] [--force]");
  console.log("Populates each console catalog with top popular games from RAWG (with empty sources[]).");
}

function parseCliArgs(argv) {
  let limit = DEFAULT_LIMIT;
  let platformFilter = null;
  let dryRun = false;
  let force = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--force") {
      force = true;
    } else if (arg.startsWith("--limit=")) {
      const raw = arg.slice("--limit=".length);
      if (!/^\d+$/.test(raw)) {
        throw new Error(`Invalid --limit value "${raw}". Expected an integer between 1 and 200.`);
      }
      const parsed = Number(raw);
      if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
        throw new Error(`Invalid --limit value "${raw}". Expected an integer between 1 and 200.`);
      }
      limit = parsed;
    } else if (arg.startsWith("--platform=")) {
      const candidate = arg.slice("--platform=".length).trim().toLowerCase();
      if (!CATALOG_IDS.includes(candidate)) {
        throw new Error(`Unknown platform "${candidate}". Expected one of: ${CATALOG_IDS.join(", ")}.`);
      }
      platformFilter = candidate;
    } else {
      throw new Error(`Unknown option "${arg}". Run with --help for usage.`);
    }
  }

  return { limit, platformFilter, dryRun, force, help };
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

let lastRequestAt = 0;

async function fetchJson(url) {
  const now = Date.now();
  const waitMs = Math.max(0, lastRequestAt + REQUEST_DELAY_MS - now);
  if (waitMs > 0) await sleep(waitMs);

  let attempt = 0;
  while (true) {
    attempt += 1;
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

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

    throw new Error(`HTTP ${response.status}`);
  }
}

function hasHttpsUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function sanitizeSlug(raw, fallback) {
  const ascii = String(raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return ascii || fallback;
}

function resolveSlug(game, platformId, usedSlugs) {
  const base = sanitizeSlug(game.slug || game.name, `game-${game.id}`);
  const scoped = base.endsWith(`-${platformId}`) ? base : `${base}-${platformId}`;
  if (!usedSlugs.has(scoped)) {
    usedSlugs.add(scoped);
    return scoped;
  }

  const withId = `${scoped}-${game.id}`;
  if (!usedSlugs.has(withId)) {
    usedSlugs.add(withId);
    return withId;
  }

  let counter = 2;
  while (usedSlugs.has(`${withId}-${counter}`)) {
    counter += 1;
  }
  const unique = `${withId}-${counter}`;
  usedSlugs.add(unique);
  return unique;
}

function mapGenres(genres) {
  const mapped = [];
  if (Array.isArray(genres)) {
    for (const genre of genres) {
      const slug = typeof genre?.slug === "string" ? genre.slug.toLowerCase() : "";
      if (slug && GENRE_MAP[slug]) {
        mapped.push(GENRE_MAP[slug]);
      } else if (typeof genre?.name === "string" && genre.name.trim() !== "") {
        const cleanId = sanitizeSlug(slug || genre.name, "");
        if (cleanId) {
          mapped.push({ id: cleanId, en: genre.name.trim(), tr: genre.name.trim() });
        }
      }
    }
  }

  if (mapped.length === 0) {
    return [{ id: "action", en: "Action", tr: "Aksiyon" }];
  }
  return mapped;
}

function buildDescription(game, platformLabel, mappedGenres, ratingScore) {
  const primaryGenres = mappedGenres.slice(0, 2);
  const enGenre = primaryGenres.map((genre) => genre.en).join(" / ");
  const trGenre = primaryGenres.map((genre) => genre.tr).join(" / ");
  const yearMatch = typeof game.released === "string" ? game.released.match(/^(\d{4})/) : null;
  const year = yearMatch ? yearMatch[1] : null;
  const hasMetacritic = typeof game.metacritic === "number" && game.metacritic > 0 && game.metacritic <= 100;
  const ratingSuffixEn = hasMetacritic
    ? ` (Metacritic ${Math.round(game.metacritic)}/100)`
    : ratingScore !== undefined
      ? ` (Score ${ratingScore}/100)`
      : "";
  const ratingSuffixTr = hasMetacritic
    ? ` (Metacritic ${Math.round(game.metacritic)}/100)`
    : ratingScore !== undefined
      ? ` (Puan ${ratingScore}/100)`
      : "";

  const en = year
    ? `${enGenre} title released in ${year} for ${platformLabel}${ratingSuffixEn}.`
    : `${enGenre} title for ${platformLabel}${ratingSuffixEn}.`;
  const tr = year
    ? `${year} yılında çıkan ${platformLabel} için ${trGenre} oyunu${ratingSuffixTr}.`
    : `${platformLabel} için ${trGenre} oyunu${ratingSuffixTr}.`;

  return { en, tr };
}

function buildRatingScore(game) {
  if (typeof game.metacritic === "number" && Number.isFinite(game.metacritic) && game.metacritic > 0 && game.metacritic <= 100) {
    return Math.round(game.metacritic);
  }
  if (typeof game.rating === "number" && Number.isFinite(game.rating) && game.rating > 0) {
    return Math.min(100, Math.max(1, Math.round(game.rating * 20)));
  }
  return undefined;
}

function buildTags(game, mappedGenres, platformId) {
  const tags = [];
  const seen = new Set();

  if (Array.isArray(game.tags)) {
    for (const tag of game.tags) {
      if (tag?.language && tag.language !== "eng") continue;
      const candidate = typeof tag?.slug === "string" && /^[a-z0-9-]+$/.test(tag.slug)
        ? tag.slug
        : sanitizeSlug(tag?.name, "");
      if (candidate && !seen.has(candidate)) {
        seen.add(candidate);
        tags.push(candidate);
        if (tags.length >= 5) return tags;
      }
    }
  }

  for (const genre of mappedGenres) {
    if (!seen.has(genre.id)) {
      seen.add(genre.id);
      tags.push(genre.id);
      if (tags.length >= 5) return tags;
    }
  }

  if (!seen.has(platformId)) {
    tags.push(platformId);
  }

  return tags.slice(0, 5);
}

function buildScreenshots(game, coverUrl, title) {
  const candidates = Array.isArray(game.short_screenshots)
    ? game.short_screenshots
        .map((entry) => entry?.image)
        .filter((url) => hasHttpsUrl(url))
    : [];

  const deduped = [...new Set(candidates)];
  const withoutCover = deduped.filter((url) => url !== coverUrl);
  const selected = (withoutCover.length > 0 ? withoutCover : deduped).slice(0, 6);

  return selected.map((src, index) => ({
    src,
    alt: {
      en: `${title} screenshot ${index + 1}`,
      tr: `${title} ekran görüntüsü ${index + 1}`,
    },
  }));
}

function normalizeUpdatedAt(game) {
  if (typeof game.updated === "string" && !Number.isNaN(Date.parse(game.updated))) {
    return new Date(game.updated).toISOString();
  }
  if (typeof game.released === "string" && /^\d{4}-\d{2}-\d{2}$/.test(game.released)) {
    const parsed = Date.parse(`${game.released}T00:00:00.000Z`);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function readExistingCatalog(filePath) {
  if (!existsSync(filePath)) return { bySlug: new Map(), byRawgSlug: new Map() };

  try {
    const items = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(items)) return { bySlug: new Map(), byRawgSlug: new Map() };

    const bySlug = new Map();
    const byRawgSlug = new Map();
    for (const item of items) {
      if (item && typeof item === "object") {
        if (typeof item.slug === "string") bySlug.set(item.slug, item);
        if (typeof item.artwork?.rawgSlug === "string") byRawgSlug.set(item.artwork.rawgSlug, item);
      }
    }
    return { bySlug, byRawgSlug };
  } catch {
    return { bySlug: new Map(), byRawgSlug: new Map() };
  }
}

async function resolveRawgPlatformIds(rawgKey) {
  const allPlatforms = [];
  let nextUrl = new URL("https://api.rawg.io/api/platforms");
  nextUrl.searchParams.set("key", rawgKey);
  nextUrl.searchParams.set("page_size", "50");

  let pageGuard = 0;
  while (nextUrl && pageGuard < 10) {
    pageGuard += 1;
    const payload = await fetchJson(nextUrl);
    if (Array.isArray(payload.results)) {
      allPlatforms.push(...payload.results);
    }
    if (typeof payload.next === "string" && payload.next.startsWith("https://")) {
      nextUrl = new URL(payload.next);
      if (!nextUrl.searchParams.has("key")) {
        nextUrl.searchParams.set("key", rawgKey);
      }
    } else {
      nextUrl = null;
    }
  }

  const resolved = {};
  for (const catalogId of CATALOG_IDS) {
    const config = PLATFORM_CONFIG[catalogId];
    const bySlug = allPlatforms.find(
      (entry) => typeof entry.slug === "string" && config.rawgSlugs.includes(entry.slug.toLowerCase()),
    );
    const byName = bySlug ?? allPlatforms.find((entry) => {
      if (typeof entry.name !== "string") return false;
      const normalized = entry.name.trim().toLowerCase();
      if (catalogId === "wii" && entry.slug === "wii-u") return false;
      return config.rawgNames.includes(normalized);
    });

    if (!byName || !Number.isSafeInteger(byName.id)) {
      throw new Error(`Could not resolve RAWG platform ID for "${catalogId}" from /api/platforms.`);
    }

    resolved[catalogId] = { id: byName.id, name: byName.name, slug: byName.slug };
  }

  return resolved;
}

async function fetchPopularGamesForPlatform(rawgKey, platformId, rawgPlatformId, limit) {
  const collected = [];
  const seenIds = new Set();
  let page = 1;

  while (collected.length < limit && page <= 10) {
    const url = new URL("https://api.rawg.io/api/games");
    url.searchParams.set("key", rawgKey);
    url.searchParams.set("platforms", String(rawgPlatformId));
    url.searchParams.set("ordering", "-added");
    url.searchParams.set("page_size", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));

    const payload = await fetchJson(url);
    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const game of results) {
      if (!game || !Number.isSafeInteger(game.id) || seenIds.has(game.id)) continue;
      if (typeof game.name !== "string" || game.name.trim() === "") continue;
      seenIds.add(game.id);
      collected.push(game);
      if (collected.length >= limit) break;
    }

    if (!payload.next || results.length === 0) break;
    page += 1;
  }

  return collected;
}

function mapRawgGameToCatalogItem(game, platformId, existingIndex, usedSlugs, force) {
  const config = PLATFORM_CONFIG[platformId];
  const title = game.name.trim();
  const slug = resolveSlug(game, platformId, usedSlugs);
  const rawgSlug = typeof game.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.slug)
    ? game.slug
    : undefined;

  const existing = existingIndex.bySlug.get(slug) ?? (rawgSlug ? existingIndex.byRawgSlug.get(rawgSlug) : undefined);
  const preservedSources = existing && Array.isArray(existing.sources) && existing.sources.length > 0
    ? existing.sources
    : [];

  const hasPreservedFormat =
    preservedSources.length > 0 &&
    typeof existing.fileFormat === "string" &&
    typeof existing.fileExtension === "string" &&
    ALLOWED_EXTENSIONS[platformId].has(existing.fileExtension.toLowerCase()) &&
    Number.isSafeInteger(existing.sizeBytes) &&
    existing.sizeBytes >= 0;

  const fileFormat = hasPreservedFormat ? existing.fileFormat : config.fileFormat;
  const fileExtension = hasPreservedFormat ? existing.fileExtension : config.fileExtension;
  const sizeBytes = hasPreservedFormat ? existing.sizeBytes : config.estimatedSizeBytes;
  const sizeBytesEstimated = hasPreservedFormat && typeof existing.sizeBytesEstimated === "boolean"
    ? existing.sizeBytesEstimated
    : true;

  const mappedGenres = mapGenres(game.genres);
  const primaryCategory = mappedGenres[0];
  const ratingScore = buildRatingScore(game);
  const description = buildDescription(game, config.label, mappedGenres, ratingScore);

  const yearMatch = typeof game.released === "string" ? game.released.match(/^(\d{4})/) : null;
  const version = yearMatch ? yearMatch[1] : "1.0";
  const developer =
    existing && typeof existing.developer === "string" && existing.developer.trim() !== ""
      ? existing.developer.trim()
      : "RAWG";

  const keepSyncedCover =
    !force &&
    existing &&
    hasHttpsUrl(existing.coverPath) &&
    (existing.artwork?.coverProvider === "steamgriddb" || Boolean(existing.artwork?.syncedAt));

  let coverPath;
  let coverProvider;
  if (keepSyncedCover) {
    coverPath = existing.coverPath;
    coverProvider = existing.artwork?.coverProvider;
  } else if (hasHttpsUrl(game.background_image)) {
    coverPath = game.background_image;
    coverProvider = "rawg";
  } else if (existing && hasHttpsUrl(existing.coverPath)) {
    coverPath = existing.coverPath;
    coverProvider = existing.artwork?.coverProvider;
  }

  const keepSyncedScreenshots =
    !force &&
    existing &&
    Boolean(existing.artwork?.syncedAt) &&
    Array.isArray(existing.screenshots) &&
    existing.screenshots.some((screenshot) => hasHttpsUrl(screenshot?.src));

  const screenshots = keepSyncedScreenshots
    ? existing.screenshots
    : buildScreenshots(game, coverPath, title);

  const artwork = {
    query: title.slice(0, 160),
    ...(rawgSlug ? { rawgSlug } : {}),
    ...(coverProvider === "steamgriddb" || coverProvider === "rawg" ? { coverProvider } : {}),
    ...(screenshots.length > 0 ? { screenshotProvider: keepSyncedScreenshots ? (existing.artwork?.screenshotProvider ?? "rawg") : "rawg" } : {}),
    ...(!force && Number.isSafeInteger(existing?.artwork?.steamGridDbId) && existing.artwork.steamGridDbId > 0
      ? { steamGridDbId: existing.artwork.steamGridDbId }
      : {}),
    ...(!force && typeof existing?.artwork?.syncedAt === "string" && !Number.isNaN(Date.parse(existing.artwork.syncedAt))
      ? { syncedAt: existing.artwork.syncedAt }
      : {}),
  };

  const item = {
    slug,
    catalogId: platformId,
    type: "game",
    categoryId: primaryCategory.id,
    category: { en: primaryCategory.en, tr: primaryCategory.tr },
    title: { en: title, tr: title },
    description,
    developer,
    version,
    sizeBytes,
    sizeBytesEstimated,
    ...(ratingScore !== undefined ? { ratingScore } : {}),
    fileFormat,
    fileExtension,
    ...(coverPath ? { coverPath } : {}),
    screenshots,
    artwork,
    tags: buildTags(game, mappedGenres, platformId),
    sourceUrl: `https://rawg.io/games/${rawgSlug ?? game.id}`,
    sources: preservedSources,
    updatedAt: normalizeUpdatedAt(game),
    sampleData: false,
  };

  return {
    item,
    preservedSourceCount: preservedSources.length > 0 ? 1 : 0,
    preservedCoverCount: keepSyncedCover ? 1 : 0,
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const environment = loadEnvironment();
  const rawgKey = environment.RAWG_API_KEY?.trim();
  if (!rawgKey) {
    console.error("RAWG_API_KEY is missing. Add RAWG_API_KEY to .env.local or the environment and try again.");
    process.exitCode = 1;
    return;
  }

  const resolvedPlatforms = await resolveRawgPlatformIds(rawgKey);
  const targetPlatforms = options.platformFilter ? [options.platformFilter] : CATALOG_IDS;

  console.log(
    "Resolved RAWG platforms: " +
      targetPlatforms.map((id) => `${id}=${resolvedPlatforms[id].id} (${resolvedPlatforms[id].slug})`).join(", "),
  );

  let totalSeeded = 0;
  for (const platformId of targetPlatforms) {
    const filePath = path.join(projectRoot, "data", "catalog", `${platformId}.json`);
    const existingIndex = readExistingCatalog(filePath);
    const usedSlugs = new Set();

    const rawgGames = await fetchPopularGamesForPlatform(
      rawgKey,
      platformId,
      resolvedPlatforms[platformId].id,
      options.limit,
    );

    let preservedSources = 0;
    let preservedCovers = 0;
    const mappedItems = rawgGames.map((game) => {
      const mapped = mapRawgGameToCatalogItem(game, platformId, existingIndex, usedSlugs, options.force);
      preservedSources += mapped.preservedSourceCount;
      preservedCovers += mapped.preservedCoverCount;
      return mapped.item;
    });

    totalSeeded += mappedItems.length;
    if (!options.dryRun) {
      writeFileSync(filePath, JSON.stringify(mappedItems, null, 2) + "\n", "utf8");
    }

    console.log(
      `${options.dryRun ? "[dry-run] " : ""}${platformId}: seeded ${mappedItems.length} game(s)` +
        (preservedSources > 0 ? `, preserved sources on ${preservedSources}` : "") +
        (preservedCovers > 0 ? `, kept synced covers on ${preservedCovers}` : "") +
        ".",
    );
  }

  console.log(
    `${options.dryRun ? "Dry run complete: " : "Seeding complete: "}${totalSeeded} game(s) across ${targetPlatforms.length} platform(s).`,
  );
}

main().catch((error) => {
  console.error(`Game seeding failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
