"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type PlatformSwitcherProps = {
  locale: Locale;
  messages: Messages;
};

export function PlatformSwitcher({ locale, messages }: PlatformSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activePlatform = searchParams.get("platform") ?? "ps1";

  return (
    <nav className="platform-switcher" aria-label={messages.navigation.catalogs}>
      {PLATFORM_CATALOG_IDS.map((platformId) => {
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.set("platform", platformId);
        nextParams.delete("category");
        nextParams.delete("format");
        nextParams.delete("offset");
        const query = nextParams.toString();
        const href = `/${locale}?${query}`;
        const isActive = activePlatform === platformId;

        return (
          <Link
            key={platformId}
            className={`platform-switcher__item${isActive ? " platform-switcher__item--active" : ""}`}
            href={href}
            aria-current={isActive && pathname === `/${locale}` ? "page" : undefined}
            aria-label={messages.navigation[platformId]}
          >
            {messages.navigation[platformId]}
          </Link>
        );
      })}
    </nav>
  );
}
