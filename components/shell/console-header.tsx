import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { SectionLinks } from "@/components/shell/section-links";
import { ActiveRouteIconLink } from "@/components/shell/active-route-icon-link";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";
import { APP_VERSION } from "@/lib/app-info";

type ConsoleHeaderProps = { locale: Locale; messages: Messages };

export function ConsoleHeader({ locale, messages }: ConsoleHeaderProps) {
  const discoverHref = `/${locale}?view=discover&platform=ps1`;

  return (
    <header className="console-header">
      <div className="console-topbar">
        <Suspense fallback={<nav className="topbar-sections"><span className="section-hint">L1</span></nav>}>
          <SectionLinks locale={locale} messages={messages} />
        </Suspense>

        <Link className="console-brand" href={discoverHref} aria-label={`${messages.navigation.brand} v${APP_VERSION}`}>
          <Image src="/icon.png" alt="" width={27} height={27} priority />
          <span>{messages.navigation.brand}</span>
          <small>v{APP_VERSION}</small>
        </Link>

        <Suspense fallback={<nav className="topbar-actions" aria-label={messages.navigation.utilities} />}>
          <nav className="topbar-actions" aria-label={messages.navigation.utilities}>
            <ActiveRouteIconLink locale={locale} route="settings" label={messages.navigation.settings} icon="⚙" />
            <ActiveRouteIconLink locale={locale} route="report" label={messages.navigation.report} icon="!" />
            <Suspense fallback={<span className="locale-switcher locale-switcher--loading">EN/TR</span>}>
              <LocaleSwitcher locale={locale} messages={messages} />
            </Suspense>
          </nav>
        </Suspense>
      </div>
    </header>
  );
}
