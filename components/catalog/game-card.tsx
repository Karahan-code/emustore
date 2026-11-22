import Link from "next/link";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import { CollectionToggle } from "@/components/catalog/collection-toggle";
import { getDisplayScore, MetacriticBadge } from "@/components/catalog/metacritic-badge";
import { formatFileSize } from "@/lib/catalog/format";
import type { CatalogItem, Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type GameCardProps = {
  item: CatalogItem;
  locale: Locale;
  messages: Messages;
  searchQuery: string;
};

export function GameCard({ item, locale, messages, searchQuery }: GameCardProps) {
  const params = new URLSearchParams(searchQuery);
  params.set("platform", item.catalogId);
  const displayScore = getDisplayScore(item);
  const sourceCount = item.sources.length;

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
            <span className="game-card__ext">{item.fileExtension.toUpperCase()}</span>
          </div>
          <h3>{item.title[locale]}</h3>
          <div className="game-card__footer">
            <span className="game-card__size-group">
              <span>{formatFileSize(item.sizeBytes, locale)}</span>
              {sourceCount > 0 ? (
                <span
                  className="game-card__ready-badge"
                  title={
                    sourceCount > 1
                      ? messages.catalog.mirrorCount.replace("{count}", String(sourceCount))
                      : messages.catalog.downloadableBadge
                  }
                >
                  <span className="game-card__ready-dot" aria-hidden="true" />
                  {sourceCount > 1
                    ? `${messages.catalog.downloadableBadge} · ${sourceCount}`
                    : messages.catalog.downloadableBadge}
                </span>
              ) : null}
            </span>
            <MetacriticBadge
              score={displayScore}
              label={messages.catalog.metacritic}
              size="sm"
            />
          </div>
        </div>
      </Link>
      <CollectionToggle item={item} kind="favorite" locale={locale} messages={messages} compact />
    </article>
  );
}
