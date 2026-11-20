"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import { CollectionToggle } from "@/components/catalog/collection-toggle";
import { GameCard } from "@/components/catalog/game-card";
import { useCollections } from "@/components/shell/collections-provider";
import { PLATFORM_CATALOGS, PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
import type { CatalogItem, Locale } from "@/lib/catalog/types";
import { formatFileSize } from "@/lib/catalog/format";
import type { Messages } from "@/lib/i18n/dictionaries";
import { DEFAULT_SUGGESTED_PATHS, mergeTargetPathPreferences, TARGET_PATH_STORAGE_KEY, type TargetPathPreferences } from "@/lib/install/target-paths";

type SavedItemsViewProps = {
  kind: "favorites" | "queue";
  locale: Locale;
  messages: Messages;
};

type DetailResponse = { data: CatalogItem };

export function SavedItemsView({ kind, locale, messages }: SavedItemsViewProps) {
  const collections = useCollections();
  const references = kind === "favorites" ? collections.favorites : collections.queue;
  const referenceKey = references.map((reference) => `${reference.catalogId}:${reference.slug}`).join("|");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [paths, setPaths] = useState<TargetPathPreferences>({ ...DEFAULT_SUGGESTED_PATHS });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TARGET_PATH_STORAGE_KEY);
      setPaths(mergeTargetPathPreferences(stored ? JSON.parse(stored) as unknown : null));
    } catch {
      setPaths({ ...DEFAULT_SUGGESTED_PATHS });
    }
  }, []);

  useEffect(() => {
    if (!collections.ready) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);

    Promise.all(references.map(async (reference) => {
      const query = new URLSearchParams({ platform: reference.catalogId, locale });
      try {
        const response = await fetch(`/api/v1/items/${encodeURIComponent(reference.slug)}?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return undefined;
        return ((await response.json()) as DetailResponse).data;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        return undefined;
      }
    }))
      .then((results) => setItems(results.filter((item): item is CatalogItem => item !== undefined)))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [collections.ready, locale, referenceKey]);

  const title = kind === "favorites" ? messages.favorites.title : messages.downloads.title;
  const totalBytes = items.reduce((total, item) => total + item.sizeBytes, 0);

  if (kind === "favorites") {
    return (
      <main className="saved-page">
        <div className="saved-page__heading">
          <p className="eyebrow">{messages.navigation.favorites}</p>
          <h1>{title}</h1>
        </div>
        {loading ? <div className="status-panel" role="status">…</div> : null}
        {failed ? <div className="status-panel status-panel--error" role="alert">{messages.errors.catalogUnavailable}</div> : null}
        {!loading && !failed && items.length === 0 ? <div className="status-panel status-panel--empty" role="status">{messages.favorites.empty}</div> : null}
        {items.length > 0 ? (
          <div className="game-grid">
            {items.map((item) => (
              <GameCard key={`${item.catalogId}:${item.slug}`} item={item} locale={locale} messages={messages} searchQuery={`platform=${item.catalogId}`} />
            ))}
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="downloads-page">
      <div className="saved-page__heading">
        <p className="eyebrow">{messages.navigation.downloads}</p>
        <h1>{title}</h1>
        <p>{messages.downloads.queueNote}</p>
      </div>
      <div className="downloads-layout">
        <section className="downloads-queue" aria-labelledby="downloads-queue-title">
          <div className="section-heading section-heading--compact">
            <h2 id="downloads-queue-title">{messages.downloads.queue}</h2>
            <span className="result-count">{items.length}</span>
          </div>
          {loading ? <div className="status-panel" role="status">…</div> : null}
          {failed ? <div className="status-panel status-panel--error" role="alert">{messages.errors.catalogUnavailable}</div> : null}
          {!loading && !failed && items.length === 0 ? <div className="status-panel status-panel--empty" role="status">{messages.downloads.empty}</div> : null}
          <div className="queue-list">
            {items.map((item) => (
              <article className="queue-row" key={`${item.catalogId}:${item.slug}`} data-gamepad-item>
                <ArtworkImage src={item.coverPath} alt={item.title[locale]} title={item.title[locale]} className="queue-row__art" sizes="96px" />
                <div className="queue-row__copy">
                  <span className="queue-row__platform">{PLATFORM_CATALOGS[item.catalogId].shortLabel}</span>
                  <h3>{item.title[locale]}</h3>
                  <span className="queue-row__path" title={paths[item.catalogId]}>{messages.downloads.targetPath}: {paths[item.catalogId]}</span>
                  <span className="queue-row__size">{formatFileSize(item.sizeBytes, locale)}</span>
                </div>
                <div className="queue-row__actions">
                  <Link className="queue-row__game-link" href={`/${locale}/games/${item.slug}?platform=${item.catalogId}`}>
                    <span aria-hidden="true">›</span>{messages.downloads.gamePage}
                  </Link>
                  <CollectionToggle item={item} kind="queue" locale={locale} messages={messages} compact />
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="downloads-sidebar">
          <section className="downloads-summary" aria-labelledby="activity-title">
            <p className="eyebrow">{messages.downloads.activityLabel}</p>
            <h2 id="activity-title">{messages.downloads.activity}</h2>
            <p>{messages.downloads.activityEmpty}</p>
          </section>
          <section className="downloads-summary" aria-labelledby="storage-title">
            <p className="eyebrow">{messages.downloads.storageLabel}</p>
            <h2 id="storage-title">{messages.downloads.storage}</h2>
            <p>{messages.downloads.storageNote}</p>
            <div className="storage-metric">
              <span>{messages.downloads.queuedItems}</span><strong>{items.length}</strong>
            </div>
            <div className="storage-metric">
              <span>{messages.downloads.estimatedQueueSize}</span><strong>{formatFileSize(totalBytes, locale)}</strong>
            </div>
            <div className="configured-paths">
              <span>{messages.downloads.configuredPaths}</span>
              {PLATFORM_CATALOG_IDS.map((platform) => (
                <div className="configured-path" key={platform}>
                  <small>{messages.navigation[platform]}</small>
                  <code title={paths[platform]}>{paths[platform]}</code>
                </div>
              ))}
              <Link href={`/${locale}/settings`}>{messages.navigation.settings}<span aria-hidden="true"> ↗</span></Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
