"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isPlatformCatalogId } from "@/lib/catalog/platforms";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";
import { SEARCH_OPEN_EVENT, SEARCH_TOGGLE_EVENT } from "@/lib/input/events";

type SearchDialogProps = { locale: Locale; messages: Messages };

export function SearchDialog({ locale, messages }: SearchDialogProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchText = searchParams.get("q") ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(searchText);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setQuery(searchText), [searchText]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isOpen]);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const toggleSearch = useCallback(() => setIsOpen((current) => !current), []);

  useEffect(() => {
    window.addEventListener(SEARCH_OPEN_EVENT, openSearch);
    window.addEventListener(SEARCH_TOGGLE_EVENT, toggleSearch);
    return () => {
      window.removeEventListener(SEARCH_OPEN_EVENT, openSearch);
      window.removeEventListener(SEARCH_TOGGLE_EVENT, toggleSearch);
    };
  }, [openSearch, toggleSearch]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "browse");
    if (isPlatformCatalogId(params.get("platform")) || params.get("platform") === "all") {
      // Keep the selected platform.
    } else {
      params.set("platform", "ps1");
    }
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");
    params.delete("itemSlug");
    router.push(`/${locale}?${params.toString()}`);
    setIsOpen(false);
  }

  return (
    <>
      {isOpen ? (
        <div className="search-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
          <section className="search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
            <div className="search-dialog__heading">
              <h2 id="global-search-title">{messages.catalog.search}</h2>
              <button className="icon-button search-dialog__close" type="button" onClick={() => setIsOpen(false)} data-gamepad-close aria-label={messages.filters.clear}>×</button>
            </div>
            <form className="search-dialog__form" onSubmit={submitSearch}>
              <label htmlFor="global-search-input">{messages.catalog.search}</label>
              <input
                ref={inputRef}
                id="global-search-input"
                type="search"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                maxLength={120}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={messages.catalog.searchPlaceholder}
              />
              <button className="button button--primary" type="submit">{messages.catalog.browseLibrary}</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
