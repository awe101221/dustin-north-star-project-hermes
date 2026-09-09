-- Additive ledger; existing five-year graphs/forecasts are never changed.
create table if not exists public.hermes_forecast_ladders (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  run_id uuid not null references public.hermes_agent_runs(id),
  registered_at timestamptz not null default statement_timestamp(),
  payload jsonb not null,
  unique(run_id, ticker)
);
create index if not exists hermes_ladder_ticker_date on public.hermes_forecast_ladders(ticker, registered_at desc, id);
create table if not exists public.hermes_ladder_forecasts (
  id uuid primary key default gen_random_uuid(),
  ladder_id uuid not null references public.hermes_forecast_ladders(id),
  horizon text not null check (horizon in ('90d','12m','quarter')),
  start_date date not null,
  due_date date not null check (due_date > start_date and isfinite(due_date)),
  contract jsonb not null,
  unique(ladder_id, horizon)
);
create index if not exists hermes_ladder_due on public.hermes_ladder_forecasts(due_date, id);
-- Every refresh decision is retained, including checks that create no new ladder.
create table if not exists public.hermes_ladder_checks (
  run_id uuid not null references public.hermes_agent_runs(id), ticker text not null,
  ladder_id uuid not null references public.hermes_forecast_ladders(id),
  checked_at timestamptz not null default statement_timestamp(),
  created_ladder boolean not null, payload jsonb not null,
  primary key(run_id,ticker)
);
create table if not exists public.hermes_ladder_outcomes (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null unique references public.hermes_ladder_forecasts(id),
  graded_at timestamptz not null default statement_timestamp(),
  observation jsonb not null,
  evidence_urls jsonb not null,
  actual_value numeric not null,
  alpha numeric,
  hit boolean not null,
  brier numeric not null check(brier between 0 and 1),
  absolute_error numeric
);
create table if not exists public.hermes_ladder_reviews (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.hermes_ladder_outcomes(forecast_id),
  created_at timestamptz not null default statement_timestamp(),
  payload jsonb not null
);
create index if not exists hermes_ladder_review_forecast on public.hermes_ladder_reviews(forecast_id, created_at desc);
create table if not exists public.hermes_learning_publications (
  run_id uuid primary key references public.hermes_agent_runs(id),
  note_id uuid not null references public.hermes_notes(id),
  published_at timestamptz not null default statement_timestamp(),
  payload jsonb not null
);

create or replace function public.hermes_ladder_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Learning history is append-only' using errcode='23514'; end $$;

create or replace function public.hermes_ladder_evidence(urls jsonb)
returns boolean language sql immutable set search_path = '' as $$
 select case when jsonb_typeof(urls) = 'array' then
   jsonb_array_length(urls) between 1 and 20 and not exists (
     select 1 from jsonb_array_elements_text(urls) u
     where not public.hermes_is_valid_evidence_url(u) or u ~* '[?&](apikey|api_key|token|key|secret)='
   ) else false end
$$;

create or replace function public.hermes_register_forecast_ladder(p_input jsonb)
-- Narrow SECURITY DEFINER boundary: service_role can execute these validated
-- transactions but cannot directly insert fabricated/backdated ledger rows.
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous public.hermes_forecast_ladders;
  prior_check public.hermes_ladder_checks;
  agent public.hermes_agent_runs;
  ladder_id uuid;
  changed boolean := false;
  part text; c jsonb; a jsonb;
  day date := (statement_timestamp() at time zone 'UTC')::date;
  deadline date;
