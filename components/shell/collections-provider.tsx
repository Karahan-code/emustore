"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DOWNLOAD_QUEUE_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  hasCatalogReference,
  parseCatalogReferences,
  type CatalogReference,
} from "@/lib/catalog/collections";

type CollectionsContextValue = {
  ready: boolean;
  favorites: CatalogReference[];
  queue: CatalogReference[];
  isFavorite: (reference: CatalogReference) => boolean;
  isQueued: (reference: CatalogReference) => boolean;
  toggleFavorite: (reference: CatalogReference) => void;
  toggleQueue: (reference: CatalogReference) => void;
  removeFavorite: (reference: CatalogReference) => void;
  removeQueue: (reference: CatalogReference) => void;
};

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

function toggleReference(
  references: CatalogReference[],
  reference: CatalogReference,
): CatalogReference[] {
  return hasCatalogReference(references, reference)
    ? references.filter((entry) => !(entry.catalogId === reference.catalogId && entry.slug === reference.slug))
    : [...references, reference];
}

export function CollectionsProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<CatalogReference[]>([]);
  const [queue, setQueue] = useState<CatalogReference[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setFavorites(parseCatalogReferences(window.localStorage.getItem(FAVORITES_STORAGE_KEY)));
      setQueue(parseCatalogReferences(window.localStorage.getItem(DOWNLOAD_QUEUE_STORAGE_KEY)));
    } catch {
      setFavorites([]);
      setQueue([]);
    } finally {
      setReady(true);
    }
  }, []);

  const toggleFavorite = useCallback((reference: CatalogReference) => {
    setFavorites((current) => {
      const next = toggleReference(current, reference);
      try { window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next)); } catch { /* keep this browser session usable */ }
      return next;
    });
  }, []);

  const toggleQueue = useCallback((reference: CatalogReference) => {
    setQueue((current) => {
      const next = toggleReference(current, reference);
      try { window.localStorage.setItem(DOWNLOAD_QUEUE_STORAGE_KEY, JSON.stringify(next)); } catch { /* keep this browser session usable */ }
      return next;
    });
  }, []);

  const removeFavorite = useCallback((reference: CatalogReference) => {
    setFavorites((current) => {
      const next = current.filter((entry) => !(entry.catalogId === reference.catalogId && entry.slug === reference.slug));
      try { window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next)); } catch { /* keep this browser session usable */ }
      return next;
    });
  }, []);

  const removeQueue = useCallback((reference: CatalogReference) => {
    setQueue((current) => {
      const next = current.filter((entry) => !(entry.catalogId === reference.catalogId && entry.slug === reference.slug));
      try { window.localStorage.setItem(DOWNLOAD_QUEUE_STORAGE_KEY, JSON.stringify(next)); } catch { /* keep this browser session usable */ }
      return next;
    });
  }, []);

  const value = useMemo<CollectionsContextValue>(() => ({
    ready,
    favorites,
    queue,
    isFavorite: (reference) => hasCatalogReference(favorites, reference),
    isQueued: (reference) => hasCatalogReference(queue, reference),
    toggleFavorite,
    toggleQueue,
    removeFavorite,
    removeQueue,
  }), [favorites, queue, ready, removeFavorite, removeQueue, toggleFavorite, toggleQueue]);

  return <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>;
}

export function useCollections(): CollectionsContextValue {
  const context = useContext(CollectionsContext);
  if (!context) throw new Error("useCollections must be used inside CollectionsProvider.");
  return context;
}
