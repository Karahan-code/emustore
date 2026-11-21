import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { CollectionsProvider } from "@/components/shell/collections-provider";
import { ConsoleHeader } from "@/components/shell/console-header";
import { ControllerHintBar } from "@/components/shell/controller-hint-bar";
import { InputNavigation } from "@/components/shell/input-navigation";
import { SearchDialog } from "@/components/shell/search-dialog";
import { SectionNavigation } from "@/components/shell/section-navigation";
import { UiSoundEffects } from "@/components/shell/ui-sound-effects";
import { UpdateNotifier } from "@/components/shell/update-notifier";
import { isLocale, type Locale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "EmuStore",
  description: "Console game catalogs by platform.",
  icons: { icon: "/icon.png", shortcut: "/icon.png", apple: "/icon.png" },
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return [{ locale: "en" }, { locale: "tr" }];
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  const locale = localeParam;
  const messages = getMessages(locale);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-console text-console-text">
        <CollectionsProvider>
          <Suspense fallback={null}><InputNavigation /></Suspense>
          <UiSoundEffects />
          <Suspense fallback={null}><SearchDialog locale={locale} messages={messages} /></Suspense>
          <Suspense fallback={null}><SectionNavigation locale={locale} /></Suspense>
          <div className="app-shell">
            <ConsoleHeader locale={locale} messages={messages} />
            <div className="app-shell__content">{children}</div>
          </div>
          <ControllerHintBar messages={messages} />
          <UpdateNotifier locale={locale} messages={messages} />
        </CollectionsProvider>
      </body>
    </html>
  );
}
