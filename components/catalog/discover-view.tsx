"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import { CollectionToggle } from "@/components/catalog/collection-toggle";
import { GenreIcon } from "@/components/catalog/genre-icon";
import { getDisplayScore, MetacriticBadge } from "@/components/catalog/metacritic-badge";
import { formatFileSize } from "@/lib/catalog/format";
import { PLATFORM_CATALOG_IDS, PLATFORM_CATALOGS, type PlatformCatalogId } from "@/lib/catalog/platforms";
import type { CatalogItem, CatalogSort, Locale } from "@/lib/catalog/types";
import { interpolate, type Messages } from "@/lib/i18n/dictionaries";

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

function getReleaseTimestamp(item: CatalogItem): number {
  const candidate = item.releasedAt ?? (/^\d{4}$/.test(item.version) ? `${item.version}-01-01` : item.updatedAt);
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatReleaseDate(item: CatalogItem, locale: Locale): string | null {
  if (item.releasedAt) {
    const parsed = Date.parse(item.releasedAt);
    if (!Number.isNaN(parsed)) {
      return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(parsed));
    }
  }
  return /^\d{4}$/.test(item.version) ? item.version : null;
}

function getStarRating(item: CatalogItem): string | null {
  if (item.rating !== undefined) return item.rating.toFixed(1);
  const displayScore = getDisplayScore(item);
  if (displayScore !== undefined) return (displayScore / 20).toFixed(1);
  return null;
}

