import {
  DEFAULT_OTA_CATALOG_BASE_URL,
  isValidOtaBaseUrl,
  normalizeOtaBaseUrl,
  readOtaCatalogConfig,
  writeOtaCatalogConfig,
} from "@/lib/catalog/ota-config";
import { PLATFORM_CATALOG_IDS, type PlatformCatalogId } from "@/lib/catalog/platforms";
import {
  buildCatalogFacets,
  getCatalogItems,
  parseAndNormalizeCatalog,
  queryCatalogItems,
} from "@/lib/catalog/repository";
import type {
  CatalogFacets,
  CatalogItem,
  CatalogPage,
  CatalogQuery,
} from "@/lib/catalog/types";
import { nativeBridge, type NativeCatalogSyncResult } from "@/lib/native/bridge";

export const CATALOG_UPDATED_EVENT = "emustore:catalog-updated";

const BROWSER_OTA_CACHE_PREFIX = "emustore:ota-catalog-cache:";

export type OtaCatalogMode = "bundled" | "ota" | "offline";

export type OtaSyncOutcome = {
  ok: boolean;
  mode: OtaCatalogMode;
  updatedPlatforms: PlatformCatalogId[];
  skippedPlatforms: PlatformCatalogId[];
  failedPlatforms: PlatformCatalogId[];
  syncedAt: string | null;
  error: string | null;
};

export type OtaCatalogSnapshot = {
  version: number;
  catalogs: Record<PlatformCatalogId, readonly CatalogItem[]>;
  otaPlatforms: readonly PlatformCatalogId[];
  mode: OtaCatalogMode;
  syncing: boolean;
  daemonConnected: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  lastSyncSummary: OtaSyncOutcome | null;
};

function buildBundledCatalogMap(): Record<PlatformCatalogId, readonly CatalogItem[]> {
  return Object.fromEntries(
    PLATFORM_CATALOG_IDS.map((platform) => [platform, getCatalogItems(platform)]),
  ) as Record<PlatformCatalogId, readonly CatalogItem[]>;
}

const BUNDLED_CATALOGS = buildBundledCatalogMap();

const BUNDLED_SNAPSHOT: OtaCatalogSnapshot = {
  version: 0,
  catalogs: BUNDLED_CATALOGS,
  otaPlatforms: [],
  mode: "bundled",
  syncing: false,
  daemonConnected: false,
  lastSyncedAt: null,
  lastError: null,
  lastSyncSummary: null,
};

let currentSnapshot: OtaCatalogSnapshot = BUNDLED_SNAPSHOT;
let nextVersion = 1;
const listeners = new Set<() => void>();
let startupPromise: Promise<void> | null = null;
let activeSyncPromise: Promise<OtaSyncOutcome> | null = null;

function notifyListeners(emitWindowEvent = false): void {
  for (const listener of listeners) {
    listener();
  }
  if (emitWindowEvent && typeof window !== "undefined") {
    window.dispatchEvent(new Event(CATALOG_UPDATED_EVENT));
  }
}

function updateSnapshot(
  patch: Partial<Omit<OtaCatalogSnapshot, "version">>,
  emitWindowEvent = false,
): void {
  currentSnapshot = {
    ...currentSnapshot,
    ...patch,
    version: nextVersion,
  };
  nextVersion += 1;
  notifyListeners(emitWindowEvent);
}

export function subscribeOtaCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOtaCatalogSnapshot(): OtaCatalogSnapshot {
  return currentSnapshot;
}

export function getBundledCatalogSnapshot(): OtaCatalogSnapshot {
  return BUNDLED_SNAPSHOT;
}

export function getLiveCatalogItems(
  snapshot: OtaCatalogSnapshot,
  platform: PlatformCatalogId,
): readonly CatalogItem[] {
  return snapshot.catalogs[platform] ?? BUNDLED_CATALOGS[platform];
}

export function getLiveCatalogItem(
  snapshot: OtaCatalogSnapshot,
  platform: PlatformCatalogId,
  slug: string,
): CatalogItem | undefined {
  return getLiveCatalogItems(snapshot, platform).find((item) => item.slug === slug);
}

export function findLiveCatalogItemBySlug(
  snapshot: OtaCatalogSnapshot,
  slug: string,
): CatalogItem | undefined {
  for (const platform of PLATFORM_CATALOG_IDS) {
    const match = getLiveCatalogItem(snapshot, platform, slug);
    if (match) return match;
  }
  return undefined;
}

