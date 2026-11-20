"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/catalog/types";

const SECTION_STEP_EVENT = "emustore:section-step";
const SECTIONS = ["discover", "browse", "downloads"] as const;

export function SectionNavigation({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams.toString();

  useEffect(() => {
    const stepSection = (event: Event) => {
      const delta = (event as CustomEvent<{ delta?: number }>).detail?.delta;
      if (delta !== -1 && delta !== 1) return;

      const currentSection = pathname === `/${locale}/downloads`
        ? "downloads"
        : searchParams.get("view") === "browse"
          ? "browse"
          : "discover";
      const currentIndex = SECTIONS.indexOf(currentSection);
      const nextIndex = (currentIndex + delta + SECTIONS.length) % SECTIONS.length;
      const nextSection = SECTIONS[nextIndex];

      if (nextSection === "downloads") {
        router.push(`/${locale}/downloads`);
        return;
      }

      const params = new URLSearchParams(searchString);
      params.set("view", nextSection);
      if (!params.has("platform")) params.set("platform", "ps1");
      params.delete("itemSlug");
      router.push(`/${locale}?${params.toString()}`);
    };

    window.addEventListener(SECTION_STEP_EVENT, stepSection);
    return () => window.removeEventListener(SECTION_STEP_EVENT, stepSection);
  }, [locale, pathname, router, searchParams, searchString]);

  return null;
}
