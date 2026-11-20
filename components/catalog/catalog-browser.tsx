"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CatalogFilterBar } from "@/components/catalog/catalog-filter-bar";
import { FeaturedSpotlight } from "@/components/catalog/featured-spotlight";
import { GameCard } from "@/components/catalog/game-card";
import { isPlatformCatalogId, isPlatformExtension, PLATFORM_CATALOGS, PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
import {
  isCatalogItemType,
  type CatalogFacets,
  type CatalogItem,
  type CatalogItemType,
  type CatalogSort,
  type Locale,
} from "@/lib/catalog/types";
import { getMessages, interpolate } from "@/lib/i18n/dictionaries";

const QUICK_CATALOG_EVENT = "emustore:catalog-step";

type ItemsResponse = {
  data: CatalogItem[];
  meta: {
    platform: string;
    total: number;
    facets: CatalogFacets;
  };
};

type CatalogBrowserProps = { locale: Locale };

function normalizeExtension(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function isCatalogSort(value: string | null): value is CatalogSort {
  return value === "title" || value === "size" || value === "updated";
}

export function CatalogBrowser({ locale }: CatalogBrowserProps) {
  const messages = getMessages(locale);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

  const requestedPlatform = searchParams.get("platform");
  const platform = isPlatformCatalogId(requestedPlatform) ? requestedPlatform : "ps1";
  const query = searchParams.get("q") ?? "";
  const typeValue = searchParams.get("type");
  const type = isCatalogItemType(typeValue) ? typeValue : "";
  const category = searchParams.get("category") ?? "";
  const formatValue = searchParams.get("format");
  const format = formatValue && isPlatformExtension(platform, normalizeExtension(formatValue))
    ? normalizeExtension(formatValue)
    : "";
  const sortParam = searchParams.get("sort");
  const sort: CatalogSort = isCatalogSort(sortParam) ? sortParam : "title";

  const [searchDraft, setSearchDraft] = useState(query);
  const [response, setResponse] = useState<ItemsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const apiQuery = useMemo(() => {
    const params = new URLSearchParams({
      platform,
      locale,
      limit: "100",
      offset: "0",
      sort,
    });
    if (query.trim()) params.set("q", query.trim());
    if (type) params.set("type", type);
    if (category) params.set("category", category);
    if (format) params.set("format", format);
    return params.toString();
  }, [platform, locale, query, type, category, format, sort]);

  const updateSearchParam = useCallback(
    (key: "q" | "type" | "category" | "format" | "sort", value: string) => {
      const params = new URLSearchParams(searchString);
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete("offset");
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchString],
  );

  useEffect(() => {
    setSearchDraft(query);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    let changed = false;

    if (requestedPlatform !== platform) {
      params.set("platform", platform);
      changed = true;
    }
    if (typeValue && !isCatalogItemType(typeValue)) {
      params.delete("type");
      changed = true;
    }
    if (formatValue && !isPlatformExtension(platform, normalizeExtension(formatValue))) {
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

    if (changed) {
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [formatValue, pathname, platform, query, requestedPlatform, router, searchString, typeValue]);

  useEffect(() => {
    if (searchDraft.trim() === query.trim()) return;
    const timeout = window.setTimeout(() => updateSearchParam("q", searchDraft.trim()), 280);
    return () => window.clearTimeout(timeout);
  }, [query, searchDraft, updateSearchParam]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setLoadFailed(false);

    fetch(`/api/v1/items?${apiQuery}`, { cache: "no-store", signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) throw new Error("Catalog request failed");
        return (await result.json()) as ItemsResponse;
      })
      .then((nextResponse) => {
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
  }, [apiQuery, retryToken]);

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchString);
    for (const key of ["q", "type", "category", "format", "offset"]) params.delete(key);
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchString]);

  useEffect(() => {
    const onQuickCatalogStep = (event: Event) => {
      const delta = (event as CustomEvent<{ delta?: number }>).detail?.delta;
      if (delta !== -1 && delta !== 1) return;

      const currentIndex = PLATFORM_CATALOG_IDS.indexOf(platform);
      const nextIndex = (currentIndex + delta + PLATFORM_CATALOG_IDS.length) % PLATFORM_CATALOG_IDS.length;
      const nextPlatform = PLATFORM_CATALOG_IDS[nextIndex];
      const params = new URLSearchParams(searchString);
      params.set("platform", nextPlatform);
      params.delete("category");
      params.delete("format");
      params.delete("offset");
      router.push(`/${locale}?${params.toString()}`, { scroll: false });
    };

    window.addEventListener(QUICK_CATALOG_EVENT, onQuickCatalogStep);
    return () => window.removeEventListener(QUICK_CATALOG_EVENT, onQuickCatalogStep);
  }, [locale, platform, router, searchString]);

  const catalogItems = response?.data ?? [];
  const featured = catalogItems[0];
  const remainingItems = catalogItems;
  const activePlatformLabel = PLATFORM_CATALOGS[platform].label;

  return (
    <main className="catalog-page">
      <section className="catalog-intro">
        <div>
          <p className="eyebrow"><span className="status-dot" />{activePlatformLabel}</p>
          <h1>{interpolate(messages.catalog.title, { platform: PLATFORM_CATALOGS[platform].shortLabel })}</h1>
          <p className="catalog-intro__description">
            {interpolate(messages.catalog.description, { platform: activePlatformLabel })}
          </p>
        </div>
        <div className="catalog-intro__index" aria-hidden="true">
          <span>EMUSTORE / CATALOG</span>
          <strong>{platform.toUpperCase()}</strong>
        </div>
      </section>

      <section className="catalog-controls" aria-label={messages.filters.title}>
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            updateSearchParam("q", searchDraft.trim());
          }}
        >
          <label htmlFor="catalog-search">{messages.catalog.search}</label>
          <div className="search-form__field">
            <span className="search-form__icon" aria-hidden="true">⌕</span>
            <input
              id="catalog-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              maxLength={120}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={messages.catalog.searchPlaceholder}
            />
            <kbd className="search-form__shortcut" aria-hidden="true">↵</kbd>
          </div>
        </form>

        <CatalogFilterBar
          facets={response?.meta.facets ?? null}
          locale={locale}
          messages={messages}
          type={type}
          category={category}
          format={format}
          sort={sort}
          onChange={(key, value) => updateSearchParam(key, value)}
          onClear={clearFilters}
        />
      </section>

      {loadFailed ? (
        <div className="status-panel status-panel--error" role="alert">
          <p>{messages.errors.catalogUnavailable} {messages.catalog.loadError}</p>
          <button className="button button--quiet" type="button" onClick={() => setRetryToken((value) => value + 1)}>
            {messages.catalog.retry}
          </button>
        </div>
      ) : null}

      {isLoading && !response ? (
        <div className="status-panel" role="status">{messages.catalog.loading}</div>
      ) : null}

      {featured && !loadFailed ? (
        <>
          <FeaturedSpotlight
            item={featured}
            locale={locale}
            messages={messages}
            searchQuery={searchString}
          />
          <section className="catalog-results" aria-labelledby="catalog-results-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{messages.navigation[platform]}</p>
                <h2 id="catalog-results-title">
                  {interpolate(messages.catalog.browse, { platform: PLATFORM_CATALOGS[platform].shortLabel })}
                </h2>
              </div>
              <span className="result-count">
                {interpolate(messages.catalog.resultCount, { count: response?.meta.total ?? 0 })}
              </span>
            </div>
            {remainingItems.length > 0 ? (
              <div className="game-grid">
                {remainingItems.map((item) => (
                  <GameCard
                    key={`${item.catalogId}:${item.slug}`}
                    item={item}
                    locale={locale}
                    messages={messages}
                    searchQuery={searchString}
                  />
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {!isLoading && !loadFailed && response && response.data.length === 0 ? (
        <div className="status-panel status-panel--empty" role="status">
          <span className="status-panel__mark" aria-hidden="true">⌕</span>
          <p>{messages.catalog.noResults}</p>
          <button className="text-action" type="button" onClick={clearFilters}>
            {messages.filters.clear}
          </button>
        </div>
      ) : null}
    </main>
  );
}
