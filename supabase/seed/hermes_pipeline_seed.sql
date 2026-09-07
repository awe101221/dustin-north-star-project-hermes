-- ============================================================================
-- Hermes Idea Pipeline seed (pure SQL twin of scripts/seed/seed-pipeline.ts)
--
-- Run it from the Supabase SQL editor (or any SQL console with write access) when
-- no service-role key is at hand. Idempotent: it only creates cards for tickers
-- that have no active (non-archive) card yet; human edits are never overwritten.
--
--   monitor   — open master recommendations (TRIM/EXIT…) + latest trigger alerts
--   live      — held names (≥ 0.75% of NAV) that have a latest memo
--   diligence — legacy North Star "ranked" seeds + un-held BUY/BUY-MORE memos ≥ 20% IRR
--   sourcing  — legacy North Star watchlist seeds + top-20 master-conviction names
--
-- The 20 legacy seeds were migrated verbatim from
-- awe-capital/src/data/northStarCompanies.ts (thesis / why-beat-QQQ / evidence /
-- falsifier / next action). Re-run scripts/seed/seed-pipeline.ts to refresh them.
-- ============================================================================
with seeds(ticker, name, category, score, thesis, why_beat_qqq, evidence_needed, falsifier, next_action, list) as (
  values
  ($s$TSM$s$, $s$Taiwan Semiconductor Manufacturing$s$, $s$ai_bottleneck$s$, 94, $s$Dominant leading-edge foundry and CoWoS capacity owner behind the AI accelerator supply chain.$s$, $s$TSM can beat QQQ if scarce foundry and advanced-packaging economics compound faster than the broad Nasdaq-100 basket already discounts.$s$, $s$Track CoWoS capacity, leading-edge wafer demand, customer concentration, gross margin durability, capex ROI, and geopolitical risk premium.$s$, $s$QQQ is better if foundry pricing power fades, geopolitical risk overwhelms returns, or AI accelerator demand normalizes faster than capacity plans.$s$, $s$Refresh source spine and compare valuation against AI capex durability.$s$, $s$ranked$s$),
  ($s$AMKR$s$, $s$Amkor Technology$s$, $s$ai_bottleneck$s$, 90, $s$OSAT scale and advanced packaging capacity offer less-obvious AI infrastructure exposure.$s$, $s$AMKR can beat QQQ if package complexity and outsourced advanced packaging convert into premium growth without paying mega-cap AI multiples.$s$, $s$Validate advanced packaging mix, capex returns, customer ramps, margins, and whether AI package demand is durable rather than cyclical.$s$, $s$QQQ is better if Amkor remains a lower-margin cyclical capacity provider or if advanced packaging economics accrue mainly to TSM and equipment suppliers.$s$, $s$Build OSAT economics memo and rank against FORM/CAMT/ONTO.$s$, $s$ranked$s$),
  ($s$MU$s$, $s$Micron Technology$s$, $s$ai_bottleneck$s$, 88, $s$HBM and high-end memory are critical for AI training/inference utilization.$s$, $s$MU can beat QQQ if HBM structurally improves memory-cycle profitability and the market underestimates multi-year pricing/mix durability.$s$, $s$Refresh HBM supply agreements, pricing, capex, inventory, gross margins, and AI mix versus commodity DRAM cyclicality.$s$, $s$QQQ is better if HBM becomes just another memory cycle, supply catches demand, or peak earnings are overcapitalized.$s$, $s$Compare HBM cycle math to QQQ mega-cap AI exposure.$s$, $s$ranked$s$),
  ($s$GEV$s$, $s$GE Vernova$s$, $s$ai_bottleneck$s$, 86, $s$Grid, gas power, and electrification backlog can benefit from data-center load growth.$s$, $s$GEV can beat QQQ if AI-driven power scarcity creates a durable equipment/service cycle not fully represented in Nasdaq-heavy benchmark exposure.$s$, $s$Monitor backlog, data-center order mix, gas turbine demand, grid margins, service attach, and utility interconnection constraints.$s$, $s$QQQ is better if power demand is overbuilt, regulatory constraints slow conversion, or valuation already discounts the full grid cycle.$s$, $s$Track power backlog and compare to VRT/ETN/PWR alternatives.$s$, $s$ranked$s$),
  ($s$GOOGL$s$, $s$Alphabet$s$, $s$platform$s$, 84, $s$Search, YouTube, Cloud, Gemini, TPUs, and data distribution create one of the strongest AI platform positions.$s$, $s$GOOGL can beat QQQ if AI improves search/cloud economics and starting valuation remains less demanding than other mega-cap AI platform peers.$s$, $s$Track search monetization, Cloud AI growth, capex intensity, TPU economics, margin trajectory, and competitive AI answer-engine pressure.$s$, $s$QQQ is better if AI search disruption compresses margins or if Alphabet merely tracks the same mega-cap exposure already embedded in QQQ.$s$, $s$Maintain relative mega-cap scorecard versus MSFT/AMZN/META.$s$, $s$ranked$s$),
  ($s$META$s$, $s$Meta Platforms$s$, $s$platform$s$, 83, $s$AI improves ads, engagement, content generation, and open-model infrastructure while core cash flow funds compute.$s$, $s$META can beat QQQ if AI-driven ad efficiency and model leverage compound faster than capex and Reality Labs drag consume returns.$s$, $s$Follow AI ad tools, engagement, capex/FCF conversion, open model adoption, and operating discipline.$s$, $s$QQQ is better if AI capex dilutes FCF without incremental monetization or if regulatory/product risk re-rates the core business.$s$, $s$Review capex-to-revenue proof each quarter.$s$, $s$ranked$s$),
  ($s$APPF$s$, $s$AppFolio$s$, $s$public_vc$s$, 81, $s$Vertical SaaS with workflow data and AI automation potential in property management.$s$, $s$APPF can beat QQQ if vertical workflow ownership and AI automation expand ARPU/retention in a market QQQ only owns indirectly.$s$, $s$Validate NRR, AI product attach, vertical market penetration, margin expansion, and whether valuation leaves 3–10x style upside.$s$, $s$QQQ is better if vertical AI is a feature not a paid product, growth slows, or valuation leaves too little asymmetric upside.$s$, $s$Source-harden Public VC memo and compare against other vertical software names.$s$, $s$ranked$s$),
  ($s$FORM$s$, $s$FormFactor$s$, $s$public_vc$s$, 80, $s$Probe cards and wafer test complexity can become a less-obvious AI hardware bottleneck.$s$, $s$FORM can beat QQQ if advanced packaging, HBM, and AI semiconductor complexity drive durable test intensity before the market prices it as an AI bottleneck.$s$, $s$Check order mix, customer concentration, HBM/advanced packaging exposure, margins, and cyclical versus secular demand.$s$, $s$QQQ is better if FormFactor is mainly a semicap cycle rebound without durable AI-specific growth or operating leverage.$s$, $s$Run primary-source Public VC evidence packet.$s$, $s$ranked$s$),
  ($s$VRT$s$, $s$Vertiv$s$, $s$ai_bottleneck$s$, 78, $s$Critical power and cooling systems are direct beneficiaries of high-density AI data centers.$s$, $s$VRT can beat QQQ if power/cooling backlog compounds through AI data-center density faster than benchmark mega-cap exposure captures.$s$, $s$Track backlog quality, liquid-cooling adoption, margins, competitive pricing, and hyperscaler/data-center order mix.$s$, $s$QQQ is better if valuation already capitalizes the full AI infrastructure cycle or if backlog/margins peak.$s$, $s$Keep in top list but require valuation discipline.$s$, $s$ranked$s$),
  ($s$PDD$s$, $s$PDD Holdings$s$, $s$compounder$s$, 76, $s$High-growth, high-margin commerce platform with global optionality and non-US benchmark diversification.$s$, $s$PDD can beat QQQ if execution and international growth offset China/regulatory risk and provide a non-Nasdaq compounding source.$s$, $s$Monitor revenue durability, take rates, Temu unit economics, cash generation, regulation, and competitive response.$s$, $s$QQQ is better if geopolitical/regulatory risk or subsidy-heavy growth overwhelms the valuation discount.$s$, $s$Re-underwrite China risk and Temu economics before promotion.$s$, $s$ranked$s$),
  ($s$RXRX$s$, $s$Recursion Pharmaceuticals$s$, $s$public_vc$s$, 72, $s$AI drug-discovery platform optionality with extreme upside if platform evidence compounds.$s$, $s$RXRX can beat QQQ only if platform biology produces repeatable milestones and partnerships that create venture-style upside absent from mega-cap QQQ.$s$, $s$Cash runway, dilution path, partnership milestones, clinical readouts, platform productivity, and customer/partner validation.$s$, $s$QQQ is better if dilution and clinical timelines consume the option before platform proof arrives.$s$, $s$Keep on watchlist until survival and milestone evidence clears.$s$, $s$watchlist$s$),
  ($s$SDGR$s$, $s$Schrödinger$s$, $s$public_vc$s$, 70, $s$Computational chemistry software plus pipeline economics creates hybrid software/biotech optionality.$s$, $s$SDGR can beat QQQ if software quality and partner validation create durable picks-and-shovels economics plus pipeline upside.$s$, $s$Software ARR quality, partner economics, cash discipline, pipeline catalysts, and gross-margin trajectory.$s$, $s$QQQ is better if the company remains neither high-quality software nor advantaged biotech platform.$s$, $s$Source-harden software/pipeline split.$s$, $s$watchlist$s$),
  ($s$PATH$s$, $s$UiPath$s$, $s$public_vc$s$, 69, $s$Derated automation platform that could become agentic workflow infrastructure or be disrupted by native agents.$s$, $s$PATH can beat QQQ if AI expands automation demand and UiPath retains process context that hyperscalers cannot easily bundle away.$s$, $s$ARR/NRR, AI attach, enterprise wins, margin discipline, agent product evidence, and churn trends.$s$, $s$QQQ is better if RPA value is commoditized by native agents and systems of record.$s$, $s$Watch for AI monetization proof before ranking.$s$, $s$watchlist$s$),
  ($s$OKTA$s$, $s$Okta$s$, $s$platform$s$, 68, $s$Identity and permissions could become essential control planes for enterprise agents.$s$, $s$OKTA can beat QQQ if agent identity creates a new urgency layer while valuation remains below mega-cap software peers.$s$, $s$Agent identity product traction, NRR, breach recovery, enterprise expansion, and competitive position.$s$, $s$QQQ is better if identity is bundled by larger platforms or Okta cannot regain durable growth.$s$, $s$Track agent identity evidence and customer adoption.$s$, $s$watchlist$s$),
  ($s$CAMT$s$, $s$Camtek$s$, $s$public_vc$s$, 67, $s$Advanced packaging inspection/metrology offers high-purity AI hardware bottleneck exposure.$s$, $s$CAMT can beat QQQ if inspection intensity rises with HBM/advanced packaging and the company keeps premium growth/margins.$s$, $s$Backlog, order mix, customer concentration, HBM exposure, valuation, and margin durability.$s$, $s$QQQ is better if current valuation already prices the bottleneck or growth is just semi-cycle beta.$s$, $s$Compare with FORM/ONTO before ranking.$s$, $s$watchlist$s$),
  ($s$ONTO$s$, $s$Onto Innovation$s$, $s$ai_bottleneck$s$, 66, $s$Metrology and inspection exposure to advanced nodes and packaging.$s$, $s$ONTO can beat QQQ if process-control intensity compounds with advanced packaging and heterogeneous integration.$s$, $s$Segment exposure, advanced packaging growth, margins, order trends, and valuation versus semicap peers.$s$, $s$QQQ is better if metrology growth is cyclical or too broad to create differentiated AI alpha.$s$, $s$Source-harden AI packaging purity.$s$, $s$watchlist$s$),
  ($s$CRDO$s$, $s$Credo Technology$s$, $s$public_vc$s$, 65, $s$High-speed connectivity and active electrical cables can benefit from AI cluster bandwidth demand.$s$, $s$CRDO can beat QQQ if AI networking bandwidth creates a durable category winner before it matures into benchmark exposure.$s$, $s$Customer concentration, design wins, gross margins, AI cluster attach, competition, and valuation risk.$s$, $s$QQQ is better if growth depends on too few customers or connectivity margins compress quickly.$s$, $s$Watch for diversified customer proof.$s$, $s$watchlist$s$),
  ($s$S$s$, $s$SentinelOne$s$, $s$public_vc$s$, 64, $s$AI security and autonomous SOC potential with derated software valuation.$s$, $s$S can beat QQQ if AI security urgency drives durable endpoint/cloud/data expansion not already captured by mega-cap platforms.$s$, $s$ARR, NRR, AI product monetization, win rates, margin path, and competitive pressure from CRWD/PANW/MSFT.$s$, $s$QQQ is better if security suites bundle away the standalone opportunity or growth remains inefficient.$s$, $s$Keep as watchlist until efficient growth improves.$s$, $s$watchlist$s$),
  ($s$MBLY$s$, $s$Mobileye$s$, $s$public_vc$s$, 62, $s$Autonomy data and ADAS distribution may be underappreciated after reset expectations.$s$, $s$MBLY can beat QQQ if autonomy data/distribution survives the auto-cycle reset and creates a differentiated physical-AI compounder.$s$, $s$OEM wins, production ramps, margins, inventory digestion, autonomy roadmap, and competitive position.$s$, $s$QQQ is better if OEM bargaining power and slow autonomy timelines trap returns.$s$, $s$Watch for production ramp and expectation reset evidence.$s$, $s$watchlist$s$),
  ($s$TWST$s$, $s$Twist Bioscience$s$, $s$public_vc$s$, 60, $s$Synthetic DNA infrastructure could benefit if AI accelerates bio design loops.$s$, $s$TWST can beat QQQ if AI-driven bio design translates into high-volume DNA demand and the unit economics finally support the platform.$s$, $s$Gross margin, cash burn, biopharma demand, data/storage optionality, customer retention, and dilution path.$s$, $s$QQQ is better if synthetic biology remains capital intensive with weak margins and repeated dilution.$s$, $s$Keep watchlisted pending self-funding evidence.$s$, $s$watchlist$s$)
),
companies as (
  select upper(symbol) as sym, ticker, company_name
  from public.investment_companies
  where symbol is not null
),
best_memo as (
  select distinct on (upper(symbol)) upper(symbol) as sym, memo_id, analyst_slug, ticker, company_name, verdict,
         memo_expected_irr, held_weight, reunderwrite_trigger_price, buy_consideration_price
  from public.hermes_screener_universe
  order by upper(symbol), memo_expected_irr desc nulls last
),
taken as (
  select upper(public.hermes_bare_symbol(ticker)) as sym
  from public.hermes_ideas
  where stage <> 'archive'
),
cand as (
  -- 1. monitor: open master recommendations (TRIM / EXIT / …)
  select 1 as prio, row_number() over (order by r.ticker) as rn,
         upper(public.hermes_bare_symbol(r.ticker)) as sym,
         case when r.ticker like '%:%' then upper(r.ticker) else coalesce(c.ticker, upper(r.ticker)) end as ticker,
         coalesce(m.company_name, c.company_name) as company_name,
         'monitor'::text as stage,
         coalesce(r.memo_refs->0->>'lens', m.analyst_slug) as persona_slug,
         coalesce(case when (r.memo_refs->0->>'memo_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r.memo_refs->0->>'memo_id')::uuid end, m.memo_id) as memo_id,
         null::text as thesis, null::text as why_beat_qqq, null::text as falsifier, null::text as catalyst,
         r.action || ': ' || coalesce(r.size_suggestion, 'review') as next_action,
         null::smallint as conviction,
         r.current_weight_pct::numeric as current_weight_pct,
         array['master-recommendation', lower(r.action)]::text[] as tags,
         'master_recommendation'::text as source,
         jsonb_build_object('recommendation_id', r.id, 'action', r.action) as source_ref
  from public.open_master_recommendations r
  left join companies c on c.sym = upper(public.hermes_bare_symbol(r.ticker))
  left join best_memo m on m.sym = upper(public.hermes_bare_symbol(r.ticker))

  union all
  -- 2. monitor: latest trigger alert per ticker (60 most recent alerts)
  select 2, row_number() over (order by a.as_of desc),
         upper(public.hermes_bare_symbol(a.ticker)),
         case when a.ticker like '%:%' then upper(a.ticker) else coalesce(c.ticker, upper(a.ticker)) end,
         m.company_name,
         'monitor',
         a.analyst_slug,
         coalesce(a.memo_id, m.memo_id),
         null, null, null,
         'Trigger ' || replace(a.alert_type, '_', ' '),
         a.note,
         null::smallint,
         m.held_weight::numeric,
         array['trigger', a.alert_type]::text[],
         'master_alert',
         jsonb_build_object('alert_type', a.alert_type, 'as_of', a.as_of)
  from (
    select distinct on (ticker) ticker, alert_type, note, analyst_slug, memo_id, as_of
    from (select * from public.master_alerts order by as_of desc limit 60) recent
    order by ticker, as_of desc
  ) a
  left join companies c on c.sym = upper(public.hermes_bare_symbol(a.ticker))
  left join best_memo m on m.sym = upper(public.hermes_bare_symbol(a.ticker))

  union all
  -- 3. live: held ≥ 0.75% of NAV with a latest memo
  select 3, row_number() over (order by p.market_value_usd desc nulls last),
         upper(p.symbol), m.ticker, p.company_name, 'live', m.analyst_slug, m.memo_id,
         null, null, null, null,
         case when m.reunderwrite_trigger_price is not null then 'Re-underwrite below ' || m.reunderwrite_trigger_price::text end,
         (case m.verdict when 'BUY-MORE' then 5 when 'BUY' then 4 when 'MAINTAIN' then 3 else 2 end)::smallint,
         p.pct_of_nav::numeric,
         array['held', lower(m.verdict)]::text[],
         'position',
         jsonb_build_object('pct_of_nav', p.pct_of_nav)
  from public.hermes_positions_latest p
  join best_memo m on m.sym = upper(p.symbol)
  where p.pct_of_nav >= 0.0075

  union all
  -- 4. diligence: legacy North Star ranked seeds
  select 4, row_number() over (order by s.score desc),
         upper(s.ticker),
         case when s.ticker like '%:%' then upper(s.ticker) else coalesce(c.ticker, upper(s.ticker)) end,
         s.name, 'diligence', m.analyst_slug, m.memo_id,
         s.thesis, s.why_beat_qqq, s.falsifier, null,
         s.next_action,
         greatest(1, least(5, round(s.score / 20.0)))::smallint,
         null::numeric,
         array['north-star-seed', s.category]::text[],
         'north_star_seed',
         jsonb_build_object('evidence_needed', s.evidence_needed, 'north_star_score', s.score)
  from seeds s
  left join companies c on c.sym = upper(s.ticker)
  left join best_memo m on m.sym = upper(s.ticker)
  where s.list = 'ranked'

  union all
  -- 5. diligence: un-held BUY / BUY-MORE memos with ≥ 20% expected IRR (capped)
  select 5, row_number() over (order by u.memo_expected_irr desc),
         upper(u.symbol), u.ticker, u.company_name, 'diligence', u.analyst_slug, u.memo_id,
         null, null, null, null,
         case when u.buy_consideration_price is not null then 'Stage entry at or below ' || u.buy_consideration_price::text else 'Confirm entry price' end,
         3::smallint,
         null::numeric,
         array['memo-buy', u.analyst_slug]::text[],
         'memo',
         jsonb_build_object('expected_irr', u.memo_expected_irr)
  from (
    select * from public.hermes_screener_universe
    where verdict in ('BUY', 'BUY-MORE') and coalesce(memo_expected_irr, 0) >= 0.2 and coalesce(held_weight, 0) = 0
    order by memo_expected_irr desc limit 40
  ) u

  union all
  -- 6. sourcing: legacy North Star watchlist seeds
  select 6, row_number() over (order by s.score desc),
         upper(s.ticker),
         case when s.ticker like '%:%' then upper(s.ticker) else coalesce(c.ticker, upper(s.ticker)) end,
         s.name, 'sourcing', m.analyst_slug, m.memo_id,
         s.thesis, s.why_beat_qqq, s.falsifier, null,
         s.next_action,
         greatest(1, least(5, round(s.score / 20.0)))::smallint,
         null::numeric,
         array['north-star-watchlist', s.category]::text[],
         'north_star_seed',
         jsonb_build_object('evidence_needed', s.evidence_needed, 'north_star_score', s.score)
  from seeds s
  left join companies c on c.sym = upper(s.ticker)
  left join best_memo m on m.sym = upper(s.ticker)
  where s.list = 'watchlist'

  union all
  -- 7. sourcing: top-20 master-conviction names
  select 7, row_number() over (order by s.rank),
         upper(public.hermes_bare_symbol(s.ticker)),
         case when s.ticker like '%:%' then upper(s.ticker) else coalesce(c.ticker, upper(s.ticker)) end,
         coalesce(s.company_name, m.company_name), 'sourcing', m.analyst_slug, m.memo_id,
         null, null, null, null,
         'Master conviction rank ' || s.rank || ' (MCS ' || s.mcs || ') — decide whether to underwrite',
         null::smallint,
         null::numeric,
         array['master-score']::text[],
         'master_score',
         jsonb_build_object('mcs', s.mcs, 'rank', s.rank)
  from (select * from public.latest_master_scores where disqualified = false order by rank limit 20) s
  left join companies c on c.sym = upper(public.hermes_bare_symbol(s.ticker))
  left join best_memo m on m.sym = upper(public.hermes_bare_symbol(s.ticker))
),
picked as (
  select distinct on (sym) *
  from cand
  where sym is not null and sym not in (select sym from taken where sym is not null)
  order by sym, prio, rn
),
ordered as (
  select p.*, 1000.0 * row_number() over (partition by stage order by prio, rn) as sort_order
  from picked p
)
insert into public.hermes_ideas
  (owner, ticker, company_name, stage, persona_slug, memo_id, thesis, why_beat_qqq, falsifier, catalyst, next_action,
   conviction, current_weight_pct, tags, source, source_ref, sort_order)
select 'hermes-seed', ticker, company_name, stage, persona_slug, memo_id, thesis, why_beat_qqq, falsifier, catalyst, next_action,
       conviction, current_weight_pct, tags, source, source_ref, sort_order
from ordered
on conflict do nothing;
