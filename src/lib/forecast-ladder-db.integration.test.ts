import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { ladderFixture } from "./test-fixtures/forecast-ladder";

let db: PGlite;
const migration = fs.readFileSync("supabase/migrations/20260909182814_short_horizon_learning_loop.sql", "utf8");
let run = 1;
async function input(model = "model-v1") {
  const f = ladderFixture();
  f.model_version = model;
  f.run_id = `10000000-0000-4000-8000-${String(run++).padStart(12, "0")}`;
  await db.query(`insert into hermes_agent_runs(id,workflow_id,workflow_version,prompt_id,prompt_version,agent_name,status,metadata) values($1,'refresh','1','ladder-test','1','test-agent','running',$2)`, [f.run_id, { model_version: model }]);
  return f;
}
async function register(f: ReturnType<typeof ladderFixture>) {
  return (await db.query<{ result: { ladder_id: string; created: boolean; replay: boolean } }>("select hermes_register_forecast_ladder($1) result", [f])).rows[0]!.result;
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema extensions; create extension pgcrypto with schema extensions;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table hermes_agent_tasks(id uuid primary key);
    create table hermes_notes(id uuid primary key default gen_random_uuid(),kind text,title text,body_md text,tickers text[],tags text[],persona_slug text,verdict text,author text,source_system text,is_pinned boolean,occurred_at timestamptz,metadata jsonb);
    create function hermes_set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;
    create publication supabase_realtime;`);
  await db.exec(fs.readFileSync("supabase/migrations/20260907000400_underwriting_graph_evaluation.sql", "utf8"));
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`insert into hermes_prompt_versions(prompt_id,version,role,schema_version,prompt_body) values('ladder-test','1','analyst','1','immutable test contract')`);
}, 30000);
afterAll(async () => { await db?.close(); });

describe("short-horizon atomic ledger", () => {
  it("creates exactly three forward forecasts; exact retry works after run completion", async () => {
    const f = await input();
    const first = await register(f);
    expect(first.created).toBe(true);
    expect((await db.query("select * from hermes_ladder_forecasts where ladder_id=$1", [first.ladder_id])).rows).toHaveLength(3);
    await db.query("update hermes_agent_runs set status='succeeded',completed_at=now() where id=$1", [f.run_id]);
    expect(await register(f)).toMatchObject({ ladder_id: first.ladder_id, replay: true });
    await expect(register({ ...f, conclusion: "rewritten" })).rejects.toThrow(/Conflicting/);
  });
  it("retains daily checks but ignores fresh prose/rank/date/model noise", async () => {
    const f = await input("new-model"); f.ranking.rank = 2; f.conclusion = "Refreshed prose";
    expect((await register(f)).created).toBe(false);
    expect((await db.query("select * from hermes_ladder_checks where run_id=$1", [f.run_id])).rows).toHaveLength(1);
  });
  it("registers material alpha changes once and preserves prior versions", async () => {
    const f = await input(); f.market_90d.expected_alpha = .06;
    expect((await register(f)).created).toBe(true);
    expect((await db.query("select * from hermes_forecast_ladders where ticker='MELI'")).rows).toHaveLength(2);
  });
  it("rejects missing horizons, unknown assumptions, credentials, hindsight and incomplete provenance atomically", async () => {
    const f = await input(); f.ticker = "META";
    for (const bad of [
      { ...f, market_90d: null },
      { ...f, market_90d: { ...f.market_90d, assumption_ids: ["unknown"] } },
      { ...f, market_90d: { ...f.market_90d, evidence_urls: ["https://www.sec.gov/a?apikey=secret"] } },
      { ...f, operating: { ...f.operating, due_date: "2020-01-01" } },
      { ...f, operating: { ...f.operating, period_start: "2020-01-01" } },
    ]) await expect(db.query("select hermes_register_forecast_ladder($1)", [bad])).rejects.toThrow();
    expect((await db.query("select * from hermes_forecast_ladders where ticker='META'")).rows).toHaveLength(0);
  });
  it("does not permit grading before maturity", async () => {
    const f = (await db.query<{ id: string }>("select id from hermes_ladder_forecasts limit 1")).rows[0]!;
    await expect(db.query("select hermes_grade_ladder($1,$2,$3)", [f.id, {}, ["https://www.sec.gov/a"]])).rejects.toThrow(/not due/);
  });
  it("rejects a model version that differs from the recorded run", async () => {
    const f = await input(); f.model_version = "fictional-model";
    await expect(register(f)).rejects.toThrow(/match the recorded run/);
  });
  it("computes alpha, calibration, and immutable idempotent outcomes from endpoints", async () => {
    const f = (await db.query<{ id: string }>("select id from hermes_ladder_forecasts where horizon='90d' limit 1")).rows[0]!;
    // Owner-only time travel fixture; not exposed to service_role or production.
    await db.exec("alter table hermes_ladder_forecasts disable trigger hermes_ladder_append_only");
    await db.query("update hermes_ladder_forecasts set start_date=current_date-91,due_date=current_date-2 where id=$1", [f.id]);
    await db.exec("alter table hermes_ladder_forecasts enable trigger hermes_ladder_append_only");
    const dates = (await db.query<{ start: string; end: string }>("select start_date::text start,due_date::text end from hermes_ladder_forecasts where id=$1", [f.id])).rows[0]!;
    const obs = { kind: "market", provider: "alpha-vantage-adjusted", start_date: dates.start, end_date: dates.end, stock_start: 100, stock_end: 105, qqq_start: 100, qqq_end: 110 };
    const urls = ["https://www.alphavantage.co/query?symbol=MELI", "https://www.alphavantage.co/query?symbol=QQQ"];
    await db.query("select hermes_grade_ladder($1,$2,$3)", [f.id, obs, urls]);
    await db.query("select hermes_grade_ladder($1,$2,$3)", [f.id, obs, urls]);
    const out = (await db.query<{ alpha: string; brier: string; hit: boolean }>("select alpha,brier,hit from hermes_ladder_outcomes where forecast_id=$1", [f.id])).rows[0]!;
    expect(Number(out.alpha)).toBeCloseTo(-.05); expect(Number(out.brier)).toBeCloseTo(.36); expect(out.hit).toBe(false);
    await expect(db.query("select hermes_grade_ladder($1,$2,$3)", [f.id, { ...obs, stock_end: 120 }, urls])).rejects.toThrow(/already closed/);
    await expect(db.query("update hermes_ladder_outcomes set hit=true where forecast_id=$1", [f.id])).rejects.toThrow(/append-only/);
    const review = { forecast_id: f.id, reviewer: "test", failed_assumption_ids: [], finding: "Cause not yet identified", recommended_change: "Investigate operating evidence", disposition: "investigate", evidence_urls: urls };
    await db.query("select hermes_review_ladder($1)", [review]);
    await db.query("select hermes_review_ladder($1)", [review]);
    expect((await db.query("select * from hermes_ladder_reviews")).rows).toHaveLength(1);
    await expect(db.query("select hermes_review_ladder($1)", [{ ...review, failed_assumption_ids: ["invented"] }])).rejects.toThrow(/Unknown/);
  });
  it("keeps all ledger tables confidential and service-role writes RPC-only", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(db.query("select * from hermes_ladder_evaluations")).rejects.toThrow(/permission/);
      await expect(db.query("select hermes_register_forecast_ladder('{}')")).rejects.toThrow(/permission/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    expect((await db.query("select * from hermes_ladder_evaluations")).rows.length).toBeGreaterThan(0);
    await expect(db.query("insert into hermes_forecast_ladders(ticker) values('FAKE')")).rejects.toThrow(/permission/);
    await db.exec("reset role");
  });
  it("publishes only a complete matched 10+10, atomically and idempotently", async () => {
    const base = await input();
    const topTen: Array<{ ticker: string; qqqLine: string }> = [];
    const watchlistTen: Array<{ ticker: string; qqqLine: string }> = [];
    for (let n = 0; n < 20; n++) {
      const f = structuredClone(base); f.ticker = `TEST${n}`;
      f.ranking.lane = n < 10 ? "top-ten" : "watchlist"; f.ranking.rank = (n % 10) + 1;
      await register(f);
      (n < 10 ? topTen : watchlistTen).push({ ticker: f.ticker, qqqLine: f.ranking.qqq_decision });
    }
    const note = { kind: "agent", title: "Learning snapshot", metadata: { bestIdeas: { topTen, watchlistTen } } };
    const invalid = structuredClone(note); invalid.metadata.bestIdeas.topTen[0]!.qqqLine = "below";
    await expect(db.query("select hermes_publish_learning_snapshot($1,$2)", [base.run_id, invalid])).rejects.toThrow(/matching forecast/);
    expect((await db.query("select * from hermes_notes")).rows).toHaveLength(0);
    await db.query("select hermes_publish_learning_snapshot($1,$2)", [base.run_id, note]);
    await db.query("select hermes_publish_learning_snapshot($1,$2)", [base.run_id, note]);
    expect((await db.query("select * from hermes_notes")).rows).toHaveLength(1);
    await expect(db.query("select hermes_publish_learning_snapshot($1,$2)", [base.run_id, { ...note, title: "rewritten" }])).rejects.toThrow(/Conflicting/);
  });
  it("grades exact KPI evidence and rejects period/unit mismatch", async () => {
    const base = await input(); base.ticker = "KPI";
    const ladder = await register(base);
    const row = (await db.query<{ id: string; contract: Record<string, unknown> }>("select id,contract from hermes_ladder_forecasts where ladder_id=$1 and horizon='quarter'", [ladder.ladder_id])).rows[0]!;
    const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const contract = { ...row.contract, period_start: day(-150), period_end: day(-60) };
    await db.exec("alter table hermes_ladder_forecasts disable trigger hermes_ladder_append_only");
    await db.query("update hermes_ladder_forecasts set start_date=current_date-160,due_date=current_date-2,contract=$2 where id=$1", [row.id, contract]);
    await db.exec("alter table hermes_ladder_forecasts enable trigger hermes_ladder_append_only");
    const obs = { kind: "sec_kpi", value: 110, period_start: contract.period_start, period_end: contract.period_end,
      unit: "USD", cik: "1", concept: "Revenues", taxonomy: "us-gaap", filed: day(-10), accession: "0000000001-26-000001" };
    const urls = ["https://www.sec.gov/Archives/edgar/data/1/000000000126000001/0000000001-26-000001-index.html"];
    await expect(db.query("select hermes_grade_ladder($1,$2,$3)", [row.id, { ...obs, unit: "EUR" }, urls])).rejects.toThrow(/Exact SEC/);
    await db.query("select hermes_grade_ladder($1,$2,$3)", [row.id, obs, urls]);
    const out = (await db.query<{ actual_value: string; hit: boolean; alpha: null }>("select actual_value,hit,alpha from hermes_ladder_outcomes where forecast_id=$1", [row.id])).rows[0]!;
    expect(Number(out.actual_value)).toBe(110); expect(out.hit).toBe(true); expect(out.alpha).toBeNull();
  });
});
