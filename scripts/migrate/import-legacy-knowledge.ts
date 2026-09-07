import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { hermesClient, chunk } from "../lib/rest";
import { log, optionalEnv } from "../lib/env";

/**
 * Migrates the useful knowledge from the legacy repos into hermes_knowledge.
 *
 *   LEGACY_AWE_CAPITAL_DIR=../awe-capital LEGACY_DUSTIN_AWE_CAPITAL_DIR=../dustin-awe-capital npm run migrate:knowledge
 *
 * What is migrated (and why):
 *   awe-capital/cockpit/00_System/*.md   — analyst instructions, data dictionary, field conventions,
 *                                          industry overlay, question playbook, scoring rules
 *   awe-capital/docs/personas/*.md       — worker-core prompts per persona
 *   awe-capital/docs/prompts/*.md        — ranking / re-underwrite / theme prompts
 *   awe-capital/docs/queue-worker/*.md   — orchestrator, ticker-analyst, gate extraction, precedents
 *   awe-capital/docs/*.md                — module docs (themes, 13F, guru activity, filings, intake)
 *   awe-capital/docs/agents/*.md, .cursor/agents/*.md — the agent organization + employee definitions
 *   awe-capital/docs/skills/claude/**    — the Claude skills (query/add brain)
 *   awe-capital/Hermes Awe Capital Mac Mini.md — master project file
 *   dustin-awe-capital/05 Research, 07 Assistant, 99 Templates, .agents/skills — vault process docs
 *                                          (reference only: labeled source_repo=dustin-awe-capital)
 *
 * What is deliberately NOT migrated: run folders, CSV exports, backup SQL, empty
 * placeholders, and anything that duplicates a row already in
 * analyst_project_artifacts (those stay the canonical persona artifacts).
 *
 * Idempotent: keyed by slug; unchanged content (sha256) is skipped.
 */
type Spec = { repo: "awe-capital" | "dustin-awe-capital"; rel: string; category: string; persona?: string; tags?: string[]; title?: string; order?: number };

const PERSONA_BY_FILE: Record<string, string> = { brad: "brad-gerstner", gerstner: "brad-gerstner", pabrai: "mohnish-pabrai", mohnish: "mohnish-pabrai", "public-vc": "public-vc", "public_vc": "public-vc", publicvc: "public-vc" };

function guessPersona(file: string) {
  const f = file.toLowerCase();
  for (const [k, v] of Object.entries(PERSONA_BY_FILE)) if (f.includes(k)) return v;
  return undefined;
}

function listMd(dir: string, recursive = false): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...listMd(full, true));
    } else if (entry.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out.sort();
}

