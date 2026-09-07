-- ============================================================================
-- Hermes hardening (follows Supabase security-advisor findings on the first two
-- migrations). Idempotent.
--
--   1. hermes_* views run as SECURITY INVOKER. Every base relation they read
--      (analyst_memos, analyst_personas, analyst_project_artifacts,
--      investment_companies, ibkr_positions, ibkr_nav_history, mission_benchmark,
--      master_decisions, master_outcomes, tracked_13f_*, analyst_memo_health_cache,
--      hermes_notes, hermes_knowledge …) already grants SELECT to anon /
--      authenticated through its own RLS policies, so behaviour for the app is
--      unchanged; the views simply stop being a privilege-escalation path.
--   2. Every hermes_* function pins search_path so it cannot be hijacked by a
--      caller-controlled schema.
-- ============================================================================

do $$
declare v text;
begin
  foreach v in array array[
    'hermes_research_stream', 'hermes_positions_latest', 'hermes_screener_universe',
    'hermes_benchmark_series', 'hermes_guru_crossover', 'hermes_decision_scorecard',
    'hermes_persona_catalog'
  ] loop
    if exists (select 1 from pg_class c where c.relname = v and c.relnamespace = 'public'::regnamespace and c.relkind = 'v') then
      execute format('alter view public.%I set (security_invoker = on)', v);
    end if;
  end loop;
end $$;

alter function public.hermes_set_updated_at() set search_path = public;
alter function public.hermes_bare_symbol(text) set search_path = public;
alter function public.hermes_join_text(text[]) set search_path = public;
alter function public.hermes_ideas_audit() set search_path = public;
alter function public.hermes_activity_from_idea_event() set search_path = public;
alter function public.hermes_activity_from_note() set search_path = public;
alter function public.hermes_activity_from_trade() set search_path = public;
alter function public.hermes_search_research(text, integer) set search_path = public;
