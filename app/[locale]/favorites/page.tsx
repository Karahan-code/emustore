import { notFound } from "next/navigation";
import { SavedItemsView } from "@/components/catalog/saved-items-view";
import { isLocale, LOCALES, type Locale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type FavoritesPageProps = { params: Promise<{ locale: string }> };

export function generateStaticParams(): Array<{ locale: Locale }> {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function FavoritesPage({ params }: FavoritesPageProps) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  return <SavedItemsView kind="favorites" locale={localeParam} messages={getMessages(localeParam)} />;
}
