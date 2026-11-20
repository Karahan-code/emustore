import { isPlatformCatalogId, type PlatformCatalogId } from "@/lib/catalog/platforms";

export type CatalogReference = {
  catalogId: PlatformCatalogId;
  slug: string;
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

export function hasCatalogReference(
  references: readonly CatalogReference[],
  reference: CatalogReference,
): boolean {
  return references.some(
    (entry) => entry.catalogId === reference.catalogId && entry.slug === reference.slug,
  );
}