export function queryLiveCatalog(
  snapshot: OtaCatalogSnapshot,
  query: CatalogQuery,
): CatalogPage {
  return queryCatalogItems(getLiveCatalogItems(snapshot, query.platform), query);
}

export function getLiveCatalogFacets(
  snapshot: OtaCatalogSnapshot,
  platform: PlatformCatalogId,
): CatalogFacets {
  return buildCatalogFacets(platform, getLiveCatalogItems(snapshot, platform));
}

export function getCatalogStats(snapshot: OtaCatalogSnapshot): {
  totalGames: number;
  totalSources: number;
  perPlatform: Record<PlatformCatalogId, { games: number; sources: number; isOta: boolean }>;
} {
  const otaSet = new Set(snapshot.otaPlatforms);
  const perPlatform = {} as Record<PlatformCatalogId, { games: number; sources: number; isOta: boolean }>;
  let totalGames = 0;
  let totalSources = 0;

  for (const platform of PLATFORM_CATALOG_IDS) {
    const items = getLiveCatalogItems(snapshot, platform);
    const sources = items.reduce((count, item) => count + item.sources.length, 0);
    totalGames += items.length;
    totalSources += sources;
    perPlatform[platform] = {
      games: items.length,
      sources,
      isOta: otaSet.has(platform),
    };
  }

  return { totalGames, totalSources, perPlatform };
}

function readBrowserCachedPlatform(platform: PlatformCatalogId): CatalogItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${BROWSER_OTA_CACHE_PREFIX}${platform}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parseAndNormalizeCatalog(platform, parsed);
  } catch {
    return null;
  }
}

