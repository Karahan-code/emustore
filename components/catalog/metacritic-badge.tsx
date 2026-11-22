import type { CatalogItem } from "@/lib/catalog/types";

export function getDisplayScore(
  item: Pick<CatalogItem, "metacritic" | "ratingScore">,
): number | undefined {
  return item.metacritic ?? item.ratingScore;
}

type MetacriticBadgeProps = {
  score?: number;
  label?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
};

export function MetacriticBadge({
  score,
  label = "Metacritic",
  showLabel = false,
  size = "md",
}: MetacriticBadgeProps) {
  if (score === undefined) return null;

  const rounded = Math.round(score);

  return (
    <span
      className={`metacritic-badge${size === "sm" ? " metacritic-badge--sm" : ""}`}
      aria-label={`${label} ${rounded}`}
    >
      <span className="metacritic-badge__value">{rounded}</span>
      {showLabel ? <span className="metacritic-badge__label">{label}</span> : null}
    </span>
  );
}
