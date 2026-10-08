import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const table = "public.hermes_qqq_ranking_releases";
beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec("alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;");
  await db.exec(fs.readFileSync("supabase/migrations/20261008111533_qqq_top50_publications.sql", "utf8"));
}, 30000);
afterAll(async () => { await db.close(); });

describe("ranking storage access and immutable generations", () => {
  it("allows only privileged reads/inserts and enables RLS", async () => {
    const { rows } = await db.query<{ role: string; read: boolean; insert: boolean; update: boolean; delete: boolean }>(`
      select role, has_table_privilege(role, '${table}', 'SELECT') as read,
      has_table_privilege(role, '${table}', 'INSERT') as insert,
      has_table_privilege(role, '${table}', 'UPDATE') as update,
      has_table_privilege(role, '${table}', 'DELETE') as delete
      from unnest(array['anon','authenticated','service_role']) role`);
    expect(rows).toEqual([
      { role: "anon", read: false, insert: false, update: false, delete: false },
      { role: "authenticated", read: false, insert: false, update: false, delete: false },
      { role: "service_role", read: true, insert: true, update: false, delete: false },
    ]);
    expect((await db.query<{ relrowsecurity: boolean }>(`select relrowsecurity from pg_class where oid='${table}'::regclass`)).rows[0]?.relrowsecurity).toBe(true);
  });
  it("rejects missing nested payloads and partially populated sleeves", async () => {
    const insert = `insert into ${table}(release_hash,as_of,approved_at,publications,securities,authorities) values ($1,now(),now(),$2::jsonb,'[{}]','[{}]')`;
    await expect(db.query(insert, ["0".repeat(64), JSON.stringify([{}, {}])])).rejects.toThrow(/check constraint/);
    const payload = [{ draft: { sleeve: "core", forecasts: Array.from({ length: 50 }, () => ({})) } }, { draft: { sleeve: "ai-regime", forecasts: [] } }];
    await expect(db.query(insert, ["1".repeat(64), JSON.stringify(payload)])).rejects.toThrow(/check constraint/);
  });
  it("rejects conflicting equal-precedence snapshots and service-role rewrites", async () => {
    // Deliberately minimal SQL-only fixtures. The publication CLI and server
    // additionally reject unsigned content through the full author/hash gates.
    const payload = ["core", "ai-regime"].map((sleeve) => ({ draft: { sleeve, forecasts: Array.from({ length: 50 }, () => ({})) } }));
    const insert = `insert into ${table}(release_hash,as_of,approved_at,publications,securities,authorities) values ($1,'2026-10-07T20:00:00Z','2026-10-07T21:00:00Z',$2::jsonb,'[{}]','[{}]')`;
    await db.query(insert, ["2".repeat(64), JSON.stringify(payload)]);
    await expect(db.query(insert, ["3".repeat(64), JSON.stringify(payload)])).rejects.toThrow(/unique constraint/);
    await db.exec("set role service_role");
    await expect(db.exec(`update ${table} set securities='[]'`)).rejects.toThrow(/permission denied/);
    await expect(db.exec(`delete from ${table}`)).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});
