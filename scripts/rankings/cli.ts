import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { rankingDraftSchema, rankingPublicationSchema, rankForecasts, assertSharedForecastConsistency, buildSleeveRanking, latestRankingPublication } from "../../src/lib/qqq-rankings";
import { canonicalizeRankingSecurities } from "../../src/lib/ranking-securities";
import { verifyRankingAuthorities, type RankingAuthority } from "../../src/lib/ranking-authority";

const [command, ...args] = process.argv.slice(2);
const file = args[0] && !args[0].startsWith("--") ? args.shift() : undefined;
const hash = (draft: unknown) => createHash("sha256").update(JSON.stringify(draft)).digest("hex");
const read = (name: string) => JSON.parse(fs.readFileSync(name, "utf8"));
function main() {
  if (command === "schema") {
    console.log(JSON.stringify(z.toJSONSchema(rankingDraftSchema), null, 2));
    return;
  }
  if (command === "validate") {
    if (!file) throw new Error("Draft JSON file required");
    const draft = rankingDraftSchema.parse(read(file));
    const canonicalIndex = args.indexOf("--canonical");
    if (canonicalIndex >= 0) {
      const output = args[canonicalIndex + 1];
      if (!output) throw new Error("--canonical requires an output path");
      fs.writeFileSync(output, JSON.stringify(draft), { mode: 0o600 });
    }
    const ranked = rankForecasts(draft.forecasts);
    console.log(JSON.stringify({ sleeve: draft.sleeve, contentHash: hash(draft), coverage: `${ranked.length}/50`,
      rows: ranked.map((r) => ({ rank: r.rank, ticker: r.ticker, probabilityBeatQqq: r.probabilityBeatQqq })) }, null, 2));
    return;
  }
  if (command === "verify" || command === "export-authorities") {
    const raw = read(file ?? "src/lib/reviewed-qqq-rankings.json");
    if (!Array.isArray(raw)) throw new Error("Publications must be an array");
    const publications = raw.map((p: unknown) => rankingPublicationSchema.parse(p));
    const securityIndex = args.indexOf("--securities");
    const securities = read(securityIndex >= 0 ? args[securityIndex + 1]! : "src/lib/reviewed-ranking-securities.json");
    for (const p of publications) {
      p.draft = canonicalizeRankingSecurities(p.draft, securities);
      for (const submission of p.author.submissions) {
        const forecast = p.draft.forecasts.find((f) => f.securityId === submission.securityId)!;
        if (hash({ ...p.draft, sleeve: "core", forecasts: [forecast] }) !== submission.contentHash)
          throw new Error("Forecast differs from its exact-content author submission");
      }
      if (hash(p.draft) !== p.review.contentHash) throw new Error("Publication differs from exact reviewed content");
    }
    assertSharedForecastConsistency(publications);
    if (command === "export-authorities") {
      const boardIndex = args.indexOf("--board");
      const board = boardIndex >= 0 ? args[boardIndex + 1] : undefined;
      const outputIndex = args.indexOf("--output");
      const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
      if (!board || !output || !file) throw new Error("export-authorities requires PUBLICATIONS --board BOARD --output OUTPUT");
      const authorities: RankingAuthority[] = [];
      for (const p of publications) for (const record of [...p.author.submissions, p.review, p.approval]) {
        const call = (verb: string) => JSON.parse(execFileSync("hermes", ["kanban", "--board", board, verb, record.taskId, "--json"], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024 }));
        const shown = call("show");
        const runs = call("runs") as { id: number; profile: string; status: string; outcome: string; started_at: number; ended_at: number; metadata: Record<string, unknown> | null }[];
        const run = runs.find((r) => String(r.id) === record.runId);
        const decision = "verdict" in record ? record.verdict : record.decision;
        const metadata = run?.metadata;
        const accepted = [metadata, ...(Array.isArray(metadata?.publications) ? metadata.publications as Record<string, unknown>[] : [])]
          .some((m) => (m?.contentHash ?? m?.content_hash) === record.contentHash && (m?.verdict ?? m?.decision) === decision);
        if (shown.task.id !== record.taskId || shown.task.assignee !== record.actor || shown.task.status !== "done" ||
          !run || run.profile !== record.actor || run.status !== "done" || run.outcome !== "completed" ||
          !accepted)
          throw new Error(`Actual Hermes task/run has not accepted this exact content: ${record.taskId}`);
        authorities.push({ taskId: record.taskId, runId: record.runId, actor: record.actor, taskStatus: "done", runStatus: "done", runOutcome: "completed",
          startedAt: run.started_at, endedAt: run.ended_at, recordedAt: new Date(run.ended_at * 1000).toISOString(), contentHash: record.contentHash, decision });
      }
      verifyRankingAuthorities(publications, authorities);
      fs.writeFileSync(output, JSON.stringify(authorities, null, 2) + "\n", { mode: 0o600 });
      console.log(JSON.stringify({ exportedAuthorities: authorities.length }));
      return;
    }
    const authorityIndex = args.indexOf("--authorities");
    verifyRankingAuthorities(publications, read(authorityIndex >= 0 ? args[authorityIndex + 1]! : "src/lib/reviewed-ranking-authorities.json"));
    if (args.includes("--require-full") && (["core", "ai-regime"] as const).some((sleeve) => buildSleeveRanking(sleeve, publications).rows.length !== 50))
      throw new Error("Release requires 50 fresh accepted forecasts in each sleeve");
    console.log(JSON.stringify({ verifiedPublications: publications.length,
      sleeves: ["core", "ai-regime"].map((sleeve) => {
        const latest = latestRankingPublication(sleeve as "core" | "ai-regime", publications);
        return { sleeve, asOf: latest?.draft.asOf ?? null, forecasts: latest?.draft.forecasts.length ?? 0 };
      }) }, null, 2));
    return;
  }
  throw new Error("Commands: schema | validate DRAFT [--canonical OUTPUT] | verify [PUBLICATIONS] [--authorities FILE] [--require-full] | export-authorities PUBLICATIONS --board BOARD --output FILE");
}
try { main(); } catch (error) {
  console.error(error instanceof z.ZodError ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n") : error instanceof Error ? error.message : "Ranking validation failed");
  process.exitCode = 1;
}
