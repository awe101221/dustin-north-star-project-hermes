-- ============================================================================
-- Dustin North Star Project Hermes — read surfaces (views + search RPC)
-- Target: Supabase project INVESTING-BRAIN-AG (cwiaqczpifnxxcucqwvr)
--
-- Views join the legacy Awe Capital tables with the hermes_* extension so the
-- app (and agents) read one clean surface instead of re-implementing joins.
-- All views are plain (owner-privileged) views; underlying tables already
-- expose anon SELECT, so this widens nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- hermes_research_stream — every complete legacy memo + every Hermes note
-- is_latest flags the newest memo per (persona, ticker) so the default stream
-- de-duplicates while timeline mode can show the full history.
-- ----------------------------------------------------------------------------
create or replace view public.hermes_research_stream as
with memos as (
  select
    m.id,
    m.analyst_slug,
    m.ticker,
    m.company_name,
    m.verdict,
    m.source_system,
    m.expected_irr,
    m.downside_drawdown_pct,
    m.current_price,
    m.buy_consideration_price,
    m.reunderwrite_trigger_price,
    m.probability_weighted_value,
    m.valuation ->> 'chassis' as chassis,
    m.memo_markdown,
    m.analyzed_at,
    m.created_at,
    m.updated_at,
    row_number() over (
      partition by m.analyst_slug, upper(m.ticker)
      order by m.analyzed_at desc, m.created_at desc
    ) = 1 as is_latest
  from public.analyst_memos m
  where m.status = 'complete'
)
select
  id,
  'memo'::text as kind,
  'analyst_memos'::text as source_table,
  coalesce(company_name, ticker) as title,
  ticker,
  company_name,
  analyst_slug as persona_slug,
  verdict,
  source_system,
  expected_irr,
  downside_drawdown_pct,
  current_price,
  buy_consideration_price,
  reunderwrite_trigger_price,
  probability_weighted_value,
  array_remove(array[analyst_slug, lower(verdict), chassis], null)::text[] as tags,
  left(memo_markdown, 480) as excerpt,
  length(memo_markdown) as body_length,
  is_latest,
  analyzed_at as occurred_at,
  created_at,
  updated_at
from memos
union all
select
  n.id,
  n.kind,
  'hermes_notes'::text,
  n.title,
  n.tickers[1],
  null::text,
  n.persona_slug,
  n.verdict,
  n.source_system,
  null::numeric, null::numeric, null::numeric, null::numeric, null::numeric, null::numeric,
  n.tags,
  left(n.body_md, 480),
  length(n.body_md),
  true,
  n.occurred_at,
  n.created_at,
  n.updated_at
from public.hermes_notes n;

-- ----------------------------------------------------------------------------
-- hermes_search_research — ranked full-text search across memos + notes
-- Uses the same expression as idx_hermes_analyst_memos_fts so the GIN index hits.
-- ----------------------------------------------------------------------------
create or replace function public.hermes_search_research(q text, lim integer default 40)
returns table (
  id uuid,
  kind text,
  source_table text,
  title text,
  ticker text,
  persona_slug text,
  verdict text,
  occurred_at timestamptz,
  rank real,
  headline text
)
language sql
stable
as $$
  with query as (
    select websearch_to_tsquery('english', q) as tsq
  ),
  hits as (
    select
      m.id,
      'memo'::text as kind,
      'analyst_memos'::text as source_table,
      coalesce(m.company_name, m.ticker) as title,
      m.ticker,
      m.analyst_slug as persona_slug,
      m.verdict,
      m.analyzed_at as occurred_at,
      ts_rank(
        to_tsvector('english', coalesce(m.company_name, '') || ' ' || coalesce(m.ticker, '') || ' ' || coalesce(m.memo_markdown, '')),
        query.tsq
      ) as rank,
      left(m.memo_markdown, 20000) as body
    from public.analyst_memos m, query
    where m.status = 'complete'
      and to_tsvector('english', coalesce(m.company_name, '') || ' ' || coalesce(m.ticker, '') || ' ' || coalesce(m.memo_markdown, '')) @@ query.tsq
    union all
    select
      n.id, n.kind, 'hermes_notes'::text, n.title, n.tickers[1], n.persona_slug, n.verdict, n.occurred_at,
      ts_rank(n.search, query.tsq) as rank,
      left(n.body_md, 20000) as body
    from public.hermes_notes n, query
    where n.search @@ query.tsq
  ),
  top_hits as (
    select * from hits order by rank desc, occurred_at desc limit greatest(1, least(lim, 200))
  )
  select
    t.id, t.kind, t.source_table, t.title, t.ticker, t.persona_slug, t.verdict, t.occurred_at, t.rank,
    ts_headline('english', t.body, query.tsq, 'MaxFragments=2, MaxWords=22, MinWords=10, FragmentDelimiter= … ') as headline
  from top_hits t, query
  order by t.rank desc, t.occurred_at desc;
