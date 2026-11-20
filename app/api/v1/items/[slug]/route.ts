import { apiError, apiJson } from "@/lib/api/responses";
import { isPlatformCatalogId } from "@/lib/catalog/platforms";
import { getCatalogItem } from "@/lib/catalog/repository";
import { isLocale } from "@/lib/catalog/types";

const ALLOWED_QUERY_PARAMS = new Set(["platform", "locale"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const query = new URL(request.url).searchParams;

  for (const key of query.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key) || query.getAll(key).length > 1) {
      return apiError("BAD_REQUEST", `Unknown or repeated query parameter: ${key}.`, 400);
    }
  }

  const platformValue = query.get("platform");
  if (!platformValue) {
    return apiError("PLATFORM_REQUIRED", "The platform query parameter is required.", 400);
  }
  if (!isPlatformCatalogId(platformValue)) {
    return apiError("INVALID_PLATFORM", "The platform catalog is not supported.", 400);
  }

  const localeValue = query.get("locale") ?? "en";
  if (!isLocale(localeValue)) {
    return apiError("BAD_REQUEST", "The locale must be en or tr.", 400);
  }

  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return apiError("BAD_REQUEST", "The item slug is invalid.", 400);
  }

  const item = getCatalogItem(platformValue, slug);
  if (!item) {
    return apiError(
      "ITEM_NOT_FOUND",
      "The item was not found in the selected platform catalog.",
      404,
    );
  }

  return apiJson({ data: item, meta: { platform: platformValue, locale: localeValue } });
}
