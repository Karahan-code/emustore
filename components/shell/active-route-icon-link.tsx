"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/catalog/types";

type ActiveRouteIconLinkProps = {
  locale: Locale;
  route: "favorites" | "downloads" | "settings" | "report";
  label: string;
  icon: string;
};

export function ActiveRouteIconLink({ locale, route, label, icon }: ActiveRouteIconLinkProps) {
  const href = `/${locale}/${route}`;
  const normalizedPath = usePathname().replace(/\/+$/, "") || "/";
  const active = normalizedPath === href;

  return (
    <Link
      className={`topbar-icon-link${active ? " topbar-icon-link--active" : ""}`}
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      <span aria-hidden="true">{icon}</span>
      <small>{label}</small>
    </Link>
  );
}
