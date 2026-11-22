export const DEFAULT_OTA_CATALOG_BASE_URL =
  "https://raw.githubusercontent.com/Karahan-code/emustore/master/data/catalog";

export const OTA_CONFIG_STORAGE_KEY = "emustore:ota-catalog-config";
export const OTA_CONFIG_UPDATED_EVENT = "emustore:ota-config-updated";

export type OtaCatalogConfig = {
  enabled: boolean;
  baseUrl: string;
  lastSyncedAt: string | null;
};

export const DEFAULT_OTA_CATALOG_CONFIG: OtaCatalogConfig = {
  enabled: true,
  baseUrl: DEFAULT_OTA_CATALOG_BASE_URL,
  lastSyncedAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeOtaBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function isValidOtaBaseUrl(value: string): boolean {
  const normalized = normalizeOtaBaseUrl(value);
  if (!normalized || /\s/.test(normalized) || normalized.length > 512) return false;

  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return false;
    }
    if (parsed.protocol === "https:") return true;
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export function readOtaCatalogConfig(): OtaCatalogConfig {
  if (typeof window === "undefined") {
    return { ...DEFAULT_OTA_CATALOG_CONFIG };
  }

  try {
    const raw = window.localStorage.getItem(OTA_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OTA_CATALOG_CONFIG };

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_OTA_CATALOG_CONFIG };

    const enabled =
      typeof parsed.enabled === "boolean"
        ? parsed.enabled
        : DEFAULT_OTA_CATALOG_CONFIG.enabled;
    const rawBaseUrl =
      typeof parsed.baseUrl === "string"
        ? normalizeOtaBaseUrl(parsed.baseUrl)
        : DEFAULT_OTA_CATALOG_BASE_URL;
    const baseUrl = isValidOtaBaseUrl(rawBaseUrl)
      ? rawBaseUrl
      : DEFAULT_OTA_CATALOG_BASE_URL;
    const lastSyncedAt =
      typeof parsed.lastSyncedAt === "string" && !Number.isNaN(Date.parse(parsed.lastSyncedAt))
        ? parsed.lastSyncedAt
        : null;

    return { enabled, baseUrl, lastSyncedAt };
  } catch {
    return { ...DEFAULT_OTA_CATALOG_CONFIG };
  }
}

export function writeOtaCatalogConfig(
  patch: Partial<OtaCatalogConfig>,
): OtaCatalogConfig {
  const current = readOtaCatalogConfig();
  const nextBaseUrl =
    patch.baseUrl !== undefined ? normalizeOtaBaseUrl(patch.baseUrl) : current.baseUrl;
  const next: OtaCatalogConfig = {
    enabled: patch.enabled ?? current.enabled,
    baseUrl: isValidOtaBaseUrl(nextBaseUrl) ? nextBaseUrl : current.baseUrl,
    lastSyncedAt:
      patch.lastSyncedAt === undefined ? current.lastSyncedAt : patch.lastSyncedAt,
  };

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(OTA_CONFIG_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(OTA_CONFIG_UPDATED_EVENT));
    } catch {
      // Ignore storage quota or privacy-mode errors.
    }
  }

  return next;
}
