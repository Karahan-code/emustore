import {
  PLATFORM_CATALOGS,
  PLATFORM_CATALOG_IDS,
  type PlatformCatalogId,
} from "@/lib/catalog/platforms";

export const TARGET_PATH_STORAGE_KEY = "emustore.target-path-preferences.v1";
export const TARGET_PATHS_UPDATED_EVENT = "emustore:target-paths-updated";
export const MAX_SUGGESTED_PATH_LENGTH = 256;

export type TargetPathPreferences = Record<PlatformCatalogId, string>;

export const DEFAULT_SUGGESTED_PATHS: Readonly<TargetPathPreferences> = {
  ps1: "USB:/EmuStore/PS1",
  ps2: "USB:/EmuStore/PS2",
  ps3: "USB:/EmuStore/PS3",
  switch: "SD:/EmuStore/Switch",
  wii: "USB:/EmuStore/Wii",
  wiiu: "USB:/EmuStore/WiiU",
};

export function isVirtualPlaceholderPath(value: string): boolean {
  return /^(?:USB|SD):[\\/]/i.test(value.trim());
}

export function normalizeSuggestedPath(value: string): string {
  let normalized = value.trim();
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith("\"") && normalized.endsWith("\"")) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  // Keep drive/virtual roots intact (e.g. C:\, C:/, /, USB:/, SD:/) while stripping redundant trailing slashes.
  if (/^[A-Za-z]:[\\/]$/.test(normalized) || /^(?:USB|SD):[\\/]$/i.test(normalized) || normalized === "/") {
    return normalized;
  }

  return normalized.replace(/[\\/]+$/, "");
}

export function isValidSuggestedPath(value: string): boolean {
  const normalized = normalizeSuggestedPath(value);
  if (
    normalized.length === 0 ||
    normalized.length > MAX_SUGGESTED_PATH_LENGTH ||
    /[\x00-\x1f]/.test(normalized)
  ) {
    return false;
  }

  // Explicitly accept Windows drive paths (C:\..., D:/...), Windows UNC paths (\\server\share),
  // POSIX/PS5 absolute paths (/data/..., /mnt/...), and virtual paths (USB:/..., SD:/...).
  if (/^[A-Za-z]:[\\/]/.test(normalized) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(normalized)) {
    return true;
  }
  if (normalized.startsWith("/") || /^(?:USB|SD):[\\/]/i.test(normalized)) {
    return true;
  }

  return true;
}

export function listExtensionsForPlatform(platform: PlatformCatalogId): string[] {
  return [
    ...new Set(
      PLATFORM_CATALOGS[platform].formats.flatMap((format) => [...format.extensions]),
    ),
  ];
}

export function listPlatformsForExtension(extension: string): PlatformCatalogId[] {
  const normalizedExtension = extension.toLowerCase();
  return PLATFORM_CATALOG_IDS.filter((platform) =>
    PLATFORM_CATALOGS[platform].formats.some((format) =>
      format.extensions.some((supported) => supported === normalizedExtension),
    ),
  );
}

export function mergeTargetPathPreferences(value: unknown): TargetPathPreferences {
  const next: TargetPathPreferences = { ...DEFAULT_SUGGESTED_PATHS };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return next;

  const saved = value as Record<string, unknown>;
  for (const platform of PLATFORM_CATALOG_IDS) {
    const candidate = saved[platform];
    if (typeof candidate === "string" && isValidSuggestedPath(candidate)) {
      next[platform] = normalizeSuggestedPath(candidate);
    }
  }

  return next;
}

export function readTargetPathPreferences(): TargetPathPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SUGGESTED_PATHS };
  }

  try {
    const stored = window.localStorage.getItem(TARGET_PATH_STORAGE_KEY);
    return stored
      ? mergeTargetPathPreferences(JSON.parse(stored) as unknown)
      : { ...DEFAULT_SUGGESTED_PATHS };
  } catch {
    return { ...DEFAULT_SUGGESTED_PATHS };
  }
}

export function writeTargetPathPreferences(paths: TargetPathPreferences): boolean {
  if (typeof window === "undefined") return false;

  const normalized = Object.fromEntries(
    PLATFORM_CATALOG_IDS.map((platform) => [platform, normalizeSuggestedPath(paths[platform])]),
  ) as TargetPathPreferences;

  try {
    window.localStorage.setItem(TARGET_PATH_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(TARGET_PATHS_UPDATED_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function resetTargetPathPreferences(): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.removeItem(TARGET_PATH_STORAGE_KEY);
    window.dispatchEvent(new Event(TARGET_PATHS_UPDATED_EVENT));
    return true;
  } catch {
    return false;
  }
}
