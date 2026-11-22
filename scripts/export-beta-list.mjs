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

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;
const BYTES_PER_GB = BYTES_PER_MB * 1024;
const WEB_PAGE_EXTENSIONS = new Set([".html", ".htm", ".php", ".asp", ".aspx", ".jsp"]);

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes >= BYTES_PER_GB) {
    return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
  }
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / BYTES_PER_KB))} KB`;
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function extractExtension(urlStr, fallbackExt) {
  try {
    const parsed = new URL(urlStr);
    const segment = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
    const match = segment.match(/(\.[a-z0-9]{1,12})$/i);
    if (match && !WEB_PAGE_EXTENSIONS.has(match[1].toLowerCase())) {
      return match[1].toUpperCase();
    }
  } catch {
    // Fall back to item extension.
  }
  return String(fallbackExt ?? "").toUpperCase();
}

function normalizeItemSources(item) {
  if (!Array.isArray(item.sources) || item.sources.length === 0) return [];

  const normalized = item.sources.map((entry, index) => {
    if (typeof entry === "string") {
      let provider = "direct";
      try {
        provider = new URL(entry).hostname.replace(/^www\./i, "");
      } catch {
        // Keep fallback provider label.
      }
      return {
        provider,
        format: extractExtension(entry, item.fileExtension),
        sizeBytes: item.sizeBytes ?? 0,
        priority: index + 1,
      };
    }

    return {
      provider: String(entry.provider ?? "direct").trim(),
      format: String(entry.format ?? item.fileExtension ?? "").toUpperCase(),
      sizeBytes: Number(entry.sizeBytes ?? item.sizeBytes ?? 0),
      priority: Number.isFinite(entry.priority) ? entry.priority : index + 1,
    };
  });

  return normalized.sort((left, right) => left.priority - right.priority);
}

const summaryRows = [];
const platformSections = [];
let totalReady = 0;
let totalItems = 0;
let totalSources = 0;

for (const platformId of PLATFORM_CATALOG_IDS) {
  const catalogPath = path.join(projectRoot, "data", "catalog", `${platformId}.json`);
  const items = JSON.parse(readFileSync(catalogPath, "utf8"));
  const definition = PLATFORM_CATALOGS[platformId];

  const readyItems = items
    .map((item) => ({
      item,
      sources: normalizeItemSources(item),
    }))
    .filter((entry) => entry.sources.length > 0)
    .sort((left, right) => left.item.title.en.localeCompare(right.item.title.en, "en"));

  const platformSources = readyItems.reduce((sum, entry) => sum + entry.sources.length, 0);
  const coverage = items.length > 0 ? Math.round((readyItems.length / items.length) * 100) : 0;

  totalReady += readyItems.length;
  totalItems += items.length;
  totalSources += platformSources;

  summaryRows.push(
    `| ${escapeMarkdownCell(definition.label)} | ${readyItems.length} / ${items.length} | ${coverage}% | ${platformSources} |`,
  );

  const lines = [`## ${definition.label} (${readyItems.length} / ${items.length})`, ""];
  if (readyItems.length === 0) {
    lines.push("_No downloadable games yet._", "");
  } else {
    lines.push(
      "| # | Title | Format | Size | Providers |",
      "| ---: | --- | --- | ---: | --- |",
    );
    readyItems.forEach(({ item, sources }, index) => {
      const uniqueFormats = [...new Set(sources.map((s) => s.format).filter(Boolean))];
      const formatText = uniqueFormats.join(", ") || String(item.fileExtension ?? "").toUpperCase();
      const primarySize = sources[0]?.sizeBytes > 0 ? sources[0].sizeBytes : item.sizeBytes;
      const uniqueProviders = [...new Set(sources.map((s) => s.provider).filter(Boolean))];
      lines.push(
        `| ${index + 1} | ${escapeMarkdownCell(item.title.en)} | ${escapeMarkdownCell(formatText)} | ${formatSize(primarySize)} | ${escapeMarkdownCell(uniqueProviders.join(", "))} |`,
      );
    });
    lines.push("");
  }

  platformSections.push(lines.join("\n"));
}

const totalCoverage = totalItems > 0 ? Math.round((totalReady / totalItems) * 100) : 0;

const documentLines = [
  "# EmuStore Beta Games",
  "",
  `> Generated automatically from \`data/catalog/*.json\` via \`npm run export:beta-list\`. **${totalReady} / ${totalItems}** downloadable games across ${PLATFORM_CATALOG_IDS.length} platforms (**${totalSources}** verified sources).`,
  "",
  "## Platform Summary",
  "",
  "| Platform | Ready / Total | Coverage | Sources |",
  "| --- | ---: | ---: | ---: |",
  ...summaryRows,
  `| **Total** | **${totalReady} / ${totalItems}** | **${totalCoverage}%** | **${totalSources}** |`,
  "",
  ...platformSections,
];

const outputPath = path.join(projectRoot, "BETA_GAMES.md");
writeFileSync(outputPath, documentLines.join("\n").trimEnd() + "\n", "utf8");
console.log(
  `Generated BETA_GAMES.md: ${totalReady}/${totalItems} downloadable games (${totalSources} total sources).`,
);
