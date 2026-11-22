import type { DownloadItemStatus } from "@/lib/catalog/collections";
import type { PlatformCatalogId } from "@/lib/catalog/platforms";

export const DEFAULT_NATIVE_BRIDGE_URL = "http://127.0.0.1:9021";

const HEALTH_CACHE_TTL_MS = 15_000;
const HEALTH_TIMEOUT_MS = 1200;
const REQUEST_TIMEOUT_MS = 10_000;

export type NativeHealth = {
  ok: boolean;
  service: string;
  version: string;
  platform: string;
  port: number;
  rootDir: string;
};

export type NativeFsEntry = {
  name: string;
  path: string;
  isDir: boolean;
  sizeBytes?: number;
};

export type NativeDirectoryListing = {
  path: string;
  parentPath: string | null;
  freeBytes: number;
  totalBytes: number;
  entries: NativeFsEntry[];
};

export type NativeDownloadRecord = {
  id: string;
  catalogId: PlatformCatalogId | string;
  slug: string;
  title: string;
  url: string;
  format: string;
  targetDir: string;
  archivePath?: string;
  installedPath?: string;
  status: DownloadItemStatus;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
  speedBps: number;
  error?: string;
};

export type StartDownloadPayload = {
  catalogId: PlatformCatalogId;
  slug: string;
  title: string;
  url: string;
  format: string;
  targetDir: string;
  sizeBytes?: number;
  sha256?: string;
};

export type InstallArchiveOptions = {
  deleteArchive?: boolean;
  flattenSingleRoot?: boolean;
  targetDir?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function getConfiguredNativeOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_NATIVE_BRIDGE_URL?.trim();
  return normalizeOrigin(configured && configured !== "" ? configured : DEFAULT_NATIVE_BRIDGE_URL);
}

function parseHealth(payload: unknown): NativeHealth | null {
  if (!isRecord(payload) || payload.ok !== true) return null;
  return {
    ok: true,
    service: typeof payload.service === "string" ? payload.service : "emustore-daemon",
    version: typeof payload.version === "string" ? payload.version : "0.1.0",
    platform: typeof payload.platform === "string" ? payload.platform : "unknown",
    port: typeof payload.port === "number" ? payload.port : 9021,
    rootDir: typeof payload.rootDir === "string" ? payload.rootDir : "",
  };
}

export class NativeBridgeClient {
  private cachedBaseUrl: string | null = null;
  private cachedHealth: NativeHealth | null = null;
  private cachedAt = 0;

  private async probeHealthAt(origin: string): Promise<NativeHealth | null> {
    if (typeof window === "undefined") return null;

    try {
      const response = await fetch(`${origin}/api/native/health`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      return parseHealth(payload);
    } catch {
      return null;
    }
  }

  private async resolveBaseUrl(forceRefresh = false): Promise<string | null> {
    if (typeof window === "undefined") return null;

    if (!forceRefresh && Date.now() - this.cachedAt < HEALTH_CACHE_TTL_MS) {
      return this.cachedBaseUrl;
    }

    const candidates = [""];
    const configured = getConfiguredNativeOrigin();
    if (configured && configured !== normalizeOrigin(window.location.origin)) {
      candidates.push(configured);
    }

    for (const candidate of candidates) {
      const health = await this.probeHealthAt(candidate);
      if (health) {
        this.cachedBaseUrl = candidate;
        this.cachedHealth = health;
        this.cachedAt = Date.now();
        return candidate;
      }
    }

    this.cachedBaseUrl = null;
    this.cachedHealth = null;
    this.cachedAt = Date.now();
    return null;
  }

  private clearCache(): void {
    this.cachedAt = 0;
  }

  private async requestJson<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T | null> {
    const baseUrl = await this.resolveBaseUrl();
    if (baseUrl === null) return null;

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
        signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      this.clearCache();
      return null;
    }
  }

  async getHealth(forceRefresh = false): Promise<NativeHealth | null> {
    const baseUrl = await this.resolveBaseUrl(forceRefresh);
    if (baseUrl === null) return null;
    return this.cachedHealth;
  }

