# Claude Fable 5.1 Kickoff Prompt: Dustin North Star Project Hermes

---

**Mission:**  
You are building the single best quant/investor dashboard app ever made — "Dustin North Star Project Hermes." The persona: Jane Street-caliber quant PM, obsessed with beating QQQ for the next decade. Quality, speed, and UI/UX matter as much as real alpha.

## Key Requirements

- **Stack:** Next.js 14+ (Vercel), Tailwind CSS, shadcn/ui, Radix primitives. All TypeScript. Modular, well-documented code.  
- **Design:** Elite, high-contrast dark mode. Data-dense, custom visuals—no templates. Should feel like a Jane Street/Citadel PM terminal. 
- **Branding:**
    - App Name: "Dustin North Star Project Hermes"
    - Subtle "Hermes"/mercantile symbolism allowed, never overdone.

## Data, Interop, and Migration

- **Database:** Use and extend existing Awe Capital Supabase (Postgres) for all storage (two-way sync, live updates).
- **Migration/Reuse:**
    - Extract **every useful module and artifact** from the original awe-capital.vercel.app, especially memos, analyst persona content, and any proven research, decision, and knowledge systems. Do **not** carry over inefficiencies or legacy flaws—refactor and streamline for the new mission.
    - Integrate and communicate with the newer Dustin Awe Capital repo: collaborate, share state, and leverage any relevant code features.
    - Build net-new architecture wherever the mission demands something better, more efficient, or strategically superior. Always favor outcome over tradition; optimize for alpha, compounding, and workflow.

## Core Features (MVP Must Ship)

1. **Portfolio Hub:**
    - Live dashboard: exposures, P&L, sleeves. QQQ benchmark. Trade log, alpha attribution.
2. **Research, Memos & Analyst Engine:**
    - Stream and curate all research/memos culled from the old app (ensure import/migration!).
    - Markdown-first editor. Analyst/PM persona architecture editable and extensible. Tagging, search, ticker/thematic linking. Timeline/journal mode.
3. **Idea Pipeline & Ticketing:**
    - Stages: Sourcing, Diligence, Live, Monitor, Archive.  
    - Kanban drag/drop. Tightly coupled to research/memos. Risk, conviction, sizing, and workflow tools.
4. **Quant Tools / Alpha Module:**
    - Quant screeners, backtests (tie to Supabase, make DB extensible for future AI agent use)
    - Guru/insider, news, and alternative data modules. 
5. **Mandate, North Star & Stats:**
    - Always-accessible “North Star”: benchmarks, rules, stats, KPIs, and mandate summary. Visualize vs QQQ, year-over-year alpha, rolling Sharpe/Sortino stats.

## UX/Design Requirements
- Instant response feel (optimistic UI, SWR/react-query)
- Keyboard shortcuts and command palette (like Raycast/Linear)
- Subtle branded transitions/animations
- Analyst/trade presentation toggle (one click hides all live positions)
- Modular, extensible, with “quant PM playground” energy

## Code Quality / DevEx
- All TypeScript, clear interfaces/types
- Modular, extensible, idiomatic (no starter-kits/templates)
- Storybook/playground ready
- Next.js App Router, SSG/ISR, optionally next-auth
- All env/secret management via Vercel best practices
- Top-level README documenting architecture, how to extend features, and agent integration notes.

## Integration
- Live Supabase sync (reference schema, then implement bi-directional sync).  
- Migrate ALL truly useful content from the old Awe Capital app and knowledge base.
- Interface and share modules/data as needed with the new Dustin Awe Capital project.
- Deploy-ready (Vercel), with onboarding README and .env.example.

**You are authorized to act as project lead, architect, quant PM, and knowledge engineer. Your output must be suitable for a Fortune 100 hedge fund CTO — elegant, readable, and built for high iteration.**

---

**GOAL:**
> _Create "Dustin North Star Project Hermes"—the ultimate quant PM dashboard (Next.js + TypeScript + shadcn/ui/Tailwind + Supabase sync), elite UI/UX, all critical features from above. Deliver a ready-to-deploy repo with code, modules, data migration scripts, and onboarding. Migrate everything useful from the original Awe Capital while fixing all inefficiencies. Make it elegant, fast, extensible, and genuinely Hermes-grade._

---
