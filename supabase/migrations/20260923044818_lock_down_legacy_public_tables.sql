-- These legacy, staging, cache, and backup tables are not tenant-scoped.
-- Keep them private to trusted server-side/service-role callers. The app's
-- password gate is verified in the server before underwritingReadClient is
-- constructed; it is not a Supabase Auth identity suitable for RLS policies.

begin;

revoke all privileges on table
  public._pwv_de_sidecheck_20260812,
  public._sony_stage_d5d00a,
  public._stage_hims_6ccc1c,
  public._stg_aspi_3aaaac,
  public.analyst_memo_health_cache,
  public.analyst_memo_pwv_form_a_restatement_audit,
  public.analyst_memo_pwv_form_c_restatement_audit,
  public.analyst_memo_pwv_form_de_restatement_audit,
  public.analyst_memo_refreshes,
  public.analyst_memos_archive_backup_20260811,
  public.analyst_memos_gates_backup_20260811,
  public.analyst_memos_pwv_form_a_backup_20260812,
  public.analyst_project_artifacts_backup_20260811_overlay,
  public.analyst_top_rankings_replaced_20260811,
  public.company_filing_cik_blocklist,
  public.differentiation_score_backup_20260813,
  public.hermes_schema_migrations,
  public.master_scores_v02_snapshot_20260813,
  public.pwv_vacuous_basis_cohort_20260811,
  public.ranking_channels,
  public.research_queue_extinct_backup_20260823,
  public.research_queue_prune_backup_20260811,
  public.retired_securities,
  public.stg_amsc_0d9ff5,
  public.stg_elv_6779c6,
  public.stm_stage_5c21f9
from public, anon, authenticated;

alter table public._pwv_de_sidecheck_20260812 enable row level security;
alter table public._sony_stage_d5d00a enable row level security;
alter table public._stage_hims_6ccc1c enable row level security;
alter table public._stg_aspi_3aaaac enable row level security;
alter table public.analyst_memo_health_cache enable row level security;
alter table public.analyst_memo_pwv_form_a_restatement_audit enable row level security;
alter table public.analyst_memo_pwv_form_c_restatement_audit enable row level security;
alter table public.analyst_memo_pwv_form_de_restatement_audit enable row level security;
alter table public.analyst_memo_refreshes enable row level security;
alter table public.analyst_memos_archive_backup_20260811 enable row level security;
alter table public.analyst_memos_gates_backup_20260811 enable row level security;
alter table public.analyst_memos_pwv_form_a_backup_20260812 enable row level security;
alter table public.analyst_project_artifacts_backup_20260811_overlay enable row level security;
alter table public.analyst_top_rankings_replaced_20260811 enable row level security;
alter table public.company_filing_cik_blocklist enable row level security;
alter table public.differentiation_score_backup_20260813 enable row level security;
alter table public.hermes_schema_migrations enable row level security;
alter table public.master_scores_v02_snapshot_20260813 enable row level security;
alter table public.pwv_vacuous_basis_cohort_20260811 enable row level security;
alter table public.ranking_channels enable row level security;
alter table public.research_queue_extinct_backup_20260823 enable row level security;
alter table public.research_queue_prune_backup_20260811 enable row level security;
alter table public.retired_securities enable row level security;
alter table public.stg_amsc_0d9ff5 enable row level security;
alter table public.stg_elv_6779c6 enable row level security;
alter table public.stm_stage_5c21f9 enable row level security;

-- These views transitively read the protected tables. Invoker security makes
-- their underlying table grants/RLS apply to the caller; only service_role
-- retains the required grants for protected server-side app paths.
alter view public.active_universe_tickers set (security_invoker = true);
alter view public.analyst_memo_health set (security_invoker = true);
alter view public.analyst_memo_live set (security_invoker = true);
alter view public.analyst_rewrite_backlog set (security_invoker = true);
alter view public.analyst_top_ranking_staleness set (security_invoker = true);
alter view public.hermes_screener_universe set (security_invoker = true);
alter view public.latest_analyst_top_rankings set (security_invoker = true);
alter view public.reunderwrite_candidates set (security_invoker = true);

revoke all privileges on table
  public.active_universe_tickers,
  public.analyst_memo_health,
  public.analyst_memo_live,
  public.analyst_rewrite_backlog,
  public.analyst_top_ranking_staleness,
  public.hermes_screener_universe,
  public.latest_analyst_top_rankings,
  public.reunderwrite_candidates
from public, anon, authenticated;

-- The health refresh RPC is SECURITY DEFINER and can mutate its cache table;
-- it must not remain callable through PostgREST by anonymous/authenticated roles.
revoke all privileges on function public.fn_analyst_memo_health_cache_sync()
  from public, anon, authenticated;
grant execute on function public.fn_analyst_memo_health_cache_sync()
  to service_role;

revoke all privileges on function public.refresh_analyst_memo_health(text)
  from public, anon, authenticated;
grant execute on function public.refresh_analyst_memo_health(text)
  to service_role;

commit;
