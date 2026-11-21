"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import { CollectionToggle } from "@/components/catalog/collection-toggle";
import type { CatalogItem, Locale } from "@/lib/catalog/types";
import { PLATFORM_CATALOG_IDS, PLATFORM_CATALOGS, type PlatformCatalogId } from "@/lib/catalog/platforms";
import { formatFileSize } from "@/lib/catalog/format";
import type { Messages } from "@/lib/i18n/dictionaries";

type DiscoverViewProps = {
  items: CatalogItem[];
  locale: Locale;
  messages: Messages;
  searchQuery: string;
  selectedPlatform: PlatformCatalogId;
};

function normalizeLibraryText(value: string, locale: Locale): string {
  return value.normalize("NFKC").toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US");
}

export function DiscoverView({ items, locale, messages, searchQuery, selectedPlatform }: DiscoverViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryPlatform, setLibraryPlatform] = useState<PlatformCatalogId | "all">("all");
  const [libraryCategory, setLibraryCategory] = useState<string | null>(null);
  useEffect(() => {
    const selectedPlatformIndex = items.findIndex((item) => item.catalogId === selectedPlatform);
    setSelectedIndex(selectedPlatformIndex >= 0 ? selectedPlatformIndex : 0);
  }, [items, selectedPlatform]);

  const featured = items[selectedIndex];
  const matchingLibraryItems = useMemo(() => {
    const query = normalizeLibraryText(libraryQuery.trim(), locale);
    return items.filter((item) => {
      if (libraryPlatform !== "all" && item.catalogId !== libraryPlatform) return false;
      if (!query) return true;
      const searchable = [
        item.title.en,
        item.title.tr,
        item.description.en,
        item.description.tr,
        item.category.en,
        item.category.tr,
        item.developer,
        ...item.tags,
      ].map((value) => normalizeLibraryText(value, locale)).join(" ");
      return searchable.includes(query);
    });
  }, [items, libraryPlatform, libraryQuery, locale]);
  const libraryCategories = useMemo(() => {
    const categories = new Map<string, { label: string; count: number }>();
    for (const item of matchingLibraryItems) {
      const category = categories.get(item.categoryId);
      if (category) category.count += 1;
      else categories.set(item.categoryId, { label: item.category[locale], count: 1 });
    }
    return [...categories.entries()]
      .map(([id, category]) => ({ id, ...category }))
      .sort((left, right) => left.label.localeCompare(right.label, locale));
  }, [locale, matchingLibraryItems]);
  const libraryItems = libraryCategory
    ? matchingLibraryItems.filter((item) => item.categoryId === libraryCategory)
    : matchingLibraryItems;
  const libraryCount = messages.catalog.titleCount.replace("{count}", String(libraryItems.length));
  if (!featured) return null;

  const detailsParams = new URLSearchParams(searchQuery);
  detailsParams.set("platform", featured.catalogId);
  const detailsHref = "/" + locale + "/games/" + featured.slug + "?" + detailsParams.toString();
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
              <ArtworkImage src={item.coverPath} alt="" title={item.title[locale]} className="discover-feature-row__art" sizes="74px" monogramOnly />
              <span className="discover-feature-row__copy">
                <strong>{item.title[locale]}</strong>
                <small>{PLATFORM_CATALOGS[item.catalogId].shortLabel} · {item.category[locale]}</small>
              </span>
              {item.ratingScore !== undefined ? <span className="discover-feature-row__score">{item.ratingScore}</span> : null}
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

      <section className="library-section" aria-labelledby="library-title">
        <div className="library-section__heading">
          <h2 id="library-title">{messages.catalog.theLibrary}</h2>
          <span className="result-count">{libraryCount}</span>
        </div>
        <div className="library-controls">
          <label className="library-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              inputMode="search"
              value={libraryQuery}
              onChange={(event) => {
                setLibraryQuery(event.target.value);
                setLibraryCategory(null);
              }}
              placeholder={messages.catalog.librarySearchPlaceholder}
              aria-label={messages.catalog.librarySearchPlaceholder}
            />
          </label>
          <nav className="library-platform-pills" aria-label={messages.filters.platform}>
            <button
              className={"library-pill" + (libraryPlatform === "all" ? " library-pill--active" : "")}
              type="button"
              aria-pressed={libraryPlatform === "all"}
              onClick={() => { setLibraryPlatform("all"); setLibraryCategory(null); }}
            >
              {messages.filters.all}
            </button>
            {PLATFORM_CATALOG_IDS.map((platform) => (
              <button
                className={"library-pill" + (libraryPlatform === platform ? " library-pill--active" : "")}
                type="button"
                key={platform}
                aria-pressed={libraryPlatform === platform}
                onClick={() => { setLibraryPlatform(platform); setLibraryCategory(null); }}
              >
                {PLATFORM_CATALOGS[platform].shortLabel}
              </button>
            ))}
          </nav>
          <nav className="library-category-pills" aria-label={messages.filters.category}>
            <button
              className={"library-pill" + (libraryCategory === null ? " library-pill--active" : "")}
              type="button"
              aria-pressed={libraryCategory === null}
              onClick={() => setLibraryCategory(null)}
            >
              {messages.filters.all} {matchingLibraryItems.length}
            </button>
            {libraryCategories.map((category) => (
              <button
                className={"library-pill" + (libraryCategory === category.id ? " library-pill--active" : "")}
                type="button"
                key={category.id}
                aria-pressed={libraryCategory === category.id}
                onClick={() => setLibraryCategory(category.id)}
              >
                {category.label} {category.count}
              </button>
            ))}
          </nav>
        </div>
        {libraryItems.length > 0 ? (
          <div className="library-grid">
            {libraryItems.map((item) => (
              <Link
                className="library-card"
                href={"/" + locale + "/games/" + item.slug + "?platform=" + item.catalogId}
                key={item.catalogId + ":" + item.slug}
                data-gamepad-item
              >
                <span className="library-card__media">
                  <ArtworkImage
                    src={item.coverPath}
                    alt={item.title[locale]}
                    title={item.title[locale]}
                    className="library-card__art"
                    sizes="(max-width: 560px) 45vw, (max-width: 900px) 28vw, 16vw"
                    monogramOnly
                  />
                  <span className="library-card__platform">{PLATFORM_CATALOGS[item.catalogId].shortLabel}</span>
                </span>
                <span className="library-card__genre">{item.category[locale]}</span>
                <strong>{item.title[locale]}</strong>
              </Link>
            ))}
          </div>
        ) : (
          <div className="status-panel status-panel--empty" role="status">{messages.catalog.noResults}</div>
        )}
      </section>
    </>
  );
}
