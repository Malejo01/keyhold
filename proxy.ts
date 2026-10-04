import { NextResponse, type NextRequest } from "next/server";
import { isLang, pickLang } from "@/lib/i18n";

/**
 * Root language redirect (Next 16 `proxy`, formerly middleware). Only "/" is matched, so /api/*, static files,
 * the icon and the opengraph images never reach this code. Order: the `lang` cookie set by the language
 * selector, then Accept-Language (es* -> /es), else /en. Query strings (e.g. ?fixtures=1) are preserved.
 * The judge link is always /en, which is never redirected.
 */
export function proxy(request: NextRequest) {
  const cookie = request.cookies.get("lang")?.value;
  const lang = isLang(cookie) ? cookie : pickLang(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${lang}`;
  const response = NextResponse.redirect(url, 307);
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}

export const config = {
  matcher: "/",
};
