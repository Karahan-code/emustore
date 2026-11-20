"use client";

import type { CatalogFacets, CatalogItemType, Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type FilterKey = "type" | "category" | "format" | "sort";

type CatalogFilterBarProps = {
  facets: CatalogFacets | null;
  locale: Locale;
  messages: Messages;
  type: CatalogItemType | "";
  category: string;
  format: string;
  sort: "title" | "size" | "updated";
  onChange: (key: FilterKey, value: string) => void;
  onClear: () => void;
};

const SORTS = ["title", "size", "updated"] as const;

export function CatalogFilterBar({
  facets,
  locale,
  messages,
  type,
  category,
  format,
  sort,
  onChange,
  onClear,
}: CatalogFilterBarProps) {
  const types = facets?.types ?? ["game", "homebrew", "emulator", "utility"];

  return (
    <div className="filter-bar" aria-label={messages.filters.title}>
      <label className="filter-field">
        <span>{messages.filters.type}</span>
        <select value={type} onChange={(event) => onChange("type", event.target.value)}>
          <option value="">{messages.filters.all}</option>
          {types.map((itemType) => (
            <option value={itemType} key={itemType}>
              {messages.filters[itemType]}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>{messages.filters.category}</span>
        <select value={category} onChange={(event) => onChange("category", event.target.value)}>
          <option value="">{messages.filters.all}</option>
          {facets?.categories.map((item) => (
            <option value={item.id} key={item.id}>
              {item.label[locale]}
            </option>
          ))}
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

      <label className="filter-field filter-field--sort">
        <span>{messages.filters.sort}</span>
        <select value={sort} onChange={(event) => onChange("sort", event.target.value)}>
          {SORTS.map((sortKey) => (
            <option value={sortKey} key={sortKey}>
              {messages.filters[`sort${sortKey[0].toUpperCase()}${sortKey.slice(1)}` as "sortTitle" | "sortSize" | "sortUpdated"]}
            </option>
          ))}
        </select>
      </label>

      <button className="text-action filter-bar__clear" type="button" onClick={onClear}>
        {messages.filters.clear}
      </button>
    </div>
  );
}
