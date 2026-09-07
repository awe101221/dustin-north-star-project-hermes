import { toRecord } from "@/lib/utils";
import { num, unwrap, type Db } from "./query";
import type { PersonaCatalogRow, ProjectArtifactRow, PromptTemplateRow, TopRankingRow } from "./types";

export type Persona = {
  slug: string;
  name: string;
  frameworkName: string;
  frameworkVersion: string;
  description: string;
  instructionPath: string | null;
  isActive: boolean;
  headline: string | null;
  personaPrompt: string | null;
  outputRoute: string | null;
  blendWeight: number | null;
  metadata: Record<string, unknown>;
  artifactCount: number;
  memoCount: number;
  tickerCount: number;
  lastMemoAt: string | null;
  knowledgeCount: number;
  createdAt: string;
  updatedAt: string;
};

export function mapPersona(r: PersonaCatalogRow): Persona {
  return {
    slug: r.slug,
    name: r.display_name ?? r.slug,
    frameworkName: r.framework_name ?? "",
    frameworkVersion: r.framework_version ?? "",
    description: r.description ?? "",
    instructionPath: r.instruction_path,
    isActive: r.is_active,
    headline: r.headline,
    personaPrompt: r.persona_prompt,
    outputRoute: r.output_route,
    blendWeight: num(r.master_blend_weight),
    metadata: toRecord(r.metadata),
    artifactCount: num(r.artifact_count) ?? 0,
    memoCount: num(r.memo_count) ?? 0,
    tickerCount: num(r.ticker_count) ?? 0,
    lastMemoAt: r.last_memo_at,
    knowledgeCount: num(r.knowledge_count) ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getPersonas(db: Db, includeInactive = true): Promise<Persona[]> {
  let q = db.from("hermes_persona_catalog").select("*").order("created_at", { ascending: true });
  if (!includeInactive) q = q.eq("is_active", true);
  const rows = unwrap(await q, "personas") as PersonaCatalogRow[];
  return rows.map(mapPersona);
}

export async function getPersona(db: Db, slug: string): Promise<Persona | null> {
  const rows = unwrap(await db.from("hermes_persona_catalog").select("*").eq("slug", slug).limit(1), "persona") as PersonaCatalogRow[];
  return rows[0] ? mapPersona(rows[0]) : null;
}

export type Artifact = {
  key: string;
  persona: string;
  type: string;
  title: string;
  description: string | null;
  sourcePath: string | null;
  format: string;
  content: string;
  order: number;
  updatedAt: string;
};

export async function getArtifacts(db: Db, persona: string, opts: { withContent?: boolean } = {}): Promise<Artifact[]> {
  const columns = opts.withContent
    ? "*"
    : "artifact_key, analyst_slug, artifact_type, title, description, source_path, content_format, display_order, is_active, metadata, updated_at";
  const rows = unwrap(
    await db.from("analyst_project_artifacts").select(columns).eq("analyst_slug", persona).eq("is_active", true).order("display_order", { ascending: true }),
    "artifacts",
  ) as unknown as ProjectArtifactRow[];
  return rows.map((r) => ({
    key: r.artifact_key,
    persona: r.analyst_slug,
    type: r.artifact_type,
    title: r.title,
    description: r.description,
    sourcePath: r.source_path,
    format: r.content_format,
    content: r.content ?? "",
    order: r.display_order,
    updatedAt: r.updated_at,
  }));
}

export async function getArtifact(db: Db, key: string): Promise<Artifact | null> {
  const rows = unwrap(await db.from("analyst_project_artifacts").select("*").eq("artifact_key", key).limit(1), "artifact") as ProjectArtifactRow[];
  const r = rows[0];
  if (!r) return null;
  return {
    key: r.artifact_key,
    persona: r.analyst_slug,
    type: r.artifact_type,
    title: r.title,
    description: r.description,
    sourcePath: r.source_path,
    format: r.content_format,
    content: r.content ?? "",
    order: r.display_order,
    updatedAt: r.updated_at,
  };
}

export async function getPromptTemplates(db: Db): Promise<PromptTemplateRow[]> {
  return unwrap(await db.from("prompt_templates").select("*").eq("is_active", true).order("kind").order("channel"), "prompt templates") as PromptTemplateRow[];
}

export type Ranking = {
  id: string;
  persona: string;
  theme: string | null;
  asOf: string;
  tier: string;
  rank: number;
  ticker: string;
  companyName: string | null;
  memoId: string | null;
  rationale: string | null;
  caveat: string | null;
  sourceSystem: string | null;
  composite: number | null;
  latestVerdict: string | null;
  memoIsLatest: boolean;
  ageDays: number | null;
};

export async function getLatestRankings(db: Db, persona?: string): Promise<Ranking[]> {
  let q = db.from("latest_analyst_top_rankings").select("*").order("analyst_slug").order("tier").order("rank").limit(400);
  if (persona) q = q.eq("analyst_slug", persona);
  const rows = unwrap(await q, "rankings") as TopRankingRow[];
  return rows.map((r) => {
    const scores = toRecord(r.scores);
    return {
      id: r.id,
      persona: r.analyst_slug,
      theme: r.theme_slug,
      asOf: r.as_of,
      tier: r.tier,
      rank: r.rank,
      ticker: r.ticker,
      companyName: r.company_name,
      memoId: r.memo_id,
      rationale: r.rationale,
      caveat: r.primary_caveat,
      sourceSystem: r.source_system,
      composite: num(scores.composite_score),
      latestVerdict: r.latest_memo_verdict,
      memoIsLatest: Boolean(r.memo_is_latest),
      ageDays: r.snapshot_age_days,
    };
  });
}
