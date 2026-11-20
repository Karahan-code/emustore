import Link from "next/link";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import type { CatalogItem, Locale } from "@/lib/catalog/types";
import { formatFileSize } from "@/lib/catalog/format";
import type { Messages } from "@/lib/i18n/dictionaries";
import { CollectionToggle } from "@/components/catalog/collection-toggle";

type GameCardProps = {
  item: CatalogItem;
  locale: Locale;
  messages: Messages;
  searchQuery: string;
};

export function GameCard({ item, locale, messages, searchQuery }: GameCardProps) {
  const params = new URLSearchParams(searchQuery);
  params.set("platform", item.catalogId);

  return (
    <article className="game-card" data-gamepad-item>
      <Link
        className="game-card__link"
        href={`/${locale}/games/${item.slug}?${params.toString()}`}
        aria-label={`${item.title[locale]} — ${messages.catalog.viewDetails}`}
      >
        <ArtworkImage
          src={item.coverPath}
          alt={item.title[locale]}
          title={item.title[locale]}
          className="game-card__art"
          sizes="(max-width: 680px) 82vw, (max-width: 1100px) 40vw, 16vw"
        />
        <div className="game-card__body">
          <div className="game-card__meta">
            <span className="game-card__category">{item.category[locale]}</span>
            <span>{formatFileSize(item.sizeBytes, locale)}</span>
          </div>
          <h3>{item.title[locale]}</h3>
          <div className="game-card__footer">
            <span>{item.fileExtension.toUpperCase()}</span>
            {item.ratingScore !== undefined ? (
              <span className="game-card__score" aria-label={`${messages.catalog.score} ${item.ratingScore}`}>
                {item.ratingScore}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
      <CollectionToggle item={item} kind="favorite" locale={locale} messages={messages} compact />
    </article>
  );
}