function slugFor(spec: Spec) {
  return `${spec.repo}/${spec.rel}`.toLowerCase().replace(/\.md$/, "").replace(/[^a-z0-9/]+/g, "-").replace(/\/+/g, "/").replace(/^-+|-+$/g, "").replace(/\//g, "--");
}

function titleFor(body: string, file: string) {
  const m = /^#\s+(.+)$/m.exec(body);
  if (m?.[1]) return m[1].trim().replace(/[*_`]/g, "");
  return path.basename(file, ".md").replace(/[_-]+/g, " ");
}

function summaryFor(body: string) {
  const stripped = body.replace(/^---[\s\S]*?---\s*/m, "").replace(/^#.*$/gm, "").replace(/[*_`>#|]/g, "").replace(/\s+/g, " ").trim();
  return stripped.slice(0, 280);
}

function build(aweDir: string | undefined, dacDir: string | undefined): Array<Spec & { file: string }> {
  const specs: Array<Spec & { file: string }> = [];
  const add = (repo: Spec["repo"], base: string, rel: string, category: string, extra: Partial<Spec> = {}) => {
    const file = path.join(base, rel);
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).size < 120) return; // skip placeholders
    specs.push({ repo, rel, category, file, persona: extra.persona ?? guessPersona(rel), tags: extra.tags ?? [], title: extra.title, order: extra.order });
  };
  if (aweDir) {
    for (const f of listMd(path.join(aweDir, "cockpit/00_System"))) {
      const rel = path.relative(aweDir, f);
      const name = path.basename(f).toLowerCase();
      const category = name.includes("analyst_") ? "persona" : name.includes("scoring") || name.includes("field_convention") || name.includes("data_dictionary") ? "spec" : name.includes("playbook") || name.includes("overlay") ? "playbook" : "process";
      add("awe-capital", aweDir, rel, category, { tags: ["cockpit", "system"] });
    }
    for (const f of listMd(path.join(aweDir, "docs/personas"))) add("awe-capital", aweDir, path.relative(aweDir, f), "persona", { tags: ["worker-core"] });
    for (const f of listMd(path.join(aweDir, "docs/prompts"))) add("awe-capital", aweDir, path.relative(aweDir, f), "prompt", { tags: ["prompt"] });
    for (const f of listMd(path.join(aweDir, "docs/queue-worker"))) add("awe-capital", aweDir, path.relative(aweDir, f), "process", { tags: ["queue-worker", "underwriting"] });
    for (const f of listMd(path.join(aweDir, "docs/agents"))) add("awe-capital", aweDir, path.relative(aweDir, f), "agent", { tags: ["organization"] });
    for (const f of listMd(path.join(aweDir, ".cursor/agents"))) add("awe-capital", aweDir, path.relative(aweDir, f), "agent", { tags: ["employee", "cursor"] });
    for (const f of listMd(path.join(aweDir, "docs"))) {
      const rel = path.relative(aweDir, f);
      const name = path.basename(f).toLowerCase();
      if (name.includes("audit") || name.includes("vercel-dashboard-scope") || name.includes("chatgpt")) continue; // superseded by Hermes
      add("awe-capital", aweDir, rel, "process", { tags: ["module-doc"] });
    }
    for (const f of listMd(path.join(aweDir, "docs/skills/claude"), true)) add("awe-capital", aweDir, path.relative(aweDir, f), "skill", { tags: ["claude-skill"] });
    add("awe-capital", aweDir, "Hermes Awe Capital Mac Mini.md", "process", { tags: ["master-file"], order: 1 });
    add("awe-capital", aweDir, "AGENTS.md", "agent", { tags: ["runtime-instructions"], order: 2 });
  }
  if (dacDir) {
    for (const f of listMd(path.join(dacDir, "05 Research"))) {
      const name = path.basename(f).toLowerCase();
      if (name.includes("index")) continue;
      add("dustin-awe-capital", dacDir, path.relative(dacDir, f), name.includes("prompt") ? "prompt" : "process", { tags: ["vault", "research"] });
    }
    for (const f of listMd(path.join(dacDir, "07 Assistant"))) {
      const name = path.basename(f).toLowerCase();
      if (name.includes("dashboard")) continue;
      add("dustin-awe-capital", dacDir, path.relative(dacDir, f), name.includes("rules") ? "rules" : "process", { tags: ["vault", "assistant"] });
    }
    for (const f of listMd(path.join(dacDir, "99 Templates"))) add("dustin-awe-capital", dacDir, path.relative(dacDir, f), "template", { tags: ["vault", "template"] });
    for (const f of listMd(path.join(dacDir, ".agents/skills"), true)) add("dustin-awe-capital", dacDir, path.relative(dacDir, f), "skill", { tags: ["codex-skill"] });
    add("dustin-awe-capital", dacDir, "AGENTS.md", "agent", { tags: ["runtime-instructions"], order: 3 });
  }
  return specs;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `ARRAY[${value.map((v) => sqlLiteral(v)).join(",")}]::text[]`;
  const tag = "$hk$";
  const str = String(value);
  return str.includes(tag) ? `'${str.replace(/'/g, "''")}'` : `${tag}${str}${tag}`;
}

function toUpsertSql(rows: Record<string, unknown>[]) {
  const cols = ["slug", "title", "category", "persona_slug", "body_md", "summary", "source_repo", "source_path", "content_sha256", "tags", "is_active", "display_order"];
  const values = rows.map((r) => `(${cols.map((c) => sqlLiteral(r[c])).join(", ")})`).join(",\n");
  return `insert into public.hermes_knowledge (${cols.join(", ")})\nvalues\n${values}\non conflict (slug) do update set title = excluded.title, category = excluded.category, persona_slug = excluded.persona_slug, body_md = excluded.body_md, summary = excluded.summary, source_repo = excluded.source_repo, source_path = excluded.source_path, content_sha256 = excluded.content_sha256, tags = excluded.tags, is_active = excluded.is_active, display_order = excluded.display_order;\n`;
}

async function fetchArtifactPathsAnon(): Promise<Array<{ source_path: string | null }>> {
  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL") ?? "https://cwiaqczpifnxxcucqwvr.supabase.co";
  const key = optionalEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!key) return [];
  const res = await fetch(`${url}/rest/v1/analyst_project_artifacts?select=source_path&is_active=eq.true`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return res.ok ? ((await res.json()) as Array<{ source_path: string | null }>) : [];
}

async function main() {
  const emitDir = process.argv.includes("--emit-sql") ? process.argv[process.argv.indexOf("--emit-sql") + 1] : undefined;
  const aweDir = optionalEnv("LEGACY_AWE_CAPITAL_DIR") ?? path.resolve(process.cwd(), "../awe-capital");
  const dacDir = optionalEnv("LEGACY_DUSTIN_AWE_CAPITAL_DIR") ?? path.resolve(process.cwd(), "../dustin-awe-capital");
  const specs = build(fs.existsSync(aweDir) ? aweDir : undefined, fs.existsSync(dacDir) ? dacDir : undefined);
  if (specs.length === 0) throw new Error(`No legacy docs found. Checked ${aweDir} and ${dacDir}.`);
  log(`found ${specs.length} candidate docs`);

  const db = emitDir ? null : hermesClient();
  const existing = db ? await db.selectAll<{ slug: string; content_sha256: string | null }>("hermes_knowledge", "select=slug,content_sha256") : [];
  const shaBySlug = new Map(existing.map((e) => [e.slug, e.content_sha256]));
  // Docs already stored as active persona artifacts stay canonical there; skip duplicates.
  const artifactPaths = new Set(
    (db ? await db.selectAll<{ source_path: string | null }>("analyst_project_artifacts", "select=source_path&is_active=eq.true") : await fetchArtifactPathsAnon()).map((a) => a.source_path).filter((x): x is string => Boolean(x)),
  );

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  let deduped = 0;
  for (const spec of specs) {
    if (spec.repo === "awe-capital" && artifactPaths.has(spec.rel)) {
      deduped++;
      continue;
    }
    const body = fs.readFileSync(spec.file, "utf8");
    const sha = createHash("sha256").update(body).digest("hex");
    const slug = slugFor(spec);
    if (shaBySlug.get(slug) === sha) {
      skipped++;
      continue;
    }
    rows.push({
      slug,
      title: spec.title ?? titleFor(body, spec.file),
      category: spec.category,
      persona_slug: spec.persona ?? null,
      body_md: body,
      summary: summaryFor(body),
      source_repo: spec.repo,
      source_path: spec.rel,
      content_sha256: sha,
      tags: Array.from(new Set([...(spec.tags ?? []), spec.repo])),
      is_active: true,
      display_order: spec.order ?? 100,
    });
  }
  if (emitDir) {
    fs.mkdirSync(emitDir, { recursive: true });
    let i = 0;
    let bytes = 0;
    let current: Record<string, unknown>[] = [];
    const flush = () => {
      if (!current.length) return;
      fs.writeFileSync(path.join(emitDir, `knowledge-${String(++i).padStart(2, "0")}.sql`), toUpsertSql(current));
      current = [];
      bytes = 0;
    };
    for (const r of rows) {
      const size = String(r.body_md).length;
      if (bytes + size > 60_000 && current.length) flush();
      current.push(r);
      bytes += size;
    }
    flush();
    log(`emitted ${rows.length} docs as ${i} SQL files in ${emitDir} (deduped against artifacts: ${deduped})`);
    console.table(rows.map((r) => ({ slug: r.slug, category: r.category, persona: r.persona_slug, chars: String(r.body_md).length })));
    return;
  }
  for (const batch of chunk(rows, 20)) await db!.upsert("hermes_knowledge", batch, "slug");
  log(`upserted ${rows.length}, unchanged ${skipped}, deduped against artifacts ${deduped}, total in table ${await db!.count("hermes_knowledge")}`);
  const byCategory = new Map<string, number>();
  for (const s of specs) byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);
  console.table(Array.from(byCategory, ([category, count]) => ({ category, count })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