export function DiscoverView({ items, locale, messages, searchQuery, selectedPlatform }: DiscoverViewProps) {
  const [manualSelection, setManualSelection] = useState<{
    platform: PlatformCatalogId;
    index: number;
  } | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryPlatform, setLibraryPlatform] = useState<PlatformCatalogId | "all">("all");
  const [libraryCategory, setLibraryCategory] = useState<string | null>(null);

  const defaultIndex = items.findIndex((item) => item.catalogId === selectedPlatform);
  const selectedIndex =
    manualSelection &&
    manualSelection.platform === selectedPlatform &&
    manualSelection.index >= 0 &&
    manualSelection.index < items.length
      ? manualSelection.index
      : defaultIndex >= 0
        ? defaultIndex
        : 0;

  const featured = items[selectedIndex];

  const mostPopularItems = useMemo(
    () => [...items].sort((left, right) => (right.ratingsCount ?? -1) - (left.ratingsCount ?? -1)).slice(0, 5),
    [items],
  );

  const newReleaseItems = useMemo(
    () =>
      [...items]
        .sort(
          (left, right) =>
            getReleaseTimestamp(right) - getReleaseTimestamp(left) ||
            (getDisplayScore(right) ?? -1) - (getDisplayScore(left) ?? -1),
        )
        .slice(0, 5),
    [items],
  );

  const topRatedItems = useMemo(
    () =>
      [...items]
        .sort(
          (left, right) =>
            (getDisplayScore(right) ?? -1) - (getDisplayScore(left) ?? -1) ||
            (right.rating ?? 0) - (left.rating ?? 0) ||
            (right.ratingsCount ?? 0) - (left.ratingsCount ?? 0),
        )
        .slice(0, 5),
    [items],
  );

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
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, locale));
  }, [locale, matchingLibraryItems]);

  const libraryItems = libraryCategory
    ? matchingLibraryItems.filter((item) => item.categoryId === libraryCategory)
    : matchingLibraryItems;
  const libraryCount = interpolate(messages.catalog.titleCount, { count: libraryItems.length });
  if (!featured) return null;

  const detailsParams = new URLSearchParams(searchQuery);
  detailsParams.set("platform", featured.catalogId);
  const detailsHref = "/" + locale + "/games/" + featured.slug + "?" + detailsParams.toString();
  const platformLabel = PLATFORM_CATALOGS[featured.catalogId].shortLabel;
  const featuredScore = getDisplayScore(featured);

  const showcaseColumns: Array<{
    id: string;
    title: string;
    sort: CatalogSort;
    rows: CatalogItem[];
    showReleaseDate?: boolean;
  }> = [
    {
      id: "popular",
      title: messages.catalog.mostPopular,
      sort: "popular",
      rows: mostPopularItems,
    },
    {
      id: "new-releases",
      title: messages.catalog.newReleases,
      sort: "updated",
      rows: newReleaseItems,
      showReleaseDate: true,
    },
    {
      id: "top-rated",
      title: messages.catalog.topRated,
      sort: "rating",
      rows: topRatedItems,
    },
  ];

  return (
    <>
      <section className="discover-layout" aria-label={messages.navigation.discover}>
        <article className="discover-hero" data-gamepad-item>
          <div className="discover-hero__copy">
            <p className="discover-hero__eyebrow">{platformLabel} <span>·</span> {featured.category[locale]}</p>
            <h1>{featured.title[locale]}</h1>
            <p className="discover-hero__description">{featured.description[locale]}</p>
            <div className="discover-hero__meta">
              <MetacriticBadge
                score={featuredScore}
                label={messages.catalog.metacritic}
                showLabel
                size="sm"
              />
              <span>{featured.fileExtension.toUpperCase()}</span>
              <span>{formatFileSize(featured.sizeBytes, locale)}</span>
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
              eager
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
              onFocus={() => setManualSelection({ platform: selectedPlatform, index })}
              onClick={() => setManualSelection({ platform: selectedPlatform, index })}
            >
              <ArtworkImage src={item.coverPath} alt="" title={item.title[locale]} className="discover-feature-row__art" sizes="74px" monogramOnly />
              <span className="discover-feature-row__copy">
                <strong>{item.title[locale]}</strong>
                <small>{PLATFORM_CATALOGS[item.catalogId].shortLabel} · {item.category[locale]}</small>
              </span>
              <MetacriticBadge
                score={getDisplayScore(item)}
                label={messages.catalog.metacritic}
                size="sm"
              />
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
                <span className="popular-item__footer">
                  <span>{formatFileSize(item.sizeBytes, locale)}</span>
                  <MetacriticBadge
                    score={getDisplayScore(item)}
                    label={messages.catalog.metacritic}
                    size="sm"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="discover-showcase" aria-label={messages.catalog.showcaseLabel}>
        {showcaseColumns.map((column) => (
          <div className="discover-showcase__column" key={column.id}>
            <div className="discover-showcase__header">
              <h2>
                <span className="discover-accent-bar" aria-hidden="true" />
                {column.title}
              </h2>
              <Link href={`/${locale}?view=browse&platform=all&sort=${column.sort}`}>
                {messages.catalog.seeAll}<span aria-hidden="true"> ›</span>
              </Link>
            </div>
            <ol className="discover-rank-list">
              {column.rows.map((item, rowIndex) => {
                const score = getDisplayScore(item);
                const starRating = getStarRating(item);
                const releaseLabel = column.showReleaseDate ? formatReleaseDate(item, locale) : null;
                return (
                  <li key={`${column.id}:${item.catalogId}:${item.slug}`}>
                    <Link
                      className="discover-rank-row"
                      href={`/${locale}/games/${item.slug}?platform=${item.catalogId}`}
                      data-gamepad-item
                    >
                      <span className="discover-rank-row__rank">{rowIndex + 1}</span>
                      <ArtworkImage
                        src={item.coverPath}
                        alt=""
                        title={item.title[locale]}
                        className="discover-rank-row__art"
                        sizes="48px"
                        monogramOnly
                      />
                      <span className="discover-rank-row__copy">
                        <strong>{item.title[locale]}</strong>
                        <span className="discover-rank-row__sub">
                          {starRating ? (
                            <>
                              <span className="discover-rank-row__star" aria-hidden="true">★</span>
                              <span>{starRating}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          ) : null}
                          <span>{PLATFORM_CATALOGS[item.catalogId].shortLabel}</span>
                          {releaseLabel ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{releaseLabel}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <MetacriticBadge
                        score={score}
                        label={messages.catalog.metacritic}
                        showLabel
                        size="sm"
                      />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
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
        </div>

        <div className="genre-grid-section">
          <div className="genre-grid-section__heading">
            <h3>
              <span className="discover-accent-bar" aria-hidden="true" />
              {messages.catalog.popularGenres}
            </h3>
          </div>
          <div className="genre-grid" role="group" aria-label={messages.catalog.popularGenres}>
            <button
              className={`genre-tile${libraryCategory === null ? " genre-tile--active" : ""}`}
              type="button"
              aria-pressed={libraryCategory === null}
              onClick={() => setLibraryCategory(null)}
              data-gamepad-item
            >
              <span className="genre-tile__icon">
                <GenreIcon categoryId="all" />
              </span>
              <span className="genre-tile__copy">
                <strong>{messages.filters.all}</strong>
                <span>{interpolate(messages.catalog.gameCount, { count: matchingLibraryItems.length })}</span>
              </span>
            </button>
            {libraryCategories.map((category) => {
              const active = libraryCategory === category.id;
              return (
                <button
                  className={`genre-tile${active ? " genre-tile--active" : ""}`}
                  type="button"
                  key={category.id}
                  aria-pressed={active}
                  onClick={() => setLibraryCategory(active ? null : category.id)}
                  data-gamepad-item
                >
                  <span className="genre-tile__icon">
                    <GenreIcon categoryId={category.id} />
                  </span>
                  <span className="genre-tile__copy">
                    <strong>{category.label}</strong>
                    <span>{interpolate(messages.catalog.gameCount, { count: category.count })}</span>
                  </span>
                </button>
              );
            })}
          </div>
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
                <span className="library-card__footer">
                  <span>{formatFileSize(item.sizeBytes, locale)}</span>
                  <MetacriticBadge
                    score={getDisplayScore(item)}
                    label={messages.catalog.metacritic}
                    size="sm"
                  />
                </span>
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
