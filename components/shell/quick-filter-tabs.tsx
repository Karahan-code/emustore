"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type QuickFilterTabsProps = { locale: Locale; messages: Messages };

export function QuickFilterTabs({ locale, messages }: QuickFilterTabsProps) {
  const searchParams = useSearchParams();
  const tabs = [
    { label: messages.navigation.topRated, sort: "rating" },
    { label: messages.navigation.newReleases, sort: "updated" },
  ] as const;

  return (
    <nav className="quick-filter-tabs" aria-label={messages.filters.sort}>
      {tabs.map((tab) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("view", "browse");
        params.set("sort", tab.sort);
        if (!params.has("platform")) params.set("platform", "ps1");
        params.delete("offset");
        params.delete("itemSlug");
        const active = searchParams.get("sort") === tab.sort;
        return (
          <Link className={`quick-filter-tab${active ? " quick-filter-tab--active" : ""}`} href={`/${locale}?${params.toString()}`} key={tab.sort} aria-current={active ? "page" : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
