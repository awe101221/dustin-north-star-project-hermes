import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { env, log } from "../lib/env";

/**
 * Applies supabase/migrations/*.sql in filename order against DATABASE_URL.
 * Every migration is idempotent (create if not exists / create or replace),
 * and a ledger table records what ran so re-runs are cheap.
 *
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *
 * The same files were applied to INVESTING-BRAIN-AG during the initial build
 * through the Supabase MCP; this script exists so the next environment (a
 * branch database, a fresh project) gets the identical schema.
 */
async function main() {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new Client({ connectionString: env("DATABASE_URL"), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`create table if not exists public.hermes_schema_migrations (name text primary key, applied_at timestamptz not null default now(), sha256 text)`);
    const { rows } = await client.query<{ name: string; sha256: string }>("select name, sha256 from public.hermes_schema_migrations");
    const applied = new Map(rows.map((r) => [r.name, r.sha256]));
    const { createHash } = await import("node:crypto");
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      const sha = createHash("sha256").update(sql).digest("hex");
      if (applied.get(file) === sha) {
        log(`skip ${file} (already applied)`);
        continue;
      }
      log(`apply ${file}`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.hermes_schema_migrations (name, sha256) values ($1, $2) on conflict (name) do update set sha256 = excluded.sha256, applied_at = now()", [file, sha]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
    }
    log("migrations complete");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
