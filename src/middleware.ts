import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, checkAuth } from "@/lib/auth";

export const runtime = "experimental-edge";

const PUBLIC_PATHS = new Set(["/login"]);

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (await checkAuth(cookie)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
