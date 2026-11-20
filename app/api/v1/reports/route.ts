import { randomUUID } from "node:crypto";
import { apiError, apiJson } from "@/lib/api/responses";
import { isPlatformCatalogId, type PlatformCatalogId } from "@/lib/catalog/platforms";
import { isLocale } from "@/lib/catalog/types";

const MAX_BODY_BYTES = 32 * 1024;
const REPORT_CATEGORIES = [
  "bug",
  "compatibility",
  "installation",
  "content",
  "other",
] as const;
const ALLOWED_REPORT_FIELDS = new Set([
  "category",
  "message",
  "locale",
  "platform",
  "steps",
  "itemSlug",
  "route",
  "clientVersion",
  "contactEmail",
]);

type ReportCategory = (typeof REPORT_CATEGORIES)[number];

type ErrorReport = {
  category: ReportCategory;
  message: string;
  locale: "en" | "tr";
  platform?: PlatformCatalogId;
  steps?: string;
  itemSlug?: string;
  route?: string;
  clientVersion?: string;
  contactEmail?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): boolean {
  const value = record[key];
  return value === undefined || (typeof value === "string" && value.length <= maxLength);
}

function parseReport(value: unknown): ErrorReport | undefined {
  if (!isRecord(value)) return undefined;
  if (Object.keys(value).some((key) => !ALLOWED_REPORT_FIELDS.has(key))) return undefined;

  const { category, message, locale, platform, steps, itemSlug, route, clientVersion, contactEmail } = value;
  if (
    typeof category !== "string" ||
    !REPORT_CATEGORIES.some((validCategory) => validCategory === category) ||
    typeof message !== "string" ||
    message.trim().length < 5 ||
    message.length > 4_000 ||
    !isLocale(locale) ||
    (platform !== undefined && !isPlatformCatalogId(platform)) ||
    !optionalString(value, "steps", 4_000) ||
    !optionalString(value, "itemSlug", 120) ||
    !optionalString(value, "route", 500) ||
    !optionalString(value, "clientVersion", 80) ||
    !optionalString(value, "contactEmail", 254)
  ) {
    return undefined;
  }

  if (typeof itemSlug === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(itemSlug)) {
    return undefined;
  }
  if (typeof route === "string" && !route.startsWith("/")) return undefined;
  if (
    typeof contactEmail === "string" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
  ) {
    return undefined;
  }

  return {
    category: category as ReportCategory,
    message: message.trim(),
    locale,
    ...(isPlatformCatalogId(platform) ? { platform } : {}),
    ...(typeof steps === "string" ? { steps: steps.trim() } : {}),
    ...(typeof itemSlug === "string" ? { itemSlug } : {}),
    ...(typeof route === "string" ? { route } : {}),
    ...(typeof clientVersion === "string" ? { clientVersion } : {}),
    ...(typeof contactEmail === "string" ? { contactEmail } : {}),
  };
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return apiError("BAD_REQUEST", "Content-Type must be application/json.", 400);
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return apiError("BAD_REQUEST", "The report body could not be read.", 400);
  }

  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return apiError("BAD_REQUEST", "The report body exceeds the 32 KB limit.", 400);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return apiError("BAD_REQUEST", "The report body must contain valid JSON.", 400);
  }

  const report = parseReport(parsedBody);
  if (!report) {
    return apiError("BAD_REQUEST", "The report payload is invalid.", 400);
  }

  const webhookUrl = process.env.EMUSTORE_REPORT_WEBHOOK_URL;
  if (!webhookUrl) {
    return apiError(
      "REPORTING_UNAVAILABLE",
      "Report delivery is not configured on this server.",
      503,
    );
  }

  let destination: URL;
  try {
    destination = new URL(webhookUrl);
  } catch {
    return apiError(
      "REPORTING_UNAVAILABLE",
      "The configured report destination is invalid.",
      503,
    );
  }

  if (destination.protocol !== "https:" && destination.hostname !== "localhost") {
    return apiError(
      "REPORTING_UNAVAILABLE",
      "The configured report destination must use HTTPS.",
      503,
    );
  }

  const reportId = randomUUID();
  try {
    const delivery = await fetch(destination, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, receivedAt: new Date().toISOString(), report }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!delivery.ok) {
      return apiError("REPORT_DELIVERY_FAILED", "The report destination rejected the report.", 502);
    }
  } catch {
    return apiError("REPORT_DELIVERY_FAILED", "The report destination could not be reached.", 502);
  }

  return apiJson({ data: { accepted: true, reportId } }, 202);
}
