"use client";

import type { CatalogItem, Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";
import { useCollections } from "@/components/shell/collections-provider";

type CollectionToggleProps = {
  item: CatalogItem;
  kind: "favorite" | "queue";
  locale: Locale;
  messages: Messages;
  compact?: boolean;
};

export function CollectionToggle({ item, kind, locale, messages, compact = false }: CollectionToggleProps) {
  const collections = useCollections();
  const reference = { catalogId: item.catalogId, slug: item.slug };
  const active = kind === "favorite"
    ? collections.isFavorite(reference)
    : collections.isQueued(reference);
  const label = kind === "favorite"
    ? active ? messages.catalog.removeFavorite : messages.catalog.addFavorite
    : active ? messages.downloads.remove : messages.catalog.addToQueue;

  return (
    <button
      className={`collection-toggle collection-toggle--${kind}${active ? " collection-toggle--active" : ""}${compact ? " collection-toggle--compact" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={!collections.ready}
      data-gamepad-favorite={kind === "favorite" ? "true" : undefined}
      onClick={() => kind === "favorite" ? collections.toggleFavorite(reference) : collections.toggleQueue(reference)}
    >
      <span aria-hidden="true">{kind === "favorite" ? active ? "♥" : "♡" : active ? "×" : "↓"}</span>
      {!compact ? <span>{label}</span> : null}
      <span className="sr-only">{item.title[locale]}</span>
    </button>
  );
}
