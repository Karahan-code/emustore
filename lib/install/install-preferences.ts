export const INSTALL_PREFS_STORAGE_KEY = "emustore.install-preferences.v1";

export type InstallPreferences = {
  deleteArchiveAfterInstall: boolean;
};

export const DEFAULT_INSTALL_PREFERENCES: Readonly<InstallPreferences> = {
  deleteArchiveAfterInstall: true,
};

export function isArchiveFormat(format?: string | null): boolean {
  if (!format) return false;
  const normalized = format.trim().toLowerCase();
  return normalized === ".zip" || normalized === ".7z";
}

export function mergeInstallPreferences(value: unknown): InstallPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...DEFAULT_INSTALL_PREFERENCES };
  }

  const candidate = value as Record<string, unknown>;
  return {
    deleteArchiveAfterInstall:
      typeof candidate.deleteArchiveAfterInstall === "boolean"
        ? candidate.deleteArchiveAfterInstall
        : DEFAULT_INSTALL_PREFERENCES.deleteArchiveAfterInstall,
  };
}

export function readInstallPreferences(): InstallPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_INSTALL_PREFERENCES };
  }

  try {
    const raw = window.localStorage.getItem(INSTALL_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INSTALL_PREFERENCES };
    return mergeInstallPreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_INSTALL_PREFERENCES };
  }
}

export function writeInstallPreferences(prefs: InstallPreferences): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(INSTALL_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
