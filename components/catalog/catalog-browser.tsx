"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CatalogFilterBar } from "@/components/catalog/catalog-filter-bar";
import { DiscoverView } from "@/components/catalog/discover-view";
import { GameCard } from "@/components/catalog/game-card";
import { PlatformPills } from "@/components/catalog/platform-pills";
import { isPlatformCatalogId, isPlatformExtension, PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
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

function sortItems(items: CatalogItem[], sort: CatalogSort, locale: Locale): CatalogItem[] {
  return [...items].sort((left, right) => {
    if (sort === "size") return left.sizeBytes - right.sizeBytes;
    if (sort === "updated") return right.updatedAt.localeCompare(left.updatedAt);
    if (sort === "rating") return (right.ratingScore ?? -1) - (left.ratingScore ?? -1);
    return left.title[locale].localeCompare(right.title[locale], locale);
  });
}

type CatalogBrowserProps = { locale: Locale };

function normalizeExtension(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function isCatalogSort(value: string | null): value is CatalogSort {
  return value === "title" || value === "size" || value === "updated" || value === "rating";
}

export function CatalogBrowser({ locale }: CatalogBrowserProps) {
  const messages = getMessages(locale);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

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
  const view = searchParams.get("view") === "browse" ? "browse" : "discover";

  const [response, setResponse] = useState<ItemsResponse | null>(null);
  const [discoverFeed, setDiscoverFeed] = useState<CatalogItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const apiRequests = useMemo(() => {
    const platforms = isAllPlatforms ? PLATFORM_CATALOG_IDS : [platform];
    return platforms.map((catalogId) => {
      const params = new URLSearchParams({
        platform: catalogId,
        locale,
        limit: "100",
        offset: "0",
        sort,
      });
      if (query.trim()) params.set("q", query.trim());
      if (type) params.set("type", type);
      if (category) params.set("category", category);
      if (format && isPlatformExtension(catalogId, format)) params.set("format", format);
      return { catalogId, query: params.toString() };
    });
  }, [isAllPlatforms, platform, locale, query, type, category, format, sort]);

  const updateSearchParam = useCallback(
    (key: "q" | "type" | "category" | "format" | "sort", value: string) => {
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
  }, [formatValue, isFormatSupported, pathname, platformSelection, query, requestedPlatform, router, searchString, typeValue]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadFailed(false);

    Promise.all(apiRequests.map(async ({ catalogId, query: requestQuery }) => {
      const result = await fetch(`/api/v1/items?${requestQuery}`, { cache: "no-store", signal: controller.signal });
      if (!result.ok) throw new Error(`Catalog request failed for ${catalogId}`);
      return (await result.json()) as ItemsResponse;
    }))
      .then((responses) => {
        const items = responses.flatMap((nextResponse, index) => {
          const requestedCatalog = apiRequests[index].catalogId;
          if (format && !isPlatformExtension(requestedCatalog, format)) return [];
          return nextResponse.data;
        });
        const total = responses.reduce((count, nextResponse, index) => {
          const requestedCatalog = apiRequests[index].catalogId;
          return count + (format && !isPlatformExtension(requestedCatalog, format) ? 0 : nextResponse.meta.total);
        }, 0);
        const nextResponse: ItemsResponse = {
          data: sortItems(items, sort, locale).slice(0, 100),
          meta: {
            platform: platformSelection,
            total,
            facets: mergeFacets(responses.map((entry) => entry.meta.facets)),
          },
        };
        setResponse(nextResponse);
        setLoadFailed(false);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [apiRequests, format, locale, platformSelection, retryToken, sort]);

  useEffect(() => {
    if (view !== "discover") {
      setDiscoverFeed(null);
      return;
    }

    const controller = new AbortController();
    Promise.all(PLATFORM_CATALOG_IDS.map(async (catalogId) => {
      const params = new URLSearchParams({
        platform: catalogId,
        locale,
        limit: "100",
        offset: "0",
        sort: "rating",
      });
      try {
        const result = await fetch(`/api/v1/items?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!result.ok) return [] as CatalogItem[];
        return ((await result.json()) as ItemsResponse).data;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        return [] as CatalogItem[];
      }
    }))
      .then((catalogs) => {
        const combined = catalogs.flat();
        const activeIndex = combined.findIndex((item) => item.catalogId === platform);
        if (activeIndex > 4) combined.unshift(...combined.splice(activeIndex, 1));
        setDiscoverFeed(combined);
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError")) setDiscoverFeed([]);
      });

    return () => controller.abort();
  }, [locale, platform, retryToken, view]);

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchString);
    for (const key of ["q", "type", "category", "format", "sort", "offset"]) params.delete(key);
    params.set("view", "browse");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchString]);

  const catalogItems = response?.data ?? [];
  const discoveryItems = discoverFeed?.length ? discoverFeed : catalogItems;
  const activePlatformLabel = isAllPlatforms ? messages.filters.all : messages.navigation[platform];

  return (
    <main className={`catalog-page catalog-page--${view}`} aria-busy={isLoading}>
      {loadFailed ? (
        <div className="status-panel status-panel--error" role="alert">
          <p>{messages.errors.catalogUnavailable}</p>
          <button className="button button--quiet" type="button" onClick={() => setRetryToken((value) => value + 1)}>
            {messages.catalog.retry}
          </button>
        </div>
      ) : null}

      {isLoading && !response ? <div className="status-panel" role="status">…</div> : null}

      {!loadFailed && view === "discover" && discoveryItems.length > 0 ? (
        <DiscoverView items={discoveryItems} locale={locale} messages={messages} searchQuery={searchString} selectedPlatform={platform} />
      ) : null}

      {!loadFailed && view === "browse" ? (
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
            onChange={(key, value) => updateSearchParam(key, value)}
            onClear={clearFilters}
          />
          {catalogItems.length > 0 ? (
            <div className="game-grid">
              {catalogItems.map((item) => (
                <GameCard key={`${item.catalogId}:${item.slug}`} item={item} locale={locale} messages={messages} searchQuery={searchString} />
              ))}
            </div>
          ) : !isLoading ? (
            <div className="status-panel status-panel--empty" role="status">
              <p>{messages.catalog.noResults}</p>
              <button className="text-action" type="button" onClick={clearFilters}>{messages.filters.clear}</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!loadFailed && !isLoading && discoverFeed !== null && discoveryItems.length === 0 && view === "discover" ? (
        <div className="status-panel status-panel--empty" role="status">{messages.catalog.noResults}</div>
      ) : null}

      <span className="sr-only">{activePlatformLabel}</span>
    </main>
  );
}

function interpolateResultCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}
