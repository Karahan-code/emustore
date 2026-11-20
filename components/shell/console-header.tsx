import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { PlatformSwitcher } from "@/components/shell/platform-switcher";

type ConsoleHeaderProps = {
  locale: Locale;
  messages: Messages;
};

export function ConsoleHeader({ locale, messages }: ConsoleHeaderProps) {
  return (
    <header className="console-header">
      <div className="console-header__top">
        <Link className="brand-lockup" href={`/${locale}`} aria-label={messages.navigation.brand}>
          <span className="brand-lockup__mark" aria-hidden="true">E</span>
          <span className="brand-lockup__copy">
            <strong>{messages.navigation.brand}</strong>
            <small>{messages.navigation.tagline}</small>
          </span>
        </Link>
        <Suspense fallback={<span className="locale-switcher locale-switcher--loading">EN / TR</span>}>
          <LocaleSwitcher locale={locale} messages={messages} />
        </Suspense>
      </div>
      <div className="console-header__catalogs">
        <div className="console-header__section-label">
          <span className="console-header__eyebrow">{messages.navigation.catalogs}</span>
          <span className="console-header__line" aria-hidden="true" />
        </div>
        <Suspense fallback={<div className="platform-switcher platform-switcher--loading" aria-hidden="true" />}>
          <PlatformSwitcher locale={locale} messages={messages} />
        </Suspense>
      </div>
    </header>
  );
}
