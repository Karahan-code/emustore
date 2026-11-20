"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PLATFORM_CATALOG_IDS, isPlatformCatalogId } from "@/lib/catalog/platforms";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type BrowsePlatformMenuProps = { locale: Locale; messages: Messages };

export function BrowsePlatformMenu({ locale, messages }: BrowsePlatformMenuProps) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const active = searchParams.get("view") === "browse";
  const selectedPlatform = isPlatformCatalogId(searchParams.get("platform"))
    ? searchParams.get("platform")
    : "ps1";

  return (
    <div className="browse-platform-menu">
      <button className={`topbar-section browse-platform-menu__trigger${active ? " topbar-section--active" : ""}`} type="button" aria-expanded={open} aria-haspopup="menu" data-gamepad-close={open ? "true" : undefined} onClick={() => setOpen((value) => !value)}>
        {messages.navigation.browse}<span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="browse-platform-menu__popover" role="menu" aria-label={messages.navigation.catalogs}>
          {PLATFORM_CATALOG_IDS.map((platform) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("platform", platform);
            params.set("view", "browse");
            params.delete("category");
            params.delete("format");
            params.delete("offset");
            params.delete("itemSlug");
            return (
              <Link
                className={`browse-platform-menu__item${selectedPlatform === platform ? " browse-platform-menu__item--active" : ""}`}
                href={`/${locale}?${params.toString()}`}
                key={platform}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span>{messages.navigation[platform]}</span>
                <span aria-hidden="true">{selectedPlatform === platform ? "✓" : ""}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
