import { isPlatformCatalogId, type PlatformCatalogId } from "@/lib/catalog/platforms";
import { DOWNLOAD_DELIVERY_MODES, type DownloadDeliveryMode } from "@/lib/catalog/types";

export type CatalogReference = {
  catalogId: PlatformCatalogId;
  slug: string;
};

export type QueueEntry = CatalogReference & {
  sourceId?: string;
  provider?: string;
  deliveryMode?: DownloadDeliveryMode;
  requiresVerification?: boolean;
  format?: string;
  sizeBytes?: number;
  sha256?: string;
  targetPath?: string;
  resolvedUrl?: string;
  queuedAt?: string;
};

export const FAVORITES_STORAGE_KEY = "emustore.favorites.v1";
export const DOWNLOAD_QUEUE_STORAGE_KEY = "emustore.download-queue.v1";

export function isCatalogReference(value: unknown): value is CatalogReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isPlatformCatalogId(candidate.catalogId) &&
    typeof candidate.slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.slug)
  );
}

export function parseCatalogReferences(value: string | null): CatalogReference[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, CatalogReference>();
    for (const entry of parsed) {
      if (!isCatalogReference(entry)) continue;
      unique.set(`${entry.catalogId}:${entry.slug}`, entry);
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export function isQueueEntry(value: unknown): value is QueueEntry {
  if (!isCatalogReference(value)) return false;
  const candidate = value as Record<string, unknown>;

  return (
    (candidate.sourceId === undefined || (typeof candidate.sourceId === "string" && candidate.sourceId.length <= 120)) &&
    (candidate.provider === undefined || (typeof candidate.provider === "string" && candidate.provider.length <= 80)) &&
    (candidate.deliveryMode === undefined || (typeof candidate.deliveryMode === "string" && DOWNLOAD_DELIVERY_MODES.some((mode) => mode === candidate.deliveryMode))) &&
    (candidate.requiresVerification === undefined || typeof candidate.requiresVerification === "boolean") &&
    (candidate.format === undefined || (typeof candidate.format === "string" && /^\.[a-z0-9]{1,12}$/i.test(candidate.format))) &&
    (candidate.sizeBytes === undefined || (typeof candidate.sizeBytes === "number" && Number.isSafeInteger(candidate.sizeBytes) && candidate.sizeBytes >= 0)) &&
    (candidate.sha256 === undefined || (typeof candidate.sha256 === "string" && /^[a-f0-9]{64}$/i.test(candidate.sha256))) &&
    (candidate.targetPath === undefined || (typeof candidate.targetPath === "string" && candidate.targetPath.length <= 256)) &&
    (candidate.resolvedUrl === undefined || isHttpUrl(candidate.resolvedUrl)) &&
    (candidate.queuedAt === undefined || (typeof candidate.queuedAt === "string" && !Number.isNaN(Date.parse(candidate.queuedAt))))
  );
}

export function parseCatalogQueueEntries(value: string | null): QueueEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, QueueEntry>();
    for (const entry of parsed) {
      if (!isQueueEntry(entry)) continue;
      unique.set(`${entry.catalogId}:${entry.slug}`, entry);
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export function hasCatalogReference(
  references: readonly CatalogReference[],
  reference: CatalogReference,
): boolean {
  return references.some(
    (entry) => entry.catalogId === reference.catalogId && entry.slug === reference.slug,
  );
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}
