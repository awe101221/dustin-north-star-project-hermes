import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ladderFixture } from "./test-fixtures/forecast-ladder";
import { MARKET_HOLIDAYS, isMarketSession, previousCompletedSession } from "./market-calendar";

let db: PGlite;
let id: string, legacyId: string, original: unknown, oldObservation: Record<string, unknown>;
const migration = fs.readFileSync("supabase/migrations/20260909194747_gurufocus_price_return_evidence.sql", "utf8");
const urls = ["https://www.gurufocus.com/stock/MELI/summary", "https://www.gurufocus.com/stock/QQQ/summary"];
const oldUrls = ["https://www.alphavantage.co/query?symbol=MELI"];
const observation = () => {
  const today = new Date().toISOString().slice(0, 10);
  const leg = (symbol: string) => ({ symbol, provider: "gurufocus", currency: "USD", adjustment_basis: "split-adjusted", return_basis: "price-return",
    retrieved_at: new Date().toISOString(), source_date: previousCompletedSession(today), start_source_date: "2026-01-05", end_source_date: "2026-04-06",
    source_url: `https://www.gurufocus.com/stock/${symbol}/summary`, endpoint: "/public/user/{credential}/stock/{symbol}/price" });
  return { kind: "market", provider: "gurufocus", policy_version: "price-return-split-v1", adjustment_basis: "split-adjusted", return_basis: "price-return",
    calendar_version: "us-equities-2026-2028-v1", start_date: "2026-01-05", end_date: "2026-04-06", stock_start: 100, stock_end: 105, qqq_start: 100, qqq_end: 110,
    stock: leg("MELI"), qqq: leg("QQQ") };
};
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema extensions; create extension pgcrypto with schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table hermes_agent_tasks(id uuid primary key);
    create table hermes_notes(id uuid primary key default gen_random_uuid(),kind text,title text,body_md text,tickers text[],tags text[],persona_slug text,verdict text,author text,source_system text,is_pinned boolean,occurred_at timestamptz,metadata jsonb);
    create function hermes_set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    create publication supabase_realtime;`);
  await db.exec(fs.readFileSync("supabase/migrations/20260907000400_underwriting_graph_evaluation.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrations/20260909182814_short_horizon_learning_loop.sql", "utf8"));
  const f = ladderFixture();
  await db.exec(`insert into hermes_prompt_versions(prompt_id,version,role,schema_version,prompt_body) values('price-test','1','analyst','1','Original adjusted-price instructions preserved')`);
  await db.query(`insert into hermes_agent_runs(id,workflow_id,workflow_version,prompt_id,prompt_version,agent_name,status,metadata) values($1,'test','1','price-test','1','test','running',$2)`, [f.run_id, { model_version: f.model_version }]);
  await db.query("select hermes_register_forecast_ladder($1)", [f]);
  const rows = (await db.query<{ id: string; horizon: string }>("select id,horizon from hermes_ladder_forecasts where horizon<>'quarter'")).rows;
  legacyId = rows.find((r) => r.horizon === "90d")!.id; id = rows.find((r) => r.horizon === "12m")!.id;
  // Owner-only fixture time travel; never exposed through RPC or used in production.
  await db.exec(`alter table hermes_ladder_forecasts disable trigger hermes_ladder_append_only;
    update hermes_ladder_forecasts set start_date='2026-01-05',due_date='2026-04-06' where horizon<>'quarter';
    alter table hermes_ladder_forecasts enable trigger hermes_ladder_append_only;`);
  oldObservation = { kind: "market", provider: "alpha-vantage-adjusted", start_date: "2026-01-05", end_date: "2026-04-06", stock_start: 100, stock_end: 105, qqq_start: 100, qqq_end: 110 };
  await db.query("select hermes_grade_ladder($1,$2,$3)", [legacyId, oldObservation, oldUrls]);
  original = (await db.query("select * from hermes_ladder_forecasts order by id")).rows;
  await db.exec(migration);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });

describe("append-only price-return policy and guarded persistence", () => {
  it("replays migration without rewriting original contracts, prompts or old outcomes", async () => {
    expect((await db.query("select * from hermes_ladder_forecasts order by id")).rows).toEqual(original);
    expect((await db.query("select * from hermes_ladder_market_policies")).rows).toHaveLength(1);
    await db.query("select hermes_grade_ladder($1,$2,$3)", [legacyId, oldObservation, oldUrls]);
    expect((await db.query<{ observation: unknown }>("select observation from hermes_ladder_outcomes where forecast_id=$1", [legacyId])).rows[0]!.observation).toEqual(oldObservation);
    expect((await db.query<{ measurement_policy: string }>("select measurement_policy from hermes_ladder_evaluations where id=$1", [id])).rows[0]!.measurement_policy).toBe("price-return-split-v1");
  });
  it("rejects direct calls with missing provenance, unsupported feeds, mismatched bases, stale data and shifted dates", async () => {
    const obs = observation();
    const bad = [oldObservation, { ...obs, provider: "stooq" }, { ...obs, stock: undefined },
      { ...obs, end_date: "2026-04-07" }, { ...obs, adjustment_basis: "split-dividend-adjusted" },
      ...[{ provider: "yahoo" }, { symbol: "FAKE" }, { currency: "EUR" }, { return_basis: "total-return" }, { adjustment_basis: "unadjusted" },
        { retrieved_at: null }, { retrieved_at: "2026-01-01T00:00:00Z" }, { source_date: "2026-04-06" },
        { start_source_date: "2026-01-06" }, { source_url: "https://www.gurufocus.com/stock/MELI/summary?apikey=secret" },
        { endpoint: "/unadjusted_price" }].map((change) => ({ ...obs, stock: { ...obs.stock, ...change } }))];
    for (const value of bad) await expect(db.query("select hermes_grade_ladder($1,$2,$3)", [id, value, urls])).rejects.toThrow();
    expect((await db.query("select * from hermes_ladder_outcomes where forecast_id=$1", [id])).rows).toHaveLength(0);
  });
  it("matches the application session calendar and rejects non-session registered dates", async () => {
    for (const day of [...MARKET_HOLIDAYS, "2026-09-06", "2027-12-31", "2026-11-27", "2029-01-02"]) {
      expect((await db.query<{ valid: boolean }>("select hermes_is_price_session($1::date) valid", [day])).rows[0]!.valid).toBe(isMarketSession(day));
    }
    await db.exec("alter table hermes_ladder_forecasts disable trigger hermes_ladder_append_only");
    await db.query("update hermes_ladder_forecasts set due_date='2026-04-03' where id=$1", [id]);
    await db.exec("alter table hermes_ladder_forecasts enable trigger hermes_ladder_append_only");
    await expect(db.query("select hermes_grade_ladder($1,$2,$3)", [id, { ...observation(), end_date: "2026-04-03" }, urls])).rejects.toThrow();
    await db.exec("alter table hermes_ladder_forecasts disable trigger hermes_ladder_append_only");
    await db.query("update hermes_ladder_forecasts set due_date='2026-04-06' where id=$1", [id]);
    await db.exec("alter table hermes_ladder_forecasts enable trigger hermes_ladder_append_only");
  });
  it("persists price alpha and provenance once; exact replay is safe and conflicting replay is rejected", async () => {
    const obs = observation();
    await db.exec("set role service_role");
    await db.query("select hermes_grade_ladder($1,$2,$3)", [id, obs, urls]);
    await db.query("select hermes_grade_ladder($1,$2,$3)", [id, obs, urls]);
    await expect(db.query("select hermes_grade_ladder($1,$2,$3)", [id, { ...obs, stock_end: 999 }, urls])).rejects.toThrow(/already closed/);
    const row = (await db.query<{ alpha: string; observation: unknown }>("select alpha,observation from hermes_ladder_outcomes where forecast_id=$1", [id])).rows[0]!;
    expect(Number(row.alpha)).toBeCloseTo(-.05); expect(row.observation).toEqual(obs);
    await db.exec("reset role");
  });
  it("binds new market forecasts automatically and keeps policy rows immutable and confidential", async () => {
    const f = ladderFixture(); f.ticker = "NEW";
    await db.query("select hermes_register_forecast_ladder($1)", [f]);
    expect((await db.query("select * from hermes_ladder_market_policies")).rows).toHaveLength(3);
    await expect(db.query("update hermes_ladder_market_policies set reason='rewritten'")).rejects.toThrow(/append-only/);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`set role ${role}`);
      await expect(db.query("insert into hermes_market_price_providers values('yahoo','https://example.com/','','/price')")).rejects.toThrow(/permission/);
      await expect(db.query("insert into hermes_ladder_market_policies(forecast_id,reason) values($1,'rewrite')", [legacyId])).rejects.toThrow(/permission/);
      if (role !== "service_role") {
        await expect(db.query("select * from hermes_ladder_market_policies")).rejects.toThrow(/permission/);
        await expect(db.query("select hermes_grade_ladder($1,$2,$3)", [id, {}, urls])).rejects.toThrow(/permission/);
      }
      await db.exec("reset role");
    }
  });
});