begin
  if p_input->>'ticker' is null or p_input->>'ticker' !~ '^[A-Z][A-Z0-9.-]{0,19}$' then
    raise exception 'Invalid ladder ticker' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ladder:' || (p_input->>'ticker'),0));
  select * into prior_check from public.hermes_ladder_checks
    where run_id=(p_input->>'run_id')::uuid and ticker=p_input->>'ticker';
  if found then
    if prior_check.payload is distinct from p_input then raise exception 'Conflicting refresh replay' using errcode='23505'; end if;
    return jsonb_build_object('ladder_id',prior_check.ladder_id,'created',prior_check.created_ladder,'replay',true);
  end if;
  select * into agent from public.hermes_agent_runs where id=(p_input->>'run_id')::uuid for share;
  if not found or agent.status not in ('queued','running') or agent.prompt_id is null or agent.prompt_version is null then
    raise exception 'Active run with exact prompt provenance required' using errcode='23514';
  end if;
  if agent.metadata->>'model_version' is distinct from p_input->>'model_version' then
    raise exception 'Forecast model must match the recorded run model' using errcode='23514';
  end if;
  if coalesce(length(p_input->>'model_version'),0)=0 or coalesce(length(p_input->>'thesis_key'),0)=0
    or coalesce(length(p_input->>'conclusion'),0)=0 or coalesce(length(p_input->>'change_reason'),0)=0
    or coalesce(p_input#>>'{ranking,lane}','') not in ('top-ten','watchlist')
    or coalesce(p_input#>>'{ranking,qqq_decision}','') not in ('above','below')
    or coalesce((p_input#>>'{ranking,rank}')::int,0) not between 1 and 10
    or coalesce(jsonb_typeof(p_input->'assumptions'),'') <> 'array'
    or jsonb_array_length(p_input->'assumptions') not between 1 and 20 then
    raise exception 'Incomplete conclusion contract' using errcode='23514';
  end if;
  for a in select value from jsonb_array_elements(p_input->'assumptions') loop
    if coalesce(length(a->>'id'),0)=0 or coalesce(length(a->>'claim'),0)=0 or coalesce(length(a->>'falsifier'),0)=0
      or not public.hermes_ladder_evidence(a->'evidence_urls') then raise exception 'Invalid assumption evidence' using errcode='23514'; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_input->'assumptions')) then
    raise exception 'Duplicate assumption identity' using errcode='23514';
  end if;
  foreach part in array array['market_90d','market_12m','operating'] loop
    c := p_input->part;
    if coalesce(jsonb_typeof(c),'') <> 'object' or coalesce((c->>'probability')::numeric,-1) not between 0 and 1
      or coalesce((c->>'confidence')::numeric,-1) not between 0 and 1
      or coalesce(length(c->>'falsifier'),0)=0 or not public.hermes_ladder_evidence(c->'evidence_urls')
      or coalesce(jsonb_typeof(c->'assumption_ids'),'') <> 'array' or jsonb_array_length(c->'assumption_ids')=0 then
      raise exception 'Incomplete forecast contract' using errcode='23514';
    end if;
    if exists(select 1 from jsonb_array_elements_text(c->'assumption_ids') ref
      where not exists(select 1 from jsonb_array_elements(p_input->'assumptions') x where x->>'id'=ref)) then
      raise exception 'Unknown assumption reference' using errcode='23514';
    end if;
    if part <> 'operating' and coalesce((c->>'expected_alpha')::numeric,-2) not between -1 and 10 then
      raise exception 'Invalid expected alpha' using errcode='23514';
    end if;
  end loop;
  c:=p_input->'operating'; deadline:=(c->>'due_date')::date;
  if deadline is null or not isfinite(deadline) or deadline <= day+1 or deadline > day+210
    or coalesce(c->>'kind','') not in ('sec_kpi','milestone') or coalesce(length(c->>'label'),0)=0 then
    raise exception 'Operating forecast must be forward and resolve within 210 days' using errcode='23514';
  end if;
  if c->>'kind'='sec_kpi' and (
    coalesce(c->>'operator','') not in ('gte','lte') or coalesce(c->>'cik','') !~ '^\d{1,10}$'
    or coalesce(c->>'taxonomy','') not in ('us-gaap','ifrs-full')
    or coalesce(c->>'concept','') !~ '^[A-Za-z][A-Za-z0-9]*$'
    or coalesce(length(c->>'unit'),0)=0 or coalesce(c->>'target','NaN') in ('NaN','Infinity','-Infinity')
    or (c->>'target')::numeric is null
    or coalesce((c->>'period_start')::date,day) <= day
    or coalesce((c->>'period_end')::date,day) <= (c->>'period_start')::date
    or (c->>'period_end')::date > deadline
    or (c->>'period_end')::date - (c->>'period_start')::date not between 60 and 110
  ) then raise exception 'KPI must specify a future fiscal quarter and exact SEC measure' using errcode='23514'; end if;
  if c->>'kind'='milestone' and coalesce(length(c->>'resolution_rule'),0)=0 then raise exception 'Milestone resolution rule required' using errcode='23514'; end if;

  select * into previous from public.hermes_forecast_ladders
    where ticker=p_input->>'ticker' order by registered_at desc,id desc limit 1;
  changed := previous.id is null;
  if previous.id is not null then
    -- Rank moves within a lane, fresh prose, source refresh, model/prompt changes,
    -- and rolling dates alone do not create another forecast cohort.
    changed := previous.payload->>'thesis_key' is distinct from p_input->>'thesis_key'
      or previous.payload#>>'{ranking,lane}' is distinct from p_input#>>'{ranking,lane}'
      or previous.payload#>>'{ranking,qqq_decision}' is distinct from p_input#>>'{ranking,qqq_decision}'
      or (select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(previous.payload->'assumptions') x)
        is distinct from (select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(p_input->'assumptions') x);
    foreach part in array array['market_90d','market_12m','operating'] loop
      changed := changed or abs((previous.payload->part->>'probability')::numeric-(p_input->part->>'probability')::numeric) >= 0.10
        or abs((previous.payload->part->>'confidence')::numeric-(p_input->part->>'confidence')::numeric) >= 0.15;
      if part <> 'operating' then
        changed := changed or abs((previous.payload->part->>'expected_alpha')::numeric-(p_input->part->>'expected_alpha')::numeric) >= 0.02;
      else
        changed := changed or ((previous.payload->part) - array['probability','confidence','evidence_urls','due_date','period_start','period_end','falsifier','assumption_ids','target','label'])
          is distinct from ((p_input->part) - array['probability','confidence','evidence_urls','due_date','period_start','period_end','falsifier','assumption_ids','target','label']);
        if p_input->part->>'kind'='sec_kpi' and previous.payload->part->>'kind'='sec_kpi' then
          changed := changed or abs((previous.payload->part->>'target')::numeric-(p_input->part->>'target')::numeric)
            >= greatest(abs((previous.payload->part->>'target')::numeric)*0.05,0.000001);
        end if;
      end if;
    end loop;
  end if;
  if changed then
    insert into public.hermes_forecast_ladders(ticker,run_id,payload) values(p_input->>'ticker',agent.id,p_input) returning id into ladder_id;
    insert into public.hermes_ladder_forecasts(ladder_id,horizon,start_date,due_date,contract) values
      (ladder_id,'90d',day+1,day+90,p_input->'market_90d'),
      (ladder_id,'12m',day+1,(day+interval '1 year')::date,p_input->'market_12m'),
      (ladder_id,'quarter',day+1,deadline,p_input->'operating');
  else ladder_id:=previous.id;
  end if;
  insert into public.hermes_ladder_checks(run_id,ticker,ladder_id,created_ladder,payload)
    values(agent.id,p_input->>'ticker',ladder_id,changed,p_input);
  return jsonb_build_object('ladder_id',ladder_id,'created',changed,'replay',false);
end $$;

create or replace function public.hermes_grade_ladder(p_forecast_id uuid, p_observation jsonb, p_evidence_urls jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.hermes_ladder_forecasts; prior public.hermes_ladder_outcomes;
  actual numeric; alpha numeric; hit boolean; error numeric; result uuid; day date := (statement_timestamp() at time zone 'UTC')::date;
begin
  select * into f from public.hermes_ladder_forecasts where id=p_forecast_id for update;
  if not found then raise exception 'Forecast not found' using errcode='23503'; end if;
  select * into prior from public.hermes_ladder_outcomes where forecast_id=f.id;
  if found then
    if prior.observation is distinct from p_observation or prior.evidence_urls is distinct from p_evidence_urls then
      raise exception 'Outcome already closed with different evidence' using errcode='23505'; end if;
    return prior.id;
  end if;
  if f.due_date >= day then raise exception 'Forecast is not due after completed day' using errcode='23514'; end if;
  if not public.hermes_ladder_evidence(p_evidence_urls) then raise exception 'Evidence URLs required' using errcode='23514'; end if;
  if f.horizon in ('90d','12m') then
    if coalesce(p_observation->>'kind','')<>'market'
      or coalesce((p_observation->>'start_date')::date, '-infinity'::date) not between f.start_date and f.start_date+7
      or coalesce((p_observation->>'end_date')::date, '-infinity'::date) not between f.due_date and f.due_date+7
      or (p_observation->>'end_date')::date >= day
      or (p_observation->>'start_date')::date >= (p_observation->>'end_date')::date
      or coalesce((p_observation->>'stock_start')::numeric,0)<=0 or coalesce((p_observation->>'stock_end')::numeric,0)<=0
      or coalesce((p_observation->>'qqq_start')::numeric,0)<=0 or coalesce((p_observation->>'qqq_end')::numeric,0)<=0
      or coalesce(p_observation->>'provider','')<>'alpha-vantage-adjusted' then
      raise exception 'Invalid common-session adjusted market evidence' using errcode='23514'; end if;
    if exists(select 1 from jsonb_each_text(p_observation) x where x.key in ('stock_start','stock_end','qqq_start','qqq_end') and x.value in ('NaN','Infinity','-Infinity')) then
      raise exception 'Nonfinite price endpoint' using errcode='23514'; end if;
    actual := (p_observation->>'stock_end')::numeric/(p_observation->>'stock_start')::numeric-1;
    alpha := actual-((p_observation->>'qqq_end')::numeric/(p_observation->>'qqq_start')::numeric-1);
    if abs(actual)>3 or abs(actual-alpha)>1 then raise exception 'Extreme return requires investigation' using errcode='23514'; end if;
    hit := alpha>0; error := abs(alpha-(f.contract->>'expected_alpha')::numeric);
  else
    if f.contract->>'kind'='sec_kpi' then
      if coalesce(p_observation->>'kind','')<>'sec_kpi'
        or p_observation->>'period_start' is distinct from f.contract->>'period_start'
        or p_observation->>'period_end' is distinct from f.contract->>'period_end'
        or p_observation->>'unit' is distinct from f.contract->>'unit'
        or p_observation->>'concept' is distinct from f.contract->>'concept'
        or p_observation->>'cik' is distinct from f.contract->>'cik'
        or p_observation->>'taxonomy' is distinct from f.contract->>'taxonomy'
        or coalesce((p_observation->>'filed')::date,'infinity'::date)>day
        or (p_observation->>'filed')::date < (f.contract->>'period_end')::date
        or coalesce(p_observation->>'accession','') !~ '^\d{10}-\d{2}-\d{6}$'
        or not exists(select 1 from jsonb_array_elements_text(p_evidence_urls) u where u like 'https://www.sec.gov/Archives/edgar/data/%') then
        raise exception 'Exact SEC period/unit/filing evidence required' using errcode='23514'; end if;
      actual:=(p_observation->>'value')::numeric;
      hit:=case when f.contract->>'operator'='gte' then actual >= (f.contract->>'target')::numeric else actual <= (f.contract->>'target')::numeric end;
      error:=abs(actual-(f.contract->>'target')::numeric);
    else
      if coalesce(p_observation->>'kind','')<>'milestone' or coalesce(length(p_observation->>'reviewer'),0)=0
        or coalesce(length(p_observation->>'finding'),0)=0 or jsonb_typeof(p_observation->'occurred') is distinct from 'boolean' then
        raise exception 'Milestone requires explicit evidence review; absence is not false' using errcode='23514'; end if;
      hit:=(p_observation->>'occurred')::boolean; actual:=case when hit then 1 else 0 end;
    end if;
  end if;
  if actual is null or actual::text in ('NaN','Infinity','-Infinity') or coalesce(alpha::text,'0') in ('NaN','Infinity','-Infinity') then
    raise exception 'Nonfinite observation' using errcode='23514'; end if;
  insert into public.hermes_ladder_outcomes(forecast_id,observation,evidence_urls,actual_value,alpha,hit,brier,absolute_error)
    values(f.id,p_observation,p_evidence_urls,actual,alpha,hit,power((f.contract->>'probability')::numeric-(case when hit then 1 else 0 end),2),error)
    returning id into result;
  return result;
end $$;

create or replace function public.hermes_publish_learning_snapshot(p_run_id uuid, p_note jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare prior public.hermes_learning_publications; saved public.hermes_notes; item jsonb; lane text; rank integer; checked jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('publish-learning:' || p_run_id::text,0));
  select * into prior from public.hermes_learning_publications where run_id=p_run_id;
  if found then
    if prior.payload is distinct from p_note then raise exception 'Conflicting publication replay' using errcode='23505'; end if;
    select * into saved from public.hermes_notes where id=prior.note_id;
    return jsonb_build_object('note',to_jsonb(saved),'replay',true);
  end if;
  if not exists(select 1 from public.hermes_agent_runs where id=p_run_id and status in ('running','queued')) then
    raise exception 'Active publication run required' using errcode='23514'; end if;
  if coalesce(jsonb_array_length(p_note#>'{metadata,bestIdeas,topTen}'),0)<>10
    or coalesce(jsonb_array_length(p_note#>'{metadata,bestIdeas,watchlistTen}'),0)<>10 then
    raise exception 'Learning publication requires exactly 10 plus 10' using errcode='23514'; end if;
  if (select count(distinct x->>'ticker') from (
    select value x from jsonb_array_elements(p_note#>'{metadata,bestIdeas,topTen}') union all
    select value x from jsonb_array_elements(p_note#>'{metadata,bestIdeas,watchlistTen}')) tickers) <> 20 then
    raise exception 'Twenty unique ranked tickers required' using errcode='23514'; end if;
  foreach lane in array array['topTen','watchlistTen'] loop
    rank:=0;
    for item in select value from jsonb_array_elements(p_note->'metadata'->'bestIdeas'->lane) loop
      rank:=rank+1;
      select payload into checked from public.hermes_ladder_checks where run_id=p_run_id and ticker=regexp_replace(item->>'ticker','^.*:','');
      if not found or checked#>>'{ranking,lane}' is distinct from (case when lane='topTen' then 'top-ten' else 'watchlist' end)
        or (checked#>>'{ranking,rank}')::integer <> rank
        or checked#>>'{ranking,qqq_decision}' is distinct from item->>'qqqLine' then
        raise exception 'Ranked company is missing its matching forecast check' using errcode='23514'; end if;
    end loop;
  end loop;
  insert into public.hermes_notes(kind,title,body_md,tickers,tags,persona_slug,verdict,author,source_system,is_pinned,occurred_at,metadata)
    select x.kind,x.title,x.body_md,x.tickers,x.tags,x.persona_slug,x.verdict,x.author,x.source_system,x.is_pinned,x.occurred_at,
      x.metadata || jsonb_build_object('learning_run_id',p_run_id)
    from jsonb_populate_record(null::public.hermes_notes,p_note) x returning * into saved;
  insert into public.hermes_learning_publications(run_id,note_id,payload) values(p_run_id,saved.id,p_note);
  return jsonb_build_object('note',to_jsonb(saved),'replay',false);
end $$;

create or replace view public.hermes_ladder_evaluations with (security_invoker=true) as
select f.*,l.ticker,l.registered_at,l.payload,r.agent_name,r.prompt_id,r.prompt_version,l.payload->>'model_version' as model_version,
  o.id as outcome_id,o.actual_value,o.alpha,o.hit,o.brier,o.absolute_error,o.evidence_urls,o.observation
from public.hermes_ladder_forecasts f join public.hermes_forecast_ladders l on l.id=f.ladder_id
join public.hermes_agent_runs r on r.id=l.run_id left join public.hermes_ladder_outcomes o on o.forecast_id=f.id;

create or replace function public.hermes_review_ladder(p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare original jsonb; result uuid;
begin
 select l.payload into original from public.hermes_ladder_forecasts f
 join public.hermes_forecast_ladders l on l.id=f.ladder_id
 join public.hermes_ladder_outcomes o on o.forecast_id=f.id where f.id=(p_input->>'forecast_id')::uuid;
 if not found then raise exception 'Graded forecast required' using errcode='23514'; end if;
 if coalesce(length(p_input->>'reviewer'),0)=0 or coalesce(length(p_input->>'finding'),0)=0
   or coalesce(length(p_input->>'recommended_change'),0)=0
   or coalesce(p_input->>'disposition','') not in ('investigate','test-prompt','test-model','no-change')
   or not public.hermes_ladder_evidence(p_input->'evidence_urls')
   or jsonb_typeof(p_input->'failed_assumption_ids') is distinct from 'array' then
   raise exception 'Evidence-backed review required' using errcode='23514'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_input->'failed_assumption_ids') ref
   where not exists(select 1 from jsonb_array_elements(original->'assumptions') a where a->>'id'=ref)) then
   raise exception 'Unknown failed assumption' using errcode='23514'; end if;
 -- Lost-response retry of the same review is idempotent. Later reviews append.
 perform pg_advisory_xact_lock(hashtextextended('review:' || (p_input->>'forecast_id'),0));
 select id into result from public.hermes_ladder_reviews where forecast_id=(p_input->>'forecast_id')::uuid and payload=p_input limit 1;
 if result is not null then return result; end if;
 insert into public.hermes_ladder_reviews(forecast_id,payload) values((p_input->>'forecast_id')::uuid,p_input) returning id into result;
 return result;
end $$;

do $$ declare tab text; begin
  foreach tab in array array['hermes_forecast_ladders','hermes_ladder_forecasts','hermes_ladder_checks','hermes_ladder_outcomes','hermes_ladder_reviews','hermes_learning_publications'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
    execute format('grant select on public.%I to service_role',tab);
    execute format('drop trigger if exists hermes_ladder_append_only on public.%I',tab);
    execute format('create trigger hermes_ladder_append_only before update or delete on public.%I for each row execute function public.hermes_ladder_immutable()',tab);
  end loop;
end $$;
revoke all on public.hermes_ladder_evaluations from public,anon,authenticated;
grant select on public.hermes_ladder_evaluations to service_role;
revoke all on function public.hermes_register_forecast_ladder(jsonb), public.hermes_grade_ladder(uuid,jsonb,jsonb), public.hermes_review_ladder(jsonb), public.hermes_publish_learning_snapshot(uuid,jsonb), public.hermes_ladder_immutable(), public.hermes_ladder_evidence(jsonb) from public,anon,authenticated;
grant execute on function public.hermes_register_forecast_ladder(jsonb), public.hermes_grade_ladder(uuid,jsonb,jsonb), public.hermes_review_ladder(jsonb), public.hermes_publish_learning_snapshot(uuid,jsonb) to service_role;
