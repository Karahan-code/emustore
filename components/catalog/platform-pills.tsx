import Link from "next/link";
import { PLATFORM_CATALOG_IDS, isPlatformCatalogId, isPlatformExtension } from "@/lib/catalog/platforms";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type PlatformPillsProps = {
  locale: Locale;
  messages: Messages;
  selectedPlatform: string;
  searchQuery: string;
};

export function PlatformPills({ locale, messages, selectedPlatform, searchQuery }: PlatformPillsProps) {
  const platforms = ["all", ...PLATFORM_CATALOG_IDS] as const;

  return (
    <nav className="platform-pills" aria-label={messages.filters.platform}>
      {platforms.map((platform) => {
        const params = new URLSearchParams(searchQuery);
        params.set("platform", platform);
        params.set("view", "browse");
        params.delete("itemSlug");

        const format = params.get("format");
        if (format && platform !== "all" && isPlatformCatalogId(platform) && !isPlatformExtension(platform, format)) {
          params.delete("format");
        }

        const label = platform === "all" ? messages.filters.all : messages.navigation[platform];
        const active = selectedPlatform === platform;

        return (
          <Link
            className={`platform-pill${active ? " platform-pill--active" : ""}`}
            href={`/${locale}?${params.toString()}`}
            key={platform}
            aria-current={active ? "page" : undefined}
            data-gamepad-item
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
