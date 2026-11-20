import { apiError, apiJson } from "@/lib/api/responses";
import {
  isPlatformCatalogId,
  isPlatformExtension,
  PLATFORM_CATALOGS,
} from "@/lib/catalog/platforms";
import { getCatalogItems, queryCatalog } from "@/lib/catalog/repository";
import {
  isCatalogItemType,
  isLocale,
  type CatalogSort,
} from "@/lib/catalog/types";

const ALLOWED_QUERY_PARAMS = new Set([
  "platform",
  "q",
  "type",
  "category",
  "format",
  "locale",
  "limit",
  "offset",
  "sort",
]);

function parseInteger(
  value: string | null,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === null) return defaultValue;
  if (!/^\d+$/.test(value)) return undefined;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  for (const key of params.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key) || params.getAll(key).length > 1) {
      return apiError("BAD_REQUEST", `Unknown or repeated query parameter: ${key}.`, 400);
    }
  }

  const platformValue = params.get("platform");
  if (!platformValue) {
    return apiError("PLATFORM_REQUIRED", "The platform query parameter is required.", 400);
  }
  if (!isPlatformCatalogId(platformValue)) {
    return apiError("INVALID_PLATFORM", "The platform catalog is not supported.", 400);
  }

  const q = params.get("q")?.trim();
  if (q && q.length > 120) {
    return apiError("BAD_REQUEST", "Search queries must be 120 characters or fewer.", 400);
  }

  const typeValue = params.get("type");
  if (typeValue !== null && !isCatalogItemType(typeValue)) {
    return apiError("BAD_REQUEST", "The item type is not supported.", 400);
  }

  const category = params.get("category") ?? undefined;
  if (category && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) {
    return apiError("BAD_REQUEST", "The category must be a lowercase category ID.", 400);
  }

  const formatValue = params.get("format")?.toLowerCase();
  const format = formatValue
    ? formatValue.startsWith(".")
      ? formatValue
      : `.${formatValue}`
    : undefined;
  if (format && !isPlatformExtension(platformValue, format)) {
    return apiError(
      "BAD_REQUEST",
      `The ${format} format is not registered for ${PLATFORM_CATALOGS[platformValue].shortLabel}.`,
      400,
    );
  }

  const localeValue = params.get("locale") ?? "en";
  if (!isLocale(localeValue)) {
    return apiError("BAD_REQUEST", "The locale must be en or tr.", 400);
  }

  const limit = parseInteger(params.get("limit"), 20, 1, 100);
  const offset = parseInteger(params.get("offset"), 0, 0, 10_000);
  if (limit === undefined || offset === undefined) {
    return apiError("BAD_REQUEST", "Limit or offset is outside the supported range.", 400);
  }

  const sortValue = params.get("sort") ?? "title";
  if (sortValue !== "title" && sortValue !== "size" && sortValue !== "updated") {
    return apiError("BAD_REQUEST", "Sort must be title, size, or updated.", 400);
  }

  const sort: CatalogSort = sortValue;
  const result = queryCatalog({
    platform: platformValue,
    q,
    type: typeValue ?? undefined,
    category,
    format,
    locale: localeValue,
    limit,
    offset,
    sort,
  });
  const fullCatalog = getCatalogItems(platformValue);
  const categoryMap = new Map(
    fullCatalog.map((item) => [item.categoryId, item.category]),
  );
  const facets = {
    categories: [...categoryMap.entries()].map(([id, label]) => ({ id, label })),
    types: [...new Set(fullCatalog.map((item) => item.type))],
    formats: PLATFORM_CATALOGS[platformValue].formats.flatMap((formatDefinition) =>
      formatDefinition.extensions.map((extension) => ({
        extension,
        label: formatDefinition.label,
      })),
    ),
  };

  return apiJson({
    data: result.items,
    meta: {
      platform: platformValue,
      locale: localeValue,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      facets,
    },
  });
}
