import type { PlatformCatalogId } from "@/lib/catalog/platforms";

export const LOCALES = ["en", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export type LocalizedText = Record<Locale, string>;

export const CATALOG_ITEM_TYPES = [
  "game",
  "homebrew",
  "emulator",
  "utility",
] as const;
export type CatalogItemType = (typeof CATALOG_ITEM_TYPES)[number];

export type CatalogScreenshot = {
  src?: string;
  alt: LocalizedText;
};

export type CatalogArtwork = {
  query?: string;
  steamGridDbId?: number;
  rawgSlug?: string;
  syncedAt?: string;
  coverProvider?: "steamgriddb" | "rawg";
  screenshotProvider?: "rawg";
};

export const DOWNLOAD_DELIVERY_MODES = [
  "direct",
  "browser_verify",
  "github_api",
  "debrid",
] as const;
export type DownloadDeliveryMode = (typeof DOWNLOAD_DELIVERY_MODES)[number];

export type DownloadSource = {
  id: string;
  provider: string;
  deliveryMode: DownloadDeliveryMode;
  url: string;
  format: string;
  sizeBytes: number;
  sha256?: string;
  requiresVerification: boolean;
  priority: number;
  verifiedAt?: string;
};

export type DownloadSourceInput = DownloadSource | string;

export type CatalogItem = {
  slug: string;
  catalogId: PlatformCatalogId;
  type: CatalogItemType;
  categoryId: string;
  category: LocalizedText;
  title: LocalizedText;
  description: LocalizedText;
  developer: string;
  version: string;
  sizeBytes: number;
  sizeBytesEstimated: boolean;
  ratingScore?: number;
  metacritic?: number;
  rating?: number;
  ratingsCount?: number;
  releasedAt?: string;
  fileFormat: string;
  fileExtension: string;
  coverPath?: string;
  screenshots: CatalogScreenshot[];
  artwork?: CatalogArtwork;
  tags: string[];
  sourceUrl: string;
  sources: DownloadSource[];
  updatedAt: string;
  sampleData: boolean;
};

export type CatalogSort = "popular" | "title" | "size" | "updated" | "rating";

export type CatalogQuery = {
  platform: PlatformCatalogId;
  q?: string;
  type?: CatalogItemType;
  category?: string;
  format?: string;
  locale: Locale;
  limit: number;
  offset: number;
  sort: CatalogSort;
};

export type CatalogPage = {
  items: CatalogItem[];
  total: number;
  limit: number;
  offset: number;
};

export type CatalogFacets = {
  categories: Array<{ id: string; label: LocalizedText }>;
  types: CatalogItemType[];
  formats: Array<{ extension: string; label: string }>;
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((locale) => locale === value);
}

export function isCatalogItemType(value: unknown): value is CatalogItemType {
  return (
    typeof value === "string" &&
    CATALOG_ITEM_TYPES.some((itemType) => itemType === value)
  );
}
