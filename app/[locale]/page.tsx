import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { isLocale, LOCALES, type Locale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type CatalogPageProps = { params: Promise<{ locale: string }> };

export function generateStaticParams(): Array<{ locale: Locale }> {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function CatalogPage({ params }: CatalogPageProps) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  const messages = getMessages(localeParam);
  return (
    <Suspense fallback={<main className="catalog-page"><div className="status-panel">{messages.catalog.loading}</div></main>}>
      <CatalogBrowser locale={localeParam} />
    </Suspense>
  );
}