$$;

grant execute on function public.hermes_search_research(text, integer) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- hermes_positions_latest — latest IBKR snapshot enriched with company metadata
-- and the YTD attribution fields that only live in the raw statement payload.
-- ----------------------------------------------------------------------------
create or replace view public.hermes_positions_latest as
with latest as (
  select max(report_date) as report_date from public.ibkr_positions
)
select
  p.id,
  p.account,
  p.report_date,
  p.symbol,
  p.normalized_symbol,
  coalesce(p.normalized_symbol, c.ticker) as ticker,
  coalesce(c.company_name, p.symbol) as company_name,
  p.asset_type,
  p.currency,
  p.quantity,
  p.cost_price,
  p.close_price,
  p.cost_basis_usd,
  p.market_value_usd,
  p.unrealized_pnl,
  p.pct_of_nav,
  p.realized_st,
  p.realized_lt,
  p.dividends_ytd,
  p.ytd_roi_pct,
  nullif(p.raw ->> 'ytd_m2m_pnl', '')::numeric as ytd_m2m_pnl,
  nullif(p.raw ->> 'total_pnl', '')::numeric as total_pnl_ytd,
  nullif(p.raw ->> 'options_pnl_realized', '')::numeric as options_pnl_realized,
  coalesce((p.raw ->> 'mkt_value_lagged')::boolean, false) as mkt_value_lagged,
  c.sector,
  c.industry,
  c.country,
  c.exchange
from public.ibkr_positions p
cross join latest
left join lateral (
  select ic.ticker, ic.company_name, ic.sector, ic.industry, ic.country, ic.exchange
  from public.investment_companies ic
  where ic.ticker = p.normalized_symbol
     or (p.normalized_symbol is null and upper(ic.symbol) = upper(p.symbol) and ic.exchange in ('NAS', 'NYSE', 'AMEX', 'OTCPK'))
  order by (ic.ticker = p.normalized_symbol) desc, ic.updated_at desc
  limit 1
) c on true
where p.report_date = latest.report_date;

-- ----------------------------------------------------------------------------
-- hermes_screener_universe — one row per latest memo (persona × ticker) with
-- live refresh, company metadata, master score, health and held weight.
-- ----------------------------------------------------------------------------
create or replace view public.hermes_screener_universe as
select
  l.memo_id,
  l.analyst_slug,
  l.ticker,
  public.hermes_bare_symbol(l.ticker) as symbol,
  l.company_name,
  l.verdict,
  l.analyzed_at,
  l.memo_age_days,
  l.memo_price,
  l.memo_expected_irr,
  l.memo_pwv,
  l.buy_consideration_price,
  l.reunderwrite_trigger_price,
  l.quote_price,
  l.quote_as_of,
  l.price_drift_pct,
  l.expected_irr_at_quote,
  l.probability_weighted_value_pv,
  l.margin_of_safety_ratio_pv,
  l.downside_drawdown_pct_at_quote,
  l.buy_pierced,
  l.trigger_pierced,
  l.spawn_recommended,
  m.downside_drawdown_pct,
  m.math_must_work,
  m.horizon_years,
  m.source_system,
  m.valuation ->> 'chassis' as chassis,
  coalesce(
    nullif(m.valuation ->> 'market_cap_mm', '')::numeric,
    nullif(m.valuation ->> 'market_cap_m', '')::numeric,
    nullif(m.valuation ->> 'market_cap_usd_mm', '')::numeric,
    nullif(m.valuation ->> 'market_cap_musd', '')::numeric,
    nullif(m.valuation ->> 'market_cap_b', '')::numeric * 1000
  ) as market_cap_mm,
  c.sector,
  c.industry,
  c.country,
  s.mcs,
  s.rank as mcs_rank,
  s.brad_score,
  s.pabrai_score,
  s.public_vc_score,
  h.health,
  h.is_rankable,
  h.has_blocker,
  h.issue_count,
  pos.pct_of_nav as held_weight,
  pos.market_value_usd as held_value
from public.analyst_memo_live l
join public.analyst_memos m on m.id = l.memo_id
left join public.investment_companies c on c.ticker = m.ticker
left join public.latest_master_scores s on upper(s.ticker) = upper(m.ticker)
left join public.analyst_memo_health_cache h on h.id = m.id
left join lateral (
  select p.pct_of_nav, p.market_value_usd
  from public.ibkr_positions p
  where p.report_date = (select max(report_date) from public.ibkr_positions)
    and (p.normalized_symbol = m.ticker or upper(p.symbol) = public.hermes_bare_symbol(m.ticker))
  order by p.market_value_usd desc nulls last
  limit 1
) pos on true;

