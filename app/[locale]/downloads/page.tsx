import { notFound } from "next/navigation";
import { DownloadsPanel } from "@/components/downloads/downloads-panel";
import { isLocale, LOCALES, type Locale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type DownloadsPageProps = { params: Promise<{ locale: string }> };

export function generateStaticParams(): Array<{ locale: Locale }> {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function DownloadsPage({ params }: DownloadsPageProps) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  return <DownloadsPanel locale={localeParam} messages={getMessages(localeParam)} />;
}
