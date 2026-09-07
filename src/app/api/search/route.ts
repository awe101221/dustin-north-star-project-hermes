import { NextResponse, type NextRequest } from "next/server";
import { searchCompanies } from "@/lib/db/company";
import { searchResearch } from "@/lib/db/research";
import { unwrap } from "@/lib/db/query";
import { serverReadClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Unified palette search: tickers, pipeline ideas, ranked research hits. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const db = serverReadClient();
  if (!db || q.length < 2) return NextResponse.json({ companies: [], research: [], ideas: [] });
  try {
    const [companies, research, ideas] = await Promise.all([
      searchCompanies(db, q, 8),
      searchResearch(db, q, 8),
      db.from("hermes_ideas").select("id, ticker, stage, company_name").or(`ticker.ilike.%${q.toUpperCase()}%,company_name.ilike.%${q}%`).neq("stage", "archive").limit(5).then((r) => unwrap(r, "ideas search")),
    ]);
    return NextResponse.json({ companies, research, ideas });
  } catch (e) {
    return NextResponse.json({ companies: [], research: [], ideas: [], error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}