-- ----------------------------------------------------------------------------
-- hermes_benchmark_series — mission scoreboard joined with statement NAV/TWR
-- ----------------------------------------------------------------------------
create or replace view public.hermes_benchmark_series as
select
  b.as_of,
  b.portfolio_nav,
  b.portfolio_index,
  b.qqq_adj_close,
  b.qqq_index,
  b.cumulative_alpha,
  b.annualized_alpha,
  b.net_external_flows,
  n.ytd_return_pct as portfolio_ytd_twr,
  n.cash_balance,
  b.notes
from public.mission_benchmark b
left join public.ibkr_nav_history n on n.snapshot_date = b.as_of
order by b.as_of;

-- ----------------------------------------------------------------------------
-- hermes_guru_crossover — 13F buy/sell crowding per ticker for the latest
-- two reporting quarters (guru / insider module)
-- ----------------------------------------------------------------------------
create or replace view public.hermes_guru_crossover as
select
  a.ticker_symbol,
  max(a.issuer_name) as issuer_name,
  a.report_date,
  count(distinct a.investor_id) filter (where a.direction = 'buy') as buyers,
  count(distinct a.investor_id) filter (where a.direction = 'sell') as sellers,
  count(distinct a.investor_id) filter (where a.action = 'New Buy') as new_buyers,
  count(distinct a.investor_id) filter (where a.action = 'Sold Out') as sold_out,
  sum(a.value_reported) filter (where a.direction = 'buy') as buy_value,
  sum(a.value_reported) filter (where a.direction = 'sell') as sell_value,
  array_agg(distinct i.display_name) filter (where a.direction = 'buy') as buyer_names,
  array_agg(distinct i.display_name) filter (where a.direction = 'sell') as seller_names
from public.tracked_13f_activity a
join public.tracked_13f_investors i on i.id = a.investor_id
where a.ticker_symbol is not null
  and a.report_date >= (select max(report_date) from public.tracked_13f_activity) - interval '3 months'
group by a.ticker_symbol, a.report_date;

-- ----------------------------------------------------------------------------
-- hermes_decision_scorecard — every auto-detected decision with its latest
-- graded outcome vs QQQ
-- ----------------------------------------------------------------------------
create or replace view public.hermes_decision_scorecard as
select
  d.id as decision_id,
  d.ticker,
  d.decision_date,
  d.verdict,
  d.price,
  d.quantity,
  d.rationale,
  d.recommendation_id,
  o.evaluation_date,
  o.current_price,
  o.realized_return_pct,
  o.annualized_return_pct,
  o.qqq_return_pct,
  o.alpha_pct,
  o.thesis_status
from public.master_decisions d
left join lateral (
  select *
  from public.master_outcomes mo
  where mo.decision_id = d.id
  order by mo.evaluation_date desc
  limit 1
) o on true;

-- ----------------------------------------------------------------------------
-- hermes_persona_catalog — personas + artifact/memo counts
-- ----------------------------------------------------------------------------
create or replace view public.hermes_persona_catalog as
select
  p.slug,
  p.display_name,
  p.framework_name,
  p.framework_version,
  p.description,
  p.instruction_path,
  p.is_active,
  p.metadata ->> 'headline' as headline,
  p.metadata ->> 'persona_prompt' as persona_prompt,
  p.metadata ->> 'output_route' as output_route,
  (p.metadata ->> 'master_blend_weight')::numeric as master_blend_weight,
  p.metadata,
  p.created_at,
  p.updated_at,
  (select count(*) from public.analyst_project_artifacts a where a.analyst_slug = p.slug and a.is_active) as artifact_count,
  (select count(*) from public.analyst_memos m where m.analyst_slug = p.slug and m.status = 'complete') as memo_count,
  (select count(distinct upper(m.ticker)) from public.analyst_memos m where m.analyst_slug = p.slug and m.status = 'complete') as ticker_count,
  (select max(m.analyzed_at) from public.analyst_memos m where m.analyst_slug = p.slug) as last_memo_at,
  (select count(*) from public.hermes_knowledge k where k.persona_slug = p.slug and k.is_active) as knowledge_count
from public.analyst_personas p;

grant select on
  public.hermes_research_stream,
  public.hermes_positions_latest,
  public.hermes_screener_universe,
  public.hermes_benchmark_series,
  public.hermes_guru_crossover,
  public.hermes_decision_scorecard,
  public.hermes_persona_catalog
to anon, authenticated, service_role;
