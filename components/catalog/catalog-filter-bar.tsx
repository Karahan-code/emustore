"use client";

import { useState } from "react";
import type { CatalogFacets, CatalogItemType, CatalogSort, Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type FilterKey = "q" | "type" | "category" | "format" | "sort";

type CatalogFilterBarProps = {
  facets: CatalogFacets | null;
  locale: Locale;
  messages: Messages;
  type: CatalogItemType | "";
  category: string;
  format: string;
  query: string;
  sort: CatalogSort;
  onChange: (key: FilterKey, value: string) => void;
  onClear: () => void;
};

const SORTS: CatalogSort[] = ["title", "size", "updated", "rating"];

export function CatalogFilterBar({
  facets,
  locale,
  messages,
  type,
  category,
  format,
  query,
  sort,
  onChange,
  onClear,
}: CatalogFilterBarProps) {
  const [open, setOpen] = useState(false);
  const types = facets?.types ?? ["game", "homebrew", "emulator", "utility"];

  return (
    <div className="browse-filters">
      <div className="browse-filters__toolbar">
        <label className="browse-search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            maxLength={120}
            value={query}
            onChange={(event) => onChange("q", event.target.value)}
            placeholder={messages.catalog.searchPlaceholder}
            aria-label={messages.catalog.search}
          />
        </label>
        <button className={`filter-pill${open ? " filter-pill--active" : ""}`} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="browse-filter-panel" data-gamepad-filters>
          <span aria-hidden="true">△</span>{messages.filters.title}
        </button>
        <label className="sort-pill">
          <span>{messages.filters.sort}</span>
          <select value={sort} onChange={(event) => onChange("sort", event.target.value)} aria-label={messages.filters.sort}>
            {SORTS.map((sortKey) => (
              <option value={sortKey} key={sortKey}>
                {messages.filters[`sort${sortKey[0].toUpperCase()}${sortKey.slice(1)}` as "sortTitle" | "sortSize" | "sortUpdated" | "sortRating"]}
              </option>
            ))}
          </select>
          <span aria-hidden="true">⌄</span>
        </label>
        {query || type || category || format ? (
          <button className="filter-clear" type="button" onClick={onClear}>{messages.filters.clear}</button>
        ) : null}
      </div>

      {open ? (
        <div className="filter-panel" id="browse-filter-panel">
          <label className="filter-field">
            <span>{messages.filters.type}</span>
            <select value={type} onChange={(event) => onChange("type", event.target.value)}>
              <option value="">{messages.filters.all}</option>
              {types.map((itemType) => <option value={itemType} key={itemType}>{messages.filters[itemType]}</option>)}
            </select>
          </label>

          <label className="filter-field">
            <span>{messages.filters.category}</span>
            <select value={category} onChange={(event) => onChange("category", event.target.value)}>
              <option value="">{messages.filters.all}</option>
              {facets?.categories.map((item) => <option value={item.id} key={item.id}>{item.label[locale]}</option>)}
            </select>
          </label>

          <label className="filter-field">
            <span>{messages.filters.format}</span>
            <select value={format} onChange={(event) => onChange("format", event.target.value)}>
              <option value="">{messages.filters.all}</option>
              {facets?.formats.map((item) => (
                <option value={item.extension} key={item.extension}>
                  {item.extension.toUpperCase()} · {item.label}
                </option>
              ))}
            </select>
          </label>
          <button className="filter-clear filter-clear--panel" type="button" onClick={onClear}>{messages.filters.clear}</button>
        </div>
      ) : null}
    </div>
  );
}
