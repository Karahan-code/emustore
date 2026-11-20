import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import type { Locale } from "@/lib/catalog/types";

export type Messages = typeof en;

const dictionaries: Record<Locale, Messages> = { en, tr };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}
