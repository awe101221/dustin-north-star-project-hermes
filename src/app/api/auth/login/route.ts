import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, expectedCookieValue, gateEnabled, timingSafeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const env = { password: process.env.HERMES_ACCESS_PASSWORD, secret: process.env.HERMES_SESSION_SECRET };
  if (!gateEnabled(env)) return NextResponse.json({ ok: true, gate: false });
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  const supplied = typeof body.password === "string" ? body.password : "";
  if (!timingSafeEqual(supplied.padEnd(256, "\0"), env.password!.padEnd(256, "\0"))) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ ok: false, error: "Wrong password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, gate: true });
  res.cookies.set(ACCESS_COOKIE, await expectedCookieValue(env), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
