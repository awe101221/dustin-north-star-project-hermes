import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, gateEnabled, verifyCookie } from "@/lib/auth";

/**
 * Next.js 16 request proxy (formerly middleware). Enforces the optional
 * password gate for every page and every /api/hermes route. The agent API
 * (/api/agent/*) authenticates with its own bearer token and is exempt here;
 * /api/health and /api/auth are always reachable.
 */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/health", "/api/agent"];

export async function proxy(request: NextRequest) {
  const env = { password: process.env.HERMES_ACCESS_PASSWORD, secret: process.env.HERMES_SESSION_SECRET };
  if (!gateEnabled(env)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const ok = await verifyCookie(request.cookies.get(ACCESS_COOKIE)?.value, env);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