function writeBrowserCachedPlatform(platform: PlatformCatalogId, rawPayload: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${BROWSER_OTA_CACHE_PREFIX}${platform}`, JSON.stringify(rawPayload));
  } catch {
    // Ignore storage quota or privacy-mode failures; keep live in-memory catalog intact.
  }
}

function clearBrowserCachedPlatforms(): void {
  if (typeof window === "undefined") return;
  try {
    for (const platform of PLATFORM_CATALOG_IDS) {
      window.localStorage.removeItem(`${BROWSER_OTA_CACHE_PREFIX}${platform}`);
    }
  } catch {
    // Ignore storage errors.
  }
}

function firstSyncError(result: NativeCatalogSyncResult): string | null {
  if (result.error) return result.error;
  if (!result.platforms) return null;
  for (const platform of PLATFORM_CATALOG_IDS) {
    const entry = result.platforms[platform];
    if (entry?.error) {
      return `${platform}: ${entry.error}`;
    }
  }
  return null;
}

export async function syncCatalogNow(options?: {
  baseUrl?: string;
  platforms?: PlatformCatalogId[];
  silent?: boolean;
}): Promise<OtaSyncOutcome> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = runSyncCatalogNow(options).finally(() => {
    activeSyncPromise = null;
  });
  return activeSyncPromise;
}

async function runSyncCatalogNow(options?: {
  baseUrl?: string;
  platforms?: PlatformCatalogId[];
  silent?: boolean;
}): Promise<OtaSyncOutcome> {
  const config = readOtaCatalogConfig();
  const requestedBaseUrl = normalizeOtaBaseUrl(
    options?.baseUrl ?? config.baseUrl ?? DEFAULT_OTA_CATALOG_BASE_URL,
  );
  const targetPlatforms =
    options?.platforms && options.platforms.length > 0
      ? [...options.platforms]
      : [...PLATFORM_CATALOG_IDS];

  if (!isValidOtaBaseUrl(requestedBaseUrl)) {
    const errMsg = "Invalid remote catalog URL.";
    const outcome: OtaSyncOutcome = {
      ok: false,
      mode: currentSnapshot.otaPlatforms.length > 0 ? "ota" : "bundled",
      updatedPlatforms: [],
      skippedPlatforms: [],
      failedPlatforms: targetPlatforms,
      syncedAt: currentSnapshot.lastSyncedAt,
      error: errMsg,
    };
    updateSnapshot({
      syncing: false,
      lastError: errMsg,
      lastSyncSummary: outcome,
    });
    return outcome;
  }

  updateSnapshot({
    syncing: true,
    lastError: options?.silent ? currentSnapshot.lastError : null,
  });

  const health = await nativeBridge.getHealth(true);
  const daemonConnected = Boolean(health);

  if (daemonConnected) {
    const syncResult = await nativeBridge.syncNativeCatalog(requestedBaseUrl, targetPlatforms);
    if (syncResult) {
      const nextCatalogs = { ...currentSnapshot.catalogs };
      const otaSet = new Set(currentSnapshot.otaPlatforms);
      const updatedPlatforms: PlatformCatalogId[] = [];
      const skippedPlatforms: PlatformCatalogId[] = [];
      const failedPlatforms: PlatformCatalogId[] = [];

      const status = await nativeBridge.getNativeCatalogStatus();

      await Promise.all(
        PLATFORM_CATALOG_IDS.map(async (platform) => {
          const entry = syncResult.platforms?.[platform];
          const isCached = Boolean(status?.platforms?.[platform]?.cached);

          if (entry?.error) {
            failedPlatforms.push(platform);
          } else if (entry?.updated) {
            updatedPlatforms.push(platform);
          } else if (entry?.skipped) {
            skippedPlatforms.push(platform);
          }

          if (entry?.updated || (isCached && !otaSet.has(platform))) {
            const raw = await nativeBridge.fetchNativeCachedCatalog(platform);
            if (raw) {
              try {
                nextCatalogs[platform] = parseAndNormalizeCatalog(platform, raw);
                otaSet.add(platform);
              } catch {
                // Keep previous in-memory catalog when schema validation rejects a remote file.
              }
            }
          } else if (isCached) {
            otaSet.add(platform);
          }
        }),
      );

      const errorText = firstSyncError(syncResult);
      const allRequestedFailed = failedPlatforms.length === targetPlatforms.length;
      const nextOtaPlatforms = PLATFORM_CATALOG_IDS.filter((platform) => otaSet.has(platform));
      const nextSyncedAt =
        !allRequestedFailed && syncResult.syncedAt
          ? syncResult.syncedAt
          : status?.lastSyncedAt ?? currentSnapshot.lastSyncedAt;

      if (!allRequestedFailed && nextSyncedAt) {
        writeOtaCatalogConfig({ lastSyncedAt: nextSyncedAt });
      }

      const nextMode: OtaCatalogMode =
        nextOtaPlatforms.length > 0
          ? "ota"
          : allRequestedFailed
            ? "offline"
            : "bundled";

      const outcome: OtaSyncOutcome = {
        ok: failedPlatforms.length === 0 && !syncResult.error,
        mode: nextMode,
        updatedPlatforms,
        skippedPlatforms,
        failedPlatforms,
        syncedAt: nextSyncedAt ?? null,
        error: errorText,
      };

      updateSnapshot(
        {
          catalogs: nextCatalogs,
          otaPlatforms: nextOtaPlatforms,
          mode: nextMode,
          syncing: false,
          daemonConnected: true,
          lastSyncedAt: nextSyncedAt ?? null,
          lastError: errorText,
          lastSyncSummary: outcome,
        },
        updatedPlatforms.length > 0 || nextOtaPlatforms.length !== currentSnapshot.otaPlatforms.length,
      );

      return outcome;
    }
  }

  // Fallback for standalone browser / preview mode when daemon is offline
  const nextCatalogs = { ...currentSnapshot.catalogs };
  const otaSet = new Set(currentSnapshot.otaPlatforms);
  const updatedPlatforms: PlatformCatalogId[] = [];
  const failedPlatforms: PlatformCatalogId[] = [];
  let firstError: string | null = null;

  await Promise.all(
    targetPlatforms.map(async (platform) => {
      try {
        const response = await fetch(`${requestedBaseUrl}/${platform}.json`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
        if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
          throw new Error("Server returned HTML instead of catalog JSON.");
        }
        const raw: unknown = await response.json();
        const normalized = parseAndNormalizeCatalog(platform, raw);
        nextCatalogs[platform] = normalized;
        otaSet.add(platform);
        writeBrowserCachedPlatform(platform, raw);
        updatedPlatforms.push(platform);
      } catch (error) {
        failedPlatforms.push(platform);
        if (!firstError) {
          firstError = error instanceof Error ? `${platform}: ${error.message}` : `${platform}: Sync failed`;
        }
      }
    }),
  );

  const allFailed = failedPlatforms.length === targetPlatforms.length;
  const nextOtaPlatforms = PLATFORM_CATALOG_IDS.filter((platform) => otaSet.has(platform));
  const nextSyncedAt = !allFailed ? new Date().toISOString() : currentSnapshot.lastSyncedAt;

  if (!allFailed && nextSyncedAt) {
    writeOtaCatalogConfig({ lastSyncedAt: nextSyncedAt });
  }

  const nextMode: OtaCatalogMode =
    nextOtaPlatforms.length > 0
      ? "ota"
      : allFailed
        ? "offline"
        : "bundled";

  const outcome: OtaSyncOutcome = {
    ok: failedPlatforms.length === 0,
    mode: nextMode,
    updatedPlatforms,
    skippedPlatforms: [],
    failedPlatforms,
    syncedAt: nextSyncedAt ?? null,
    error: firstError,
  };

  updateSnapshot(
    {
      catalogs: nextCatalogs,
      otaPlatforms: nextOtaPlatforms,
      mode: nextMode,
      syncing: false,
      daemonConnected: false,
      lastSyncedAt: nextSyncedAt ?? null,
      lastError: firstError,
      lastSyncSummary: outcome,
    },
    updatedPlatforms.length > 0,
  );

  return outcome;
}

export async function resetToBundledCatalog(): Promise<void> {
  const health = await nativeBridge.getHealth();
  if (health) {
    await nativeBridge.clearNativeCatalogCache();
  }
  clearBrowserCachedPlatforms();
  writeOtaCatalogConfig({ lastSyncedAt: null });

  updateSnapshot(
    {
      catalogs: buildBundledCatalogMap(),
      otaPlatforms: [],
      mode: "bundled",
      syncing: false,
      daemonConnected: Boolean(health),
      lastSyncedAt: null,
      lastError: null,
      lastSyncSummary: null,
    },
    true,
  );
}

export function hydrateOtaCatalogOnStartup(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (startupPromise) {
    return startupPromise;
  }

  startupPromise = (async () => {
    const config = readOtaCatalogConfig();
    const health = await nativeBridge.getHealth();
    const daemonConnected = Boolean(health);

    if (daemonConnected) {
      const status = await nativeBridge.getNativeCatalogStatus();
      const nextCatalogs = { ...currentSnapshot.catalogs };
      const hydratedPlatforms: PlatformCatalogId[] = [];

      await Promise.all(
        PLATFORM_CATALOG_IDS.map(async (platform) => {
          if (!status?.platforms?.[platform]?.cached) return;
          const raw = await nativeBridge.fetchNativeCachedCatalog(platform);
          if (!raw) return;
          try {
            nextCatalogs[platform] = parseAndNormalizeCatalog(platform, raw);
            hydratedPlatforms.push(platform);
          } catch {
            // Fall back to bundled data when cached JSON is invalid.
          }
        }),
      );

      const orderedHydrated = PLATFORM_CATALOG_IDS.filter((p) => hydratedPlatforms.includes(p));
      const syncedAt = status?.lastSyncedAt ?? config.lastSyncedAt;

      updateSnapshot(
        {
          catalogs: nextCatalogs,
          otaPlatforms: orderedHydrated,
          mode: orderedHydrated.length > 0 ? "ota" : "bundled",
          daemonConnected: true,
          lastSyncedAt: syncedAt,
        },
        orderedHydrated.length > 0,
      );

      if (config.enabled) {
        void syncCatalogNow({ baseUrl: config.baseUrl, silent: true });
      }
      return;
    }

    // Daemon offline: hydrate browser localStorage fallback cache if present.
    const nextCatalogs = { ...currentSnapshot.catalogs };
    const browserCachedPlatforms: PlatformCatalogId[] = [];
    for (const platform of PLATFORM_CATALOG_IDS) {
      const cached = readBrowserCachedPlatform(platform);
      if (cached) {
        nextCatalogs[platform] = cached;
        browserCachedPlatforms.push(platform);
      }
    }

    updateSnapshot(
      {
        catalogs: nextCatalogs,
        otaPlatforms: browserCachedPlatforms,
        mode: browserCachedPlatforms.length > 0 ? "ota" : "bundled",
        daemonConnected: false,
        lastSyncedAt: config.lastSyncedAt,
      },
      browserCachedPlatforms.length > 0,
    );

    if (config.enabled) {
      void syncCatalogNow({ baseUrl: config.baseUrl, silent: true });
    }
  })();

  return startupPromise;
}
