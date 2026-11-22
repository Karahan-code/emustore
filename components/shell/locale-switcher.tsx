"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type LocaleSwitcherProps = {
  locale: Locale;
  messages: Messages;
};

export function LocaleSwitcher({ locale, messages }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nextLocale: Locale = locale === "en" ? "tr" : "en";
  const localizedPath = pathname.replace(/^\/(en|tr)(?=\/|$)/, `/${nextLocale}`);
  const query = searchParams.toString();
  const href = query ? `${localizedPath}?${query}` : localizedPath;

  function handleLocaleClick() {
    try {
      window.localStorage.setItem("emustore:locale", nextLocale);
    } catch {
      // Ignore storage quota or privacy-mode failures.
    }
  }

  return (
    <Link
      className="locale-switcher"
      href={href}
      lang={nextLocale}
      aria-label={messages.navigation.switchLanguage}
      title={messages.navigation.switchLanguage}
      onClick={handleLocaleClick}
    >
      <span className={locale === "en" ? "locale-switcher__active" : ""}>EN</span>
      <span className="locale-switcher__divider" aria-hidden="true">/</span>
      <span className={locale === "tr" ? "locale-switcher__active" : ""}>TR</span>
    </Link>
  );
}
