"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PlatformCatalogId } from "@/lib/catalog/platforms";
import type { Locale } from "@/lib/catalog/types";

type GameBackLinkProps = {
  locale: Locale;
  catalogId: PlatformCatalogId;
  label: string;
};

export function GameBackLink({ locale, catalogId, label }: GameBackLinkProps) {
  const searchParams = useSearchParams();
  const backParams = new URLSearchParams(searchParams.toString());
  backParams.set("platform", catalogId);

  return (
    <Link className="back-link" href={`/${locale}/?${backParams.toString()}`} data-gamepad-back>
      <span aria-hidden="true">←</span>
      {label}
    </Link>
  );
}
