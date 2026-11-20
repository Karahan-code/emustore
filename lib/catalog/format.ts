import type { Locale } from "@/lib/catalog/types";

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatFileSize(sizeBytes: number, locale: Locale): string {
  if (sizeBytes === 0) return "0 B";

  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
  const formattedValue = new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
    maximumFractionDigits: digits,
  }).format(value);

  return `${formattedValue} ${SIZE_UNITS[unitIndex]}`;
}
