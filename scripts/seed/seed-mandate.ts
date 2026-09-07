import { hermesClient } from "../lib/rest";
import { log } from "../lib/env";
import { MANDATE_SEED } from "./mandate";

/** Upserts the source-controlled mandate. Keeps the existing version number if a row exists (edits in the UI bump it). */
async function main() {
  const db = hermesClient();
  const existing = await db.select<{ version: number }>("hermes_mandate", "select=version&id=eq.north-star");
  const version = existing[0] ? existing[0].version + 1 : 1;
  const saved = await db.upsert("hermes_mandate", [{ ...MANDATE_SEED, version }], "id");
  log(`mandate upserted as v${version}`, { rules: MANDATE_SEED.rules.length, kpis: MANDATE_SEED.kpis.length, sleeves: MANDATE_SEED.sleeves.length, id: (saved[0] as { id: string }).id });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
