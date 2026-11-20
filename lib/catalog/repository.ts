import ps1Seed from "@/data/catalog/ps1.json";
import ps2Seed from "@/data/catalog/ps2.json";
import ps3Seed from "@/data/catalog/ps3.json";
import switchSeed from "@/data/catalog/switch.json";
import wiiSeed from "@/data/catalog/wii.json";
import wiiuSeed from "@/data/catalog/wiiu.json";
import {
  isPlatformExtension,
  PLATFORM_CATALOG_IDS,
  type PlatformCatalogId,
} from "@/lib/catalog/platforms";
import {
  CATALOG_ITEM_TYPES,
  LOCALES,
  type CatalogItem,
  type CatalogPage,
  type CatalogQuery,
  type LocalizedText,
} from "@/lib/catalog/types";

const rawCatalogs: Record<PlatformCatalogId, unknown> = {
  ps1: ps1Seed,
  ps2: ps2Seed,
  ps3: ps3Seed,
  switch: switchSeed,
  wii: wiiSeed,
  wiiu: wiiuSeed,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    isRecord(value) &&
    LOCALES.every(
      (locale) => typeof value[locale] === "string" && value[locale].trim() !== "",
    )
  );
}

function isScreenshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.src === "string" &&
    value.src.startsWith("/images/catalog/") &&
    isLocalizedText(value.alt)
  );
}

function isCatalogItemForPlatform(
  value: unknown,
  platform: PlatformCatalogId,
): value is CatalogItem {
  if (!isRecord(value)) return false;

  return (
    typeof value.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) &&
    value.catalogId === platform &&
    typeof value.type === "string" &&
    CATALOG_ITEM_TYPES.some((itemType) => itemType === value.type) &&
    typeof value.categoryId === "string" &&
    isLocalizedText(value.category) &&
    isLocalizedText(value.title) &&
    isLocalizedText(value.description) &&
    typeof value.developer === "string" &&
    typeof value.version === "string" &&
    typeof value.sizeBytes === "number" &&
    Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes >= 0 &&
    typeof value.sizeBytesEstimated === "boolean" &&
    typeof value.fileFormat === "string" &&
    typeof value.fileExtension === "string" &&
    isPlatformExtension(platform, value.fileExtension) &&
    typeof value.coverPath === "string" &&
    value.coverPath.startsWith(`/images/catalog/${platform}/`) &&
    Array.isArray(value.screenshots) &&
    value.screenshots.length > 0 &&
    value.screenshots.every(isScreenshot) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    typeof value.sourceUrl === "string" &&
    value.sourceUrl.startsWith("https://") &&
    typeof value.updatedAt === "string" &&
    !Number.isNaN(Date.parse(value.updatedAt)) &&
    typeof value.sampleData === "boolean"
  );
}

function loadCatalog(platform: PlatformCatalogId): CatalogItem[] {
  const rawItems = rawCatalogs[platform];

  if (!Array.isArray(rawItems)) {
    throw new Error(`Catalog seed for ${platform} must be a JSON array.`);
  }

  const items = rawItems.map((item, index) => {
    if (!isCatalogItemForPlatform(item, platform)) {
      throw new Error(`Catalog seed for ${platform} has an invalid item at index ${index}.`);
    }

    return item;
  });

  const slugs = new Set<string>();
  for (const item of items) {
    if (slugs.has(item.slug)) {
      throw new Error(`Catalog seed for ${platform} contains duplicate slug "${item.slug}".`);
    }
    slugs.add(item.slug);
  }

  return items;
}

const catalogs = Object.fromEntries(
  PLATFORM_CATALOG_IDS.map((platform) => [platform, loadCatalog(platform)]),
) as Record<PlatformCatalogId, CatalogItem[]>;

function normalize(value: string, locale: CatalogQuery["locale"]): string {
  return value.normalize("NFKC").toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US");
}

export function getCatalogItems(platform: PlatformCatalogId): readonly CatalogItem[] {
  return catalogs[platform];
}

export function getCatalogItem(
  platform: PlatformCatalogId,
  slug: string,
): CatalogItem | undefined {
  return catalogs[platform].find((item) => item.slug === slug);
}

export function queryCatalog(query: CatalogQuery): CatalogPage {
  const normalizedQuery = query.q ? normalize(query.q.trim(), query.locale) : "";
  const normalizedFormat = query.format?.toLowerCase();

  let matches = catalogs[query.platform].filter((item) => {
    if (query.type && item.type !== query.type) return false;
    if (query.category && item.categoryId !== query.category) return false;
    if (normalizedFormat && item.fileExtension.toLowerCase() !== normalizedFormat) return false;

    if (normalizedQuery) {
      const searchable = [
        item.title.en,
        item.title.tr,
        item.description.en,
        item.description.tr,
        item.category.en,
        item.category.tr,
        item.developer,
        ...item.tags,
      ]
        .map((value) => normalize(value, query.locale))
        .join(" ");

      if (!searchable.includes(normalizedQuery)) return false;
    }

    return true;
  });

  matches = [...matches].sort((left, right) => {
    if (query.sort === "size") return left.sizeBytes - right.sizeBytes;
    if (query.sort === "updated") return right.updatedAt.localeCompare(left.updatedAt);

    return left.title[query.locale].localeCompare(right.title[query.locale], query.locale);
  });

  return {
    items: matches.slice(query.offset, query.offset + query.limit),
    total: matches.length,
    limit: query.limit,
    offset: query.offset,
  };
}
