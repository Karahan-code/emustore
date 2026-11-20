import Link from "next/link";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import type { CatalogItem, Locale } from "@/lib/catalog/types";
import { formatFileSize } from "@/lib/catalog/format";
import type { Messages } from "@/lib/i18n/dictionaries";

type FeaturedSpotlightProps = {
  item: CatalogItem;
  locale: Locale;
  messages: Messages;
  searchQuery: string;
};

export function FeaturedSpotlight({ item, locale, messages, searchQuery }: FeaturedSpotlightProps) {
  const params = new URLSearchParams(searchQuery);
  params.set("platform", item.catalogId);

  return (
    <section className="spotlight" aria-labelledby="spotlight-title">
      <div className="spotlight__copy">
        <span className="eyebrow"><span className="status-dot" />{messages.catalog.featured}</span>
        <p className="spotlight__platform">{item.category[locale]} · {item.fileExtension.toUpperCase()}</p>
        <h2 id="spotlight-title">{item.title[locale]}</h2>
        <p className="spotlight__description">{item.description[locale]}</p>
        <div className="spotlight__metadata">
          <span>{item.version}</span>
          <span>{formatFileSize(item.sizeBytes, locale)}</span>
        </div>
        <Link className="button button--primary" href={`/${locale}/games/${item.slug}?${params.toString()}`}>
          {messages.catalog.viewDetails}<span aria-hidden="true"> ↗</span>
        </Link>
      </div>
      <div className="spotlight__artwork-wrap">
        <ArtworkImage
          src={item.coverPath}
          alt={item.title[locale]}
          title={item.title[locale]}
          className="spotlight__artwork"
          sizes="(max-width: 800px) 70vw, 38vw"
          priority
        />
        <span className="spotlight__artwork-label">{item.catalogId.toUpperCase()}</span>
      </div>
    </section>
  );
}
