/**
 * Password gate. Edge-compatible (Web Crypto only) so proxy.ts can
 * verify the cookie without Node APIs.
 *
 * Both HERMES_ACCESS_PASSWORD and the independent HERMES_SESSION_SECRET are
 * required. Incomplete configuration fails closed.
 */
export const ACCESS_COOKIE = "hermes_access";
const COOKIE_PAYLOAD = "hermes-v1";

async function hmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function gateEnabled(env: { password?: string; secret?: string }) {
  const password = env.password?.trim();
  const secret = env.secret?.trim();
  return Boolean(password && secret && password !== secret);
}

export async function expectedCookieValue(env: { password?: string; secret?: string }) {
  const password = env.password?.trim();
  if (!password) throw new Error("HERMES_ACCESS_PASSWORD is required for the access gate.");
  const secret = env.secret?.trim();
  if (!secret) throw new Error("The HERMES_SESSION_SECRET session secret is required and must be separate from the access password.");
  if (secret === password) throw new Error("HERMES_SESSION_SECRET must be different from the access password.");
  return hmac(secret, COOKIE_PAYLOAD);
}

export async function verifyCookie(value: string | undefined, env: { password?: string; secret?: string }) {
  if (!gateEnabled(env)) return false;
  if (!value) return false;
  const expected = await expectedCookieValue(env);
  return timingSafeEqual(value, expected);
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
