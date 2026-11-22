"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type SectionLinksProps = { locale: Locale; messages: Messages };

export function SectionLinks({ locale, messages }: SectionLinksProps) {
  const pathname = usePathname();
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set("view", "discover");
  if (!params.has("platform")) params.set("platform", "ps1");
  for (const key of ["q", "type", "category", "format", "sort", "offset", "itemSlug"]) params.delete(key);
  const active = normalizedPath === `/${locale}` && searchParams.get("view") !== "browse";
  const browseParams = new URLSearchParams(searchParams.toString());
  browseParams.set("view", "browse");
  if (!browseParams.has("platform")) browseParams.set("platform", "ps1");
  browseParams.delete("itemSlug");
  const browseActive = normalizedPath === `/${locale}` && searchParams.get("view") === "browse";

  const favoritesActive = normalizedPath === "/" + locale + "/favorites";
  const downloadsActive = normalizedPath === "/" + locale + "/downloads";

  return (
    <nav className="topbar-sections" aria-label={messages.navigation.primaryNavigation}>
      <span className="section-hint" aria-hidden="true">L1</span>
      <Link className={`topbar-section${active ? " topbar-section--active" : ""}`} href={`/${locale}?${params.toString()}`} aria-current={active ? "page" : undefined}>
        {messages.navigation.discover}
      </Link>
      <Link className={`topbar-section${browseActive ? " topbar-section--active" : ""}`} href={`/${locale}?${browseParams.toString()}`} aria-current={browseActive ? "page" : undefined}>
        {messages.navigation.browse}
      </Link>
      <Link className={"topbar-section" + (favoritesActive ? " topbar-section--active" : "")} href={"/" + locale + "/favorites"} aria-current={favoritesActive ? "page" : undefined}>
        {messages.navigation.favorites}
      </Link>
      <Link className={"topbar-section" + (downloadsActive ? " topbar-section--active" : "")} href={"/" + locale + "/downloads"} aria-current={downloadsActive ? "page" : undefined}>
        {messages.navigation.downloads}
      </Link>
      <span className="section-hint" aria-hidden="true">R1</span>
    </nav>
  );
}
