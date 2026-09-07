import { NextResponse, type NextRequest } from "next/server";
import { getNewsProviders } from "@/lib/altdata/news";

export const dynamic = "force-dynamic";

/** First provider that answers wins; errors are reported, never thrown at the UI. */
export async function GET(request: NextRequest) {
  const ticker = (request.nextUrl.searchParams.get("ticker") ?? "").trim();
  if (!ticker) return NextResponse.json({ items: [], provider: "none", error: "ticker required" }, { status: 400 });
  const errors: string[] = [];
  for (const provider of getNewsProviders()) {
    try {
      const items = await provider.news(ticker);
      return NextResponse.json({ items, provider: provider.name, errors });
    } catch (e) {
      errors.push(`${provider.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return NextResponse.json({ items: [], provider: "none", error: errors.join(" · ") });
}
