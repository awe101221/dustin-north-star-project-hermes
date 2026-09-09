export function requireCanonicalSupabaseUrl(rawUrl: string, projectRef: string, variableName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`WRONG_DATABASE_TARGET: ${variableName} Supabase URL must be valid.`);
  }

  const expectedHostname = `${projectRef}.supabase.co`;
  const canonicalUrl = `https://${expectedHostname}`;
  if (
    (rawUrl !== canonicalUrl && rawUrl !== `${canonicalUrl}/`)
    || parsed.protocol !== "https:"
    || parsed.hostname !== expectedHostname
    || parsed.port !== ""
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new Error(`WRONG_DATABASE_TARGET: ${variableName} Supabase URL must use HTTPS and the exact ${expectedHostname} hostname.`);
  }

  return canonicalUrl;
}
