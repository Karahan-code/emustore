import { readFileSync, statSync } from "node:fs";
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

const deliveryModes = new Set(["direct", "browser_verify", "github_api", "debrid"]);
const problems = [];
const globalSlugs = new Set();
let itemCount = 0;
let sourceCount = 0;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkSource(source, platform, itemSlug, index) {
  const context = `data/catalog/${platform}.json item "${itemSlug}" source ${index + 1}`;
  if (!isRecord(source)) {
    problems.push(`${context}: source must be an object.`);
    return;
  }

  const allowedExtensions = new Set(
    PLATFORM_CATALOGS[platform].formats.flatMap((format) => format.extensions.map((extension) => extension.toLowerCase())),
  );
  const url = typeof source.url === "string" ? safeUrl(source.url) : null;

  if (typeof source.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id)) {
    problems.push(`${context}: id must be a lowercase slug.`);
  }
  if (typeof source.provider !== "string" || source.provider.trim() === "" || source.provider.length > 80) {
    problems.push(`${context}: provider must be a non-empty string of at most 80 characters.`);
  }
  if (!deliveryModes.has(source.deliveryMode)) {
    problems.push(`${context}: deliveryMode must be direct, browser_verify, github_api, or debrid.`);
  }
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    problems.push(`${context}: url must be a valid HTTP or HTTPS URL without credentials.`);
  }
  if (typeof source.format !== "string" || !allowedExtensions.has(source.format.toLowerCase())) {
    problems.push(`${context}: format must be an allowed extension for ${platform}.`);
  }
  if (!Number.isSafeInteger(source.sizeBytes) || source.sizeBytes <= 0) {
    problems.push(`${context}: sizeBytes must be a positive safe integer.`);
  }
  if (source.sha256 !== undefined && (typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(source.sha256))) {
    problems.push(`${context}: sha256 must contain exactly 64 hexadecimal characters.`);
  }
  if (typeof source.requiresVerification !== "boolean") {
    problems.push(`${context}: requiresVerification must be a boolean.`);
  }
  if (!Number.isSafeInteger(source.priority) || source.priority < 0) {
    problems.push(`${context}: priority must be a non-negative safe integer.`);
  }
  if (source.verifiedAt !== undefined && (typeof source.verifiedAt !== "string" || Number.isNaN(Date.parse(source.verifiedAt)))) {
    problems.push(`${context}: verifiedAt must be a valid date string when present.`);
  }
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isExistingPublicAsset(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  const publicRoot = path.resolve(projectRoot, "public");
  const candidate = path.resolve(publicRoot, value.slice(1));
  if (!candidate.startsWith(publicRoot + path.sep)) return false;

  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function checkArtworkReference(value, context) {
  if (value === undefined || value === "") return;
  if (typeof value !== "string") {
    problems.push(context + ": must be an HTTPS URL, a valid public asset path, or empty.");
    return;
  }

  const url = safeUrl(value);
  if (url && url.protocol === "https:" && !url.username && !url.password) return;
  if (isExistingPublicAsset(value)) return;
  problems.push(context + ": must be a valid HTTPS URL or an existing public asset path.");
}

function checkArtworkMetadata(value, context) {
  if (!isRecord(value)) {
    problems.push(context + ": artwork must be an object.");
    return;
  }
  if (value.query !== undefined && (typeof value.query !== "string" || value.query.trim() === "" || value.query.length > 160)) {
    problems.push(context + ": query must be a non-empty string of at most 160 characters.");
  }
  if (value.steamGridDbId !== undefined && (!Number.isSafeInteger(value.steamGridDbId) || value.steamGridDbId <= 0)) {
    problems.push(context + ": steamGridDbId must be a positive safe integer.");
  }
  if (value.rawgSlug !== undefined && (typeof value.rawgSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.rawgSlug))) {
    problems.push(context + ": rawgSlug must be a lowercase slug.");
  }
  if (value.syncedAt !== undefined && (typeof value.syncedAt !== "string" || Number.isNaN(Date.parse(value.syncedAt)))) {
    problems.push(context + ": syncedAt must be a valid date string when present.");
  }
  if (value.coverProvider !== undefined && value.coverProvider !== "steamgriddb" && value.coverProvider !== "rawg") {
    problems.push(context + ": coverProvider must be steamgriddb or rawg.");
  }
  if (value.screenshotProvider !== undefined && value.screenshotProvider !== "rawg") {
    problems.push(context + ": screenshotProvider must be rawg when present.");
  }
}

for (const platform of PLATFORM_CATALOG_IDS) {
  const filePath = path.join(projectRoot, "data/catalog", `${platform}.json`);
  let items;
  try {
    items = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    problems.push(`${path.relative(projectRoot, filePath)}: could not read valid JSON (${error.message}).`);
    continue;
  }

  if (!Array.isArray(items)) {
    problems.push(`${path.relative(projectRoot, filePath)}: catalog must be a JSON array.`);
    continue;
  }

  const platformSlugs = new Set();
  for (const [index, item] of items.entries()) {
    const context = `${path.relative(projectRoot, filePath)} item ${index + 1}`;
    if (!isRecord(item)) {
      problems.push(`${context}: item must be an object.`);
      continue;
    }

    itemCount += 1;
    if (typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) {
      problems.push(`${context}: slug must be a lowercase slug.`);
    } else {
      if (platformSlugs.has(item.slug)) problems.push(`${context}: duplicate slug "${item.slug}" in this catalog.`);
      if (globalSlugs.has(item.slug)) problems.push(`${context}: slug "${item.slug}" is duplicated across catalogs.`);
      platformSlugs.add(item.slug);
      globalSlugs.add(item.slug);
    }
    if (item.catalogId !== platform) problems.push(`${context}: catalogId must match "${platform}".`);
    checkArtworkReference(item.coverPath, context + " coverPath");
    if (!Array.isArray(item.screenshots)) {
      problems.push(context + ": screenshots must be an array.");
    } else {
      item.screenshots.forEach((screenshot, screenshotIndex) => {
        const screenshotContext = context + " screenshot " + (screenshotIndex + 1);
        if (!isRecord(screenshot)) {
          problems.push(screenshotContext + ": screenshot must be an object.");
          return;
        }
        checkArtworkReference(screenshot.src, screenshotContext + " src");
        if (!isRecord(screenshot.alt) || !["en", "tr"].every((locale) =>
          typeof screenshot.alt[locale] === "string" && screenshot.alt[locale].trim() !== "",
        )) {
          problems.push(screenshotContext + ": alt must contain non-empty en and tr strings.");
        }
      });
    }
    if (item.artwork !== undefined) checkArtworkMetadata(item.artwork, context + " artwork");

    if (!Array.isArray(item.sources) || item.sources.length === 0) {
      problems.push(`${context}: sources must contain at least one source.`);
      continue;
    }

    const sourceIds = new Set();
    item.sources.forEach((source, sourceIndex) => {
      checkSource(source, platform, item.slug ?? `#${index + 1}`, sourceIndex);
      sourceCount += 1;
      if (isRecord(source) && typeof source.id === "string") {
        if (sourceIds.has(source.id)) problems.push(`${context}: duplicate source id "${source.id}".`);
        sourceIds.add(source.id);
      }
    });
  }
}

if (problems.length > 0) {
  console.error(`Catalog validation failed with ${problems.length} issue(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${PLATFORM_CATALOG_IDS.length} platform catalogs, ${itemCount} items, and ${sourceCount} sources.`);
}
