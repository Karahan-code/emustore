import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { ConsoleHeader } from "@/components/shell/console-header";
import { InputNavigation } from "@/components/shell/input-navigation";
import { PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
import { isLocale, type Locale } from "@/lib/catalog/types";
import { getMessages, interpolate } from "@/lib/i18n/dictionaries";
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
  title: "EmuStore — Console Catalogs",
  description: "Browse console homebrew and game metadata by platform.",
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
        <InputNavigation />
        <div className="app-shell">
          <ConsoleHeader locale={locale} messages={messages} />
          <div className="app-shell__content">{children}</div>
          <footer className="shell-footer">
            <p>{messages.controller.navigationHint}</p>
            <span>
              {interpolate(messages.navigation.catalogCount, {
                count: PLATFORM_CATALOG_IDS.length,
              })}
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
