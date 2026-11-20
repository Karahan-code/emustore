"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import { CollectionToggle } from "@/components/catalog/collection-toggle";
import type { CatalogItem, Locale } from "@/lib/catalog/types";
import type { PlatformCatalogId } from "@/lib/catalog/platforms";
import { PLATFORM_CATALOGS } from "@/lib/catalog/platforms";
import { formatFileSize } from "@/lib/catalog/format";
import type { Messages } from "@/lib/i18n/dictionaries";

type DiscoverViewProps = {
  items: CatalogItem[];
  locale: Locale;
  messages: Messages;
  searchQuery: string;
  selectedPlatform: PlatformCatalogId;
};

export function DiscoverView({ items, locale, messages, searchQuery, selectedPlatform }: DiscoverViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    const selectedPlatformIndex = items.findIndex((item) => item.catalogId === selectedPlatform);
    setSelectedIndex(selectedPlatformIndex >= 0 ? selectedPlatformIndex : 0);
  }, [items, selectedPlatform]);

  const featured = items[selectedIndex];
  if (!featured) return null;

  const detailsParams = new URLSearchParams(searchQuery);
  detailsParams.set("platform", featured.catalogId);
  const detailsHref = `/${locale}/games/${featured.slug}?${detailsParams.toString()}`;
  const platformLabel = PLATFORM_CATALOGS[featured.catalogId].shortLabel;

  return (
    <>
      <section className="discover-layout" aria-label={messages.navigation.discover}>
        <article className="discover-hero" data-gamepad-item>
          <div className="discover-hero__copy">
            <p className="discover-hero__eyebrow">{platformLabel} <span>·</span> {featured.category[locale]}</p>
            <h1>{featured.title[locale]}</h1>
            <p className="discover-hero__description">{featured.description[locale]}</p>
            <div className="discover-hero__meta">
              <span>{featured.fileExtension.toUpperCase()}</span>
              <span>{formatFileSize(featured.sizeBytes, locale)}</span>
              {featured.ratingScore !== undefined ? <span>{messages.catalog.score} {featured.ratingScore}</span> : null}
            </div>
            <div className="discover-hero__actions">
              <Link className="button button--white" href={detailsHref}>{messages.catalog.viewGame}<span aria-hidden="true"> ›</span></Link>
              <CollectionToggle item={featured} kind="favorite" locale={locale} messages={messages} />
              <CollectionToggle item={featured} kind="queue" locale={locale} messages={messages} />
            </div>
          </div>
          <div className="discover-hero__art">
            <ArtworkImage
              src={featured.coverPath}
              alt={featured.title[locale]}
              title={featured.title[locale]}
              className="discover-hero__cover"
              sizes="(max-width: 760px) 42vw, 24vw"
              priority
            />
          </div>
        </article>

        <aside className="discover-feature-list" aria-label={messages.catalog.featured}>
          <div className="discover-feature-list__heading">
            <span>{messages.catalog.featured}</span>
            <span>{String(items.length).padStart(2, "0")}</span>
          </div>
          {items.slice(0, 5).map((item, index) => (
            <button
              className={`discover-feature-row${index === selectedIndex ? " discover-feature-row--active" : ""}`}
              type="button"
              key={`${item.catalogId}:${item.slug}`}
              aria-pressed={index === selectedIndex}
              onFocus={() => setSelectedIndex(index)}
              onClick={() => setSelectedIndex(index)}
            >
              <ArtworkImage src={item.coverPath} alt="" title={item.title[locale]} className="discover-feature-row__art" sizes="74px" />
              <span className="discover-feature-row__copy">
                <strong>{item.title[locale]}</strong>
                <small>{PLATFORM_CATALOGS[item.catalogId].shortLabel} · {item.category[locale]}</small>
              </span>
              <span className="discover-feature-row__score">{item.ratingScore ?? "—"}</span>
            </button>
          ))}
        </aside>
      </section>

      <section className="popular-strip" aria-labelledby="popular-now-title">
        <div className="popular-strip__heading">
          <h2 id="popular-now-title">{messages.catalog.popularNow}</h2>
          <Link href={`/${locale}?view=browse&platform=${featured.catalogId}`}>{messages.catalog.browseLibrary}<span aria-hidden="true"> ›</span></Link>
        </div>
        <div className="popular-strip__items">
          {items.slice(0, 6).map((item) => {
            const params = new URLSearchParams(searchQuery);
            params.set("platform", item.catalogId);
            return (
              <Link className="popular-item" href={`/${locale}/games/${item.slug}?${params.toString()}`} key={`${item.catalogId}:${item.slug}`}>
                <ArtworkImage src={item.coverPath} alt={item.title[locale]} title={item.title[locale]} className="popular-item__art" sizes="180px" />
                <span>{item.title[locale]}</span>
                <small>{item.category[locale]}</small>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
