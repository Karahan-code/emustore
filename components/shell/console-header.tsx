import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { QuickFilterTabs } from "@/components/shell/quick-filter-tabs";
import { SearchDialog } from "@/components/shell/search-dialog";
import { SectionLinks } from "@/components/shell/section-links";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";
import { APP_VERSION } from "@/lib/app-info";

type ConsoleHeaderProps = { locale: Locale; messages: Messages };

export function ConsoleHeader({ locale, messages }: ConsoleHeaderProps) {
  const discoverHref = `/${locale}?view=discover&platform=ps1`;

  return (
    <header className="console-header">
      <div className="console-topbar">
        <Suspense fallback={<div className="search-trigger search-trigger--loading" />}>
          <SearchDialog locale={locale} messages={messages} />
        </Suspense>

        <Suspense fallback={<nav className="topbar-sections"><span className="section-hint">L1</span></nav>}>
          <SectionLinks locale={locale} messages={messages} />
        </Suspense>

        <Link className="console-brand" href={discoverHref} aria-label={`${messages.navigation.brand} v${APP_VERSION}`}>
          <Image src="/icon.png" alt="" width={27} height={27} priority />
          <span>{messages.navigation.brand}</span>
          <small>v{APP_VERSION}</small>
        </Link>

        <Suspense fallback={<nav className="quick-filter-tabs" />}>
          <QuickFilterTabs locale={locale} messages={messages} />
        </Suspense>

        <nav className="topbar-actions" aria-label={messages.navigation.brand}>
          <Link className="topbar-icon-link" href={`/${locale}/favorites`} aria-label={messages.navigation.favorites} title={messages.navigation.favorites}>
            <span aria-hidden="true">♡</span><small>{messages.navigation.favorites}</small>
          </Link>
          <Link className="topbar-icon-link" href={`/${locale}/downloads`} aria-label={messages.navigation.downloads} title={messages.navigation.downloads}>
            <span aria-hidden="true">↓</span><small>{messages.navigation.downloads}</small>
          </Link>
          <Link className="topbar-icon-link" href={`/${locale}/settings`} aria-label={messages.navigation.settings} title={messages.navigation.settings}>
            <span aria-hidden="true">⚙</span><small>{messages.navigation.settings}</small>
          </Link>
          <Link className="topbar-icon-link" href={`/${locale}/report`} aria-label={messages.navigation.report} title={messages.navigation.report}>
            <span aria-hidden="true">!</span><small>{messages.navigation.report}</small>
          </Link>
          <Suspense fallback={<span className="locale-switcher locale-switcher--loading">EN/TR</span>}>
            <LocaleSwitcher locale={locale} messages={messages} />
          </Suspense>
          <span className="section-hint section-hint--right" aria-hidden="true">R1</span>
        </nav>
      </div>
    </header>
  );
}
