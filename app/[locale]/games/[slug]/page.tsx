import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GameDetailView } from "@/components/catalog/game-detail-view";
import { PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
import { findCatalogItemBySlug, getCatalogItems } from "@/lib/catalog/repository";
import { isLocale, LOCALES, type Locale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type GameDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams(): Array<{ locale: Locale; slug: string }> {
  return LOCALES.flatMap((locale) =>
    PLATFORM_CATALOG_IDS.flatMap((platform) =>
      getCatalogItems(platform).map((item) => ({
        locale,
        slug: item.slug,
      })),
    ),
  );
}

export default function GameDetailPage(props: GameDetailPageProps) {
  return (
    <Suspense fallback={<main className="detail-page" aria-busy="true"><div className="status-panel" aria-hidden="true"><span className="status-dot" /></div></main>}>
      <GameDetailContent {...props} />
    </Suspense>
  );
}

async function GameDetailContent({ params }: GameDetailPageProps) {
  const { locale: localeParam, slug } = await params;
  if (!isLocale(localeParam)) notFound();

  const item = findCatalogItemBySlug(slug);
  if (!item) notFound();

  const messages = getMessages(localeParam);
  return <GameDetailView initialItem={item} locale={localeParam} messages={messages} />;
}
