import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest): NextResponse {
  const preferredLanguage = request.headers
    .get("accept-language")
    ?.split(",")[0]
    ?.split(";")[0]
    ?.split("-")[0]
    ?.trim()
    .toLowerCase();
  const locale = preferredLanguage === "tr" ? "tr" : "en";
  const localizedUrl = request.nextUrl.clone();
  localizedUrl.pathname = `/${locale}`;

  return NextResponse.redirect(localizedUrl);
}

export const config = { matcher: ["/"] };
