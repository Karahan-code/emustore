"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CatalogFilterBar } from "@/components/catalog/catalog-filter-bar";
import { DiscoverView } from "@/components/catalog/discover-view";
import { GameCard } from "@/components/catalog/game-card";
import { PlatformPills } from "@/components/catalog/platform-pills";
import { useOtaCatalog } from "@/components/shell/ota-catalog-provider";
import { isPlatformCatalogId, isPlatformExtension, PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
import { getLiveCatalogFacets, queryLiveCatalog } from "@/lib/catalog/ota-store";
import {
  isCatalogItemType,
  type CatalogFacets,
  type CatalogItem,
  type CatalogItemType,
  type CatalogSort,
  type Locale,
} from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type ItemsResponse = {
  data: CatalogItem[];
  meta: {
    platform: string;
    total: number;
    downloadableCount: number;
    facets: CatalogFacets;
  };
};

function mergeFacets(facets: CatalogFacets[]): CatalogFacets {
  const categories = new Map<string, CatalogFacets["categories"][number]>();
  const formats = new Map<string, CatalogFacets["formats"][number]>();
  const types = new Set<CatalogItemType>();

  for (const facet of facets) {
    for (const category of facet.categories) categories.set(category.id, category);
    for (const format of facet.formats) formats.set(format.extension, format);
    for (const type of facet.types) types.add(type);
  }

  return {
    categories: [...categories.values()].sort((left, right) => left.id.localeCompare(right.id)),
    formats: [...formats.values()].sort((left, right) => left.extension.localeCompare(right.extension)),
    types: [...types],
  };
}

function releaseSortKey(item: CatalogItem): string {
  if (item.releasedAt) return item.releasedAt;
  if (/^\d{4}$/.test(item.version)) return `${item.version}-01-01`;
  return item.updatedAt;
}

function sortItems(items: CatalogItem[], sort: CatalogSort, locale: Locale): CatalogItem[] {
  return [...items].sort((left, right) => {
    if (sort === "popular") return (right.ratingsCount ?? 0) - (left.ratingsCount ?? 0);
    if (sort === "size") return left.sizeBytes - right.sizeBytes;
    if (sort === "updated") return releaseSortKey(right).localeCompare(releaseSortKey(left));
    if (sort === "rating") {
      return (
        (right.metacritic ?? right.ratingScore ?? -1) - (left.metacritic ?? left.ratingScore ?? -1) ||
        (right.rating ?? 0) - (left.rating ?? 0)
      );
    }
    return left.title[locale].localeCompare(right.title[locale], locale);
  });
}

type CatalogBrowserProps = { locale: Locale };

function normalizeExtension(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function isCatalogSort(value: string | null): value is CatalogSort {
  return (
    value === "popular" ||
    value === "title" ||
    value === "size" ||
    value === "updated" ||
    value === "rating"
  );
}

export function CatalogBrowser({ locale }: CatalogBrowserProps) {
  const messages = getMessages(locale);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();
  const otaCatalog = useOtaCatalog();

  const requestedPlatform = searchParams.get("platform");
  const platformSelection = requestedPlatform === "all"
    ? "all"
    : isPlatformCatalogId(requestedPlatform)
      ? requestedPlatform
      : "ps1";
  const isAllPlatforms = platformSelection === "all";
  const platform = isAllPlatforms ? "ps1" : platformSelection;
  const query = searchParams.get("q") ?? "";
  const typeValue = searchParams.get("type");
  const type = isCatalogItemType(typeValue) ? typeValue : "";
  const category = searchParams.get("category") ?? "";
  const formatValue = searchParams.get("format");
  const isFormatSupported = formatValue && (isAllPlatforms
    ? PLATFORM_CATALOG_IDS.some((catalogId) => isPlatformExtension(catalogId, normalizeExtension(formatValue)))
    : isPlatformExtension(platform, normalizeExtension(formatValue)));
  const format = formatValue && isFormatSupported
    ? normalizeExtension(formatValue)
    : "";
  const sortParam = searchParams.get("sort");
  const sort: CatalogSort = isCatalogSort(sortParam) ? sortParam : "title";
  const downloadableValue = searchParams.get("downloadable");
  const downloadableOnly = downloadableValue === "1";
  const view = searchParams.get("view") === "browse" ? "browse" : "discover";

  const isBrowse = view === "browse";

  const response = useMemo<ItemsResponse | null>(() => {
    if (!isBrowse) return null;

    const platforms = isAllPlatforms ? [...PLATFORM_CATALOG_IDS] : [platform];
    const results = platforms.map((catalogId) => {
      const baseQuery = {
        platform: catalogId,
        q: query.trim() || undefined,
        type: type || undefined,
        category: category || undefined,
        format: format && isPlatformExtension(catalogId, format) ? format : undefined,
        locale,
        limit: 100,
        offset: 0,
        sort,
      };
      return {
        catalogId,
        page: queryLiveCatalog(otaCatalog, {
          ...baseQuery,
          downloadableOnly: downloadableOnly || undefined,
        }),
        downloadableTotal: downloadableOnly
          ? null
          : queryLiveCatalog(otaCatalog, {
            ...baseQuery,
            limit: 1,
            downloadableOnly: true,
          }).total,
        facets: getLiveCatalogFacets(otaCatalog, catalogId),
      };
    });

    const items = results.flatMap(({ catalogId, page }) => {
      if (format && !isPlatformExtension(catalogId, format)) return [];
      return page.items;
    });
    const total = results.reduce(
      (count, { catalogId, page }) =>
        count + (format && !isPlatformExtension(catalogId, format) ? 0 : page.total),
      0,
    );
    const downloadableCount = downloadableOnly
      ? total
      : results.reduce(
        (count, { catalogId, downloadableTotal }) =>
          count + (format && !isPlatformExtension(catalogId, format) ? 0 : downloadableTotal ?? 0),
        0,
      );

    return {
      data: sortItems(items, sort, locale).slice(0, 100),
      meta: {
        platform: platformSelection,
        total,
        downloadableCount,
        facets: mergeFacets(results.map((entry) => entry.facets)),
      },
    };
  }, [category, downloadableOnly, format, isAllPlatforms, isBrowse, locale, otaCatalog, platform, platformSelection, query, sort, type]);

  const discoverFeed = useMemo<CatalogItem[] | null>(() => {
    if (view !== "discover") return null;

    const catalogs = PLATFORM_CATALOG_IDS.map((catalogId) =>
      queryLiveCatalog(otaCatalog, {
        platform: catalogId,
        locale,
        limit: 100,
        offset: 0,
        sort: "popular",
      }).items,
    );

    const activePos = PLATFORM_CATALOG_IDS.indexOf(platform);
    const orderedCatalogs = activePos > 0
      ? [catalogs[activePos], ...catalogs.slice(0, activePos), ...catalogs.slice(activePos + 1)]
      : catalogs;
    const maxLength = orderedCatalogs.reduce((max, list) => Math.max(max, list.length), 0);
    const combined: CatalogItem[] = [];
    for (let rowIndex = 0; rowIndex < maxLength; rowIndex += 1) {
      for (const list of orderedCatalogs) {
        const candidate = list[rowIndex];
        if (candidate) combined.push(candidate);
      }
    }
    return combined;
  }, [locale, otaCatalog, platform, view]);

  const updateSearchParam = useCallback(
    (key: "q" | "type" | "category" | "format" | "sort" | "downloadable", value: string) => {
      const params = new URLSearchParams(searchString);
      if (value) params.set(key, value);
      else params.delete(key);
      params.set("view", "browse");
      params.delete("offset");
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchString],
  );

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    let changed = false;

    if (requestedPlatform !== platformSelection) {
      params.set("platform", platformSelection);
      changed = true;
    }
    if (typeValue && !isCatalogItemType(typeValue)) {
      params.delete("type");
      changed = true;
    }
    if (formatValue && !isFormatSupported) {
      params.delete("format");
      changed = true;
    } else if (formatValue && formatValue !== normalizeExtension(formatValue)) {
      params.set("format", normalizeExtension(formatValue));
      changed = true;
    }
    const sortValue = params.get("sort");
    if (sortValue && !isCatalogSort(sortValue)) {
      params.delete("sort");
      changed = true;
    }
    if (downloadableValue && downloadableValue !== "1") {
      params.delete("downloadable");
      changed = true;
    }
    if (query.length > 120) {
      params.set("q", query.slice(0, 120));
      changed = true;
    }
    const viewValue = params.get("view");
    if (viewValue && viewValue !== "discover" && viewValue !== "browse") {
      params.set("view", "discover");
      changed = true;
    }

    if (changed) {
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [downloadableValue, formatValue, isFormatSupported, pathname, platformSelection, query, requestedPlatform, router, searchString, typeValue]);

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchString);
    for (const key of ["q", "type", "category", "format", "sort", "downloadable", "offset"]) params.delete(key);
    params.set("view", "browse");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchString]);

  const catalogItems = response?.data ?? [];
  const discoveryItems = discoverFeed ?? catalogItems;
  const activePlatformLabel = isAllPlatforms ? messages.filters.all : messages.navigation[platform];

  return (
    <main className={`catalog-page catalog-page--${view}`}>
      {view === "discover" && discoveryItems.length > 0 ? (
        <DiscoverView items={discoveryItems} locale={locale} messages={messages} searchQuery={searchString} selectedPlatform={platform} />
      ) : null}

      {view === "browse" ? (
        <section className="browse-page" aria-labelledby="browse-library-title">
          <div className="browse-page__heading">
            <div>
              <p className="eyebrow">{activePlatformLabel}</p>
              <h1 id="browse-library-title">{messages.catalog.browseLibrary}</h1>
            </div>
            <span className="browse-page__count">{interpolateResultCount(messages.catalog.resultCount, response?.meta.total ?? 0)}</span>
          </div>
          <PlatformPills
            locale={locale}
            messages={messages}
            selectedPlatform={platformSelection}
            searchQuery={searchString}
          />
          <CatalogFilterBar
            facets={response?.meta.facets ?? null}
            locale={locale}
            messages={messages}
            type={type}
            category={category}
            format={format}
            query={query}
            sort={sort}
            downloadableOnly={downloadableOnly}
            downloadableCount={response?.meta.downloadableCount ?? 0}
            onChange={(key, value) => updateSearchParam(key, value)}
            onClear={clearFilters}
          />
          {catalogItems.length > 0 ? (
            <div className="game-grid">
              {catalogItems.map((item) => (
                <GameCard key={`${item.catalogId}:${item.slug}`} item={item} locale={locale} messages={messages} searchQuery={searchString} />
              ))}
            </div>
          ) : (
            <div className="status-panel status-panel--empty" role="status">
              <p>{messages.catalog.noResults}</p>
              <button className="text-action" type="button" onClick={clearFilters}>{messages.filters.clear}</button>
            </div>
          )}
        </section>
      ) : null}

      {discoverFeed !== null && discoveryItems.length === 0 && view === "discover" ? (
        <div className="status-panel status-panel--empty" role="status">{messages.catalog.noResults}</div>
      ) : null}

      <span className="sr-only">{activePlatformLabel}</span>
    </main>
  );
}

function interpolateResultCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}
