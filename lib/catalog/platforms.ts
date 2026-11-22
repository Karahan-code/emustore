export const PLATFORM_CATALOG_IDS = [
  "ps1",
  "ps2",
  "ps3",
  "switch",
  "wii",
  "wiiu",
] as const;

export type PlatformCatalogId = (typeof PLATFORM_CATALOG_IDS)[number];

export type PlatformFileFormat = {
  readonly label: string;
  readonly extensions: readonly string[];
};

export type PlatformCatalogDefinition = {
  readonly id: PlatformCatalogId;
  readonly label: string;
  readonly shortLabel: string;
  readonly formats: readonly PlatformFileFormat[];
};

export const PLATFORM_CATALOGS = {
  ps1: {
    id: "ps1",
    label: "PlayStation 1 (PS1)",
    shortLabel: "PS1",
    formats: [
      { label: "CHD disc image", extensions: [".chd"] },
      { label: "Cue/BIN disc image", extensions: [".cue", ".bin"] },
      { label: "PBP package", extensions: [".pbp"] },
      { label: "CCD/IMG disc image", extensions: [".ccd", ".img", ".sub"] },
      { label: "ISO disc image", extensions: [".iso"] },
      { label: "ZIP archive", extensions: [".zip"] },
      { label: "7-Zip archive", extensions: [".7z"] },
    ],
  },
  ps2: {
    id: "ps2",
    label: "PlayStation 2 (PS2)",
    shortLabel: "PS2",
    formats: [
      { label: "ISO disc image", extensions: [".iso"] },
      { label: "CHD disc image", extensions: [".chd"] },
      { label: "CSO compressed image", extensions: [".cso"] },
      { label: "ZSO compressed image", extensions: [".zso"] },
      { label: "ELF executable", extensions: [".elf"] },
      { label: "ZIP archive", extensions: [".zip"] },
      { label: "7-Zip archive", extensions: [".7z"] },
    ],
  },
  ps3: {
    id: "ps3",
    label: "PlayStation 3 (PS3)",
    shortLabel: "PS3",
    formats: [
      { label: "PKG package", extensions: [".pkg"] },
      { label: "ISO disc image", extensions: [".iso"] },
      { label: "ZIP archive", extensions: [".zip"] },
      { label: "7-Zip archive", extensions: [".7z"] },
    ],
  },
  switch: {
    id: "switch",
    label: "Nintendo Switch",
    shortLabel: "Switch",
    formats: [
      { label: "NRO homebrew executable", extensions: [".nro"] },
      { label: "NSO executable", extensions: [".nso"] },
      { label: "NSP package", extensions: [".nsp"] },
      { label: "XCI game-card image", extensions: [".xci"] },
      { label: "ZIP archive", extensions: [".zip"] },
      { label: "7-Zip archive", extensions: [".7z"] },
    ],
  },
  wii: {
    id: "wii",
    label: "Nintendo Wii",
    shortLabel: "Wii",
    formats: [
      { label: "WBFS image", extensions: [".wbfs"] },
      { label: "ISO disc image", extensions: [".iso"] },
      { label: "CISO compressed image", extensions: [".ciso"] },
      { label: "GameCube/Wii compressed image", extensions: [".gcz"] },
      { label: "DOL homebrew executable", extensions: [".dol"] },
      { label: "ZIP archive", extensions: [".zip"] },
      { label: "7-Zip archive", extensions: [".7z"] },
    ],
  },
  wiiu: {
    id: "wiiu",
    label: "Nintendo Wii U",
    shortLabel: "Wii U",
    formats: [
      { label: "WUD disc image", extensions: [".wud"] },
      { label: "WUX compressed disc image", extensions: [".wux"] },
      { label: "WUA archive", extensions: [".wua"] },
      { label: "RPX executable", extensions: [".rpx"] },
      { label: "Wii U homebrew bundle", extensions: [".wuhb"] },
      { label: "ZIP archive", extensions: [".zip"] },
      { label: "7-Zip archive", extensions: [".7z"] },
    ],
  },
} as const satisfies Record<PlatformCatalogId, PlatformCatalogDefinition>;

export function isPlatformCatalogId(value: unknown): value is PlatformCatalogId {
  return (
    typeof value === "string" &&
    PLATFORM_CATALOG_IDS.some((platformId) => platformId === value)
  );
}

export function isPlatformExtension(
  platformId: PlatformCatalogId,
  extension: string,
): boolean {
  const normalizedExtension = extension.toLowerCase();

  return PLATFORM_CATALOGS[platformId].formats.some((format) =>
    format.extensions.some((supported) => supported === normalizedExtension),
  );
}
