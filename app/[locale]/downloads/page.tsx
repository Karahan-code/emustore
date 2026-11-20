import { notFound } from "next/navigation";
import { SavedItemsView } from "@/components/catalog/saved-items-view";
import { isLocale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type DownloadsPageProps = { params: Promise<{ locale: string }> };

export default async function DownloadsPage({ params }: DownloadsPageProps) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  return <SavedItemsView kind="queue" locale={localeParam} messages={getMessages(localeParam)} />;
}
