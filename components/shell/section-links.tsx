"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type SectionLinksProps = { locale: Locale; messages: Messages };

export function SectionLinks({ locale, messages }: SectionLinksProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set("view", "discover");
  if (!params.has("platform")) params.set("platform", "ps1");
  for (const key of ["q", "type", "category", "format", "sort", "offset", "itemSlug"]) params.delete(key);
  const active = pathname === `/${locale}` && searchParams.get("view") !== "browse";
  const browseParams = new URLSearchParams(searchParams.toString());
  browseParams.set("view", "browse");
  if (!browseParams.has("platform")) browseParams.set("platform", "ps1");
  browseParams.delete("itemSlug");
  const browseActive = pathname === `/${locale}` && searchParams.get("view") === "browse";

  return (
    <nav className="topbar-sections" aria-label={messages.navigation.discover}>
      <span className="section-hint" aria-hidden="true">L1</span>
      <Link className={`topbar-section${active ? " topbar-section--active" : ""}`} href={`/${locale}?${params.toString()}`} aria-current={active ? "page" : undefined}>
        {messages.navigation.discover}
      </Link>
      <Link className={`topbar-section${browseActive ? " topbar-section--active" : ""}`} href={`/${locale}?${browseParams.toString()}`} aria-current={browseActive ? "page" : undefined}>
        {messages.navigation.browse}
      </Link>
    </nav>
  );
}
