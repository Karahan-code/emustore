import Link from "next/link";
import { notFound } from "next/navigation";
import { ScreenshotGallery } from "@/components/catalog/screenshot-gallery";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import { isPlatformCatalogId, PLATFORM_CATALOGS } from "@/lib/catalog/platforms";
import { formatFileSize } from "@/lib/catalog/format";
import { getCatalogItem } from "@/lib/catalog/repository";
import { isLocale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type GameDetailPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GameDetailPage({ params, searchParams }: GameDetailPageProps) {
  const [{ locale: localeParam, slug }, query] = await Promise.all([params, searchParams]);
  const platformParam = getSingleParam(query.platform);
  if (!isLocale(localeParam) || !isPlatformCatalogId(platformParam)) notFound();

  const item = getCatalogItem(platformParam, slug);
  if (!item) notFound();

  const locale = localeParam;
  const messages = getMessages(locale);
  const platform = PLATFORM_CATALOGS[item.catalogId];
  const backParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const singleValue = getSingleParam(value);
    if (singleValue) backParams.set(key, singleValue);
  }
  backParams.set("platform", item.catalogId);
  const backHref = `/${locale}?${backParams.toString()}`;

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
            priority
          />
          {item.sampleData ? <span className="sample-badge">{messages.details.sampleData}</span> : null}
        </div>

        <div className="detail-hero__copy">
          <p className="eyebrow"><span className="status-dot" />{platform.label}</p>
          <h1>{item.title[locale]}</h1>
          <p className="detail-hero__description">{item.description[locale]}</p>
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
    </main>
  );
}