  async listDirectory(dirPath = ""): Promise<NativeDirectoryListing | null> {
    const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
    const payload = await this.requestJson<unknown>(`/api/fs/list${query}`);
    if (!isRecord(payload)) return null;

    const entries = Array.isArray(payload.entries)
      ? payload.entries
          .filter(isRecord)
          .map((entry) => ({
            name: typeof entry.name === "string" ? entry.name : "",
            path: typeof entry.path === "string" ? entry.path : "",
            isDir: Boolean(entry.isDir),
            ...(typeof entry.sizeBytes === "number" ? { sizeBytes: entry.sizeBytes } : {}),
          }))
          .filter((entry) => entry.name !== "" && entry.path !== "")
      : [];

    return {
      path: typeof payload.path === "string" ? payload.path : dirPath,
      parentPath: typeof payload.parentPath === "string" && payload.parentPath !== "" ? payload.parentPath : null,
      freeBytes: typeof payload.freeBytes === "number" ? payload.freeBytes : 0,
      totalBytes: typeof payload.totalBytes === "number" ? payload.totalBytes : 0,
      entries,
    };
  }

  async listDownloads(): Promise<NativeDownloadRecord[] | null> {
    const payload = await this.requestJson<unknown>("/api/downloads");
    if (Array.isArray(payload)) {
      return payload as NativeDownloadRecord[];
    }
    if (isRecord(payload) && Array.isArray(payload.items)) {
      return payload.items as NativeDownloadRecord[];
    }
    return null;
  }

  async startDownload(payload: StartDownloadPayload): Promise<NativeDownloadRecord | null> {
    const response = await this.requestJson<unknown>("/api/downloads", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (isRecord(response) && isRecord(response.item)) {
      return response.item as unknown as NativeDownloadRecord;
    }
    return isRecord(response) && typeof response.id === "string"
      ? (response as unknown as NativeDownloadRecord)
      : null;
  }

  async pauseDownload(id: string): Promise<NativeDownloadRecord | null> {
    const response = await this.requestJson<unknown>(
      `/api/downloads/${encodeURIComponent(id)}/pause`,
      { method: "POST" },
    );
    if (isRecord(response) && isRecord(response.item)) {
      return response.item as unknown as NativeDownloadRecord;
    }
    return isRecord(response) && typeof response.id === "string"
      ? (response as unknown as NativeDownloadRecord)
      : null;
  }

  async resumeDownload(id: string): Promise<NativeDownloadRecord | null> {
    const response = await this.requestJson<unknown>(
      `/api/downloads/${encodeURIComponent(id)}/resume`,
      { method: "POST" },
    );
    if (isRecord(response) && isRecord(response.item)) {
      return response.item as unknown as NativeDownloadRecord;
    }
    return isRecord(response) && typeof response.id === "string"
      ? (response as unknown as NativeDownloadRecord)
      : null;
  }

  async cancelDownload(id: string): Promise<boolean> {
    const response = await this.requestJson<unknown>(
      `/api/downloads/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return response !== null;
  }

  async installArchive(
    id: string,
    options: InstallArchiveOptions = {},
  ): Promise<NativeDownloadRecord | null> {
    const response = await this.requestJson<unknown>(
      `/api/downloads/${encodeURIComponent(id)}/install`,
      {
        method: "POST",
        body: JSON.stringify({
          deleteArchive: options.deleteArchive ?? true,
          flattenSingleRoot: options.flattenSingleRoot ?? true,
          ...(options.targetDir ? { targetDir: options.targetDir } : {}),
        }),
      },
    );
    if (isRecord(response) && isRecord(response.item)) {
      return response.item as unknown as NativeDownloadRecord;
    }
    return isRecord(response) && typeof response.id === "string"
      ? (response as unknown as NativeDownloadRecord)
      : null;
  }
}

export function createNativeBridge(): NativeBridgeClient {
  return new NativeBridgeClient();
}

export const nativeBridge = createNativeBridge();
