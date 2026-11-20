import {
  PLATFORM_CATALOGS,
  PLATFORM_CATALOG_IDS,
  type PlatformCatalogId,
} from "@/lib/catalog/platforms";

export const TARGET_PATH_STORAGE_KEY = "emustore.target-path-preferences.v1";
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

export function isValidSuggestedPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_SUGGESTED_PATH_LENGTH &&
    !trimmed.includes("\0")
  );
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
      next[platform] = candidate.trim();
    }
  }

  return next;
}
