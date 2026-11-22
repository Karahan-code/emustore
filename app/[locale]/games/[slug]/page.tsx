import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CollectionToggle } from "@/components/catalog/collection-toggle";
import { DownloadSourcePanel } from "@/components/catalog/download-source-panel";
import { getDisplayScore, MetacriticBadge } from "@/components/catalog/metacritic-badge";
import { ScreenshotGallery } from "@/components/catalog/screenshot-gallery";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import { isPlatformCatalogId, PLATFORM_CATALOG_IDS, PLATFORM_CATALOGS } from "@/lib/catalog/platforms";
import { formatFileSize } from "@/lib/catalog/format";
import { getCatalogItem, getCatalogItems } from "@/lib/catalog/repository";
import { isLocale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type GameDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function GameDetailPage(props: GameDetailPageProps) {
  return (
    <Suspense fallback={<main className="detail-page" aria-busy="true"><div className="status-panel" aria-hidden="true"><span className="status-dot" /></div></main>}>
      <GameDetailContent {...props} />
    </Suspense>
  );
}

async function GameDetailContent({ params, searchParams }: GameDetailPageProps) {
  const [{ locale: localeParam, slug }, query] = await Promise.all([params, searchParams]);
  const platformParam = getSingleParam(query.platform);
  if (!isLocale(localeParam) || !isPlatformCatalogId(platformParam)) notFound();

  const item = getCatalogItem(platformParam, slug);
  if (!item) notFound();

  const locale = localeParam;
  const messages = getMessages(locale);
  const platform = PLATFORM_CATALOGS[item.catalogId];
  const displayScore = getDisplayScore(item);
  const parsedRelease = item.releasedAt ? Date.parse(item.releasedAt) : Number.NaN;
  const releaseLabel = !Number.isNaN(parsedRelease)
    ? new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(parsedRelease))
    : /^\d{4}$/.test(item.version)
      ? item.version
      : null;
  const backParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const singleValue = getSingleParam(value);
    if (singleValue) backParams.set(key, singleValue);
  }
  backParams.set("platform", item.catalogId);
  const backHref = `/${locale}?${backParams.toString()}`;
  const reportParams = new URLSearchParams({ platform: item.catalogId, itemSlug: item.slug });
  const similarItems = PLATFORM_CATALOG_IDS
    .flatMap((catalogId) => getCatalogItems(catalogId))
    .filter((candidate) => candidate.slug !== item.slug)
    .sort((left, right) => {
      const rank = (candidate: typeof item) => candidate.categoryId === item.categoryId
        ? 0
        : candidate.catalogId === item.catalogId
          ? 1
          : 2;
      return rank(left) - rank(right) || left.title[locale].localeCompare(right.title[locale], locale);
    })
    .slice(0, 8);

  return (
    <main className="detail-page">
      <div className="detail-page__topline">
        <Link className="back-link" href={backHref} data-gamepad-back>
          <span aria-hidden="true">←</span>
          {messages.details.backToCatalog.replace("{platform}", platform.shortLabel)}
        </Link>
        <span className="detail-page__platform-code">{item.catalogId.toUpperCase()} / {item.type.toUpperCase()}</span>
      </div>

      <section className="detail-hero">
        <div className="detail-hero__art-column">
          <ArtworkImage
            src={item.coverPath}
            alt={item.title[locale]}
            title={item.title[locale]}
            className="detail-cover"
            sizes="(max-width: 800px) 72vw, 32vw"
            eager
          />
          {item.sampleData ? <span className="sample-badge">{messages.details.sampleData}</span> : null}
        </div>

        <div className="detail-hero__copy">
          <p className="eyebrow"><span className="status-dot" />{platform.label}</p>
          <h1>{item.title[locale]}</h1>
          <p className="detail-hero__description">{item.description[locale]}</p>
          <div className="detail-hero__meta">
            <MetacriticBadge
              score={displayScore}
              label={messages.catalog.metacritic}
              showLabel
            />
            {item.rating !== undefined ? (
              <span
                className="detail-hero__pill"
                aria-label={`${messages.details.userRating} ${item.rating.toFixed(1)}`}
              >
                <span className="detail-hero__star" aria-hidden="true">★</span>
                {item.rating.toFixed(1)}
              </span>
            ) : null}
            {releaseLabel ? (
              <span className="detail-hero__pill">{releaseLabel}</span>
            ) : null}
            <span className="detail-hero__pill">
              {item.fileExtension.toUpperCase()} · {formatFileSize(item.sizeBytes, locale)}
            </span>
          </div>
          <div className="detail-hero__actions">
            <DownloadSourcePanel item={item} locale={locale} messages={messages} />
            <CollectionToggle item={item} kind="favorite" locale={locale} messages={messages} />
          </div>
          <div className="detail-facts" aria-label={messages.details.title}>
            <div><span>{messages.details.category}</span><strong>{item.category[locale]}</strong></div>
            <div><span>{messages.details.developer}</span><strong>{item.developer}</strong></div>
            <div><span>{messages.details.version}</span><strong>{item.version}</strong></div>
            <div>
              <span>{messages.details.fileSize}</span>
              <strong>{formatFileSize(item.sizeBytes, locale)}{item.sizeBytesEstimated ? ` · ${messages.details.estimatedSize}` : ""}</strong>
            </div>
            <div><span>{messages.details.format}</span><strong>{item.fileFormat} ({item.fileExtension})</strong></div>
          </div>
          <div className="source-attribution">
            <span>{messages.details.sourceAttribution}</span>
            <strong>{item.developer}</strong>
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              {messages.details.source}<span aria-hidden="true"> ↗</span>
            </a>
            <Link href={`/${locale}/report?${reportParams.toString()}`}>
              {messages.details.reportItem}
            </Link>
          </div>
        </div>
      </section>

      <section className="detail-gallery-section" aria-labelledby="screenshots-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{platform.shortLabel}</p>
            <h2 id="screenshots-heading">{messages.details.screenshots}</h2>
          </div>
          <span className="result-count">{String(item.screenshots.length).padStart(2, "0")}</span>
        </div>
        <ScreenshotGallery
          screenshots={item.screenshots}
          title={item.title[locale]}
          locale={locale}
          messages={messages}
        />
      </section>

      {similarItems.length > 0 ? (
        <section className="similar-games" aria-labelledby="similar-games-heading">
          <div className="similar-games__heading">
            <h2 id="similar-games-heading">{messages.catalog.similarGames}</h2>
            <span className="result-count">{String(similarItems.length).padStart(2, "0")}</span>
          </div>
          <div className="similar-games__items">
            {similarItems.map((similarItem) => (
              <Link
                className="similar-game"
                href={"/" + locale + "/games/" + similarItem.slug + "?platform=" + similarItem.catalogId}
                key={similarItem.catalogId + ":" + similarItem.slug}
              >
                <ArtworkImage
                  src={similarItem.coverPath}
                  alt={similarItem.title[locale]}
                  title={similarItem.title[locale]}
                  className="similar-game__art"
                  sizes="180px"
                  monogramOnly
                />
                <span className="similar-game__meta">{PLATFORM_CATALOGS[similarItem.catalogId].shortLabel} · {similarItem.category[locale]}</span>
                <strong>{similarItem.title[locale]}</strong>
                <span className="similar-game__footer">
                  <span>{formatFileSize(similarItem.sizeBytes, locale)}</span>
                  <MetacriticBadge
                    score={getDisplayScore(similarItem)}
                    label={messages.catalog.metacritic}
                    size="sm"
                  />
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
