-- User-authorized price-return policy, adopted before the first outcomes.
-- Original contracts, prompt versions and any already graded observations stay intact.
create table if not exists public.hermes_ladder_market_policies (
  forecast_id uuid primary key references public.hermes_ladder_forecasts(id),
  policy_version text not null default 'price-return-split-v1' check (policy_version='price-return-split-v1'),
  adopted_at timestamptz not null default now(),
  reason text not null
);
comment on table public.hermes_ladder_market_policies is
  'Append-only measurement adoption: cumulative USD split-adjusted price return, dividends excluded for both stock and QQQ. Exact registered endpoint dates only; no non-session shifting. Original forecast and prompt retained. Supersedes earlier adjusted-price grading instructions, not forecast beliefs.';

create table if not exists public.hermes_market_price_providers (
  provider text primary key,
  source_prefix text not null,
  source_suffix text not null,
  endpoint text not null
);
insert into public.hermes_market_price_providers values
  ('gurufocus','https://www.gurufocus.com/stock/','/summary','/public/user/{credential}/stock/{symbol}/price')
  on conflict do nothing;

create or replace function public.hermes_bind_market_policy()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.horizon in ('90d','12m') then
    insert into public.hermes_ladder_market_policies(forecast_id,reason)
    values(new.id,'Policy in force at forecast registration');
  end if;
  return new;
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
      or not public.hermes_validate_price_evidence(f,p_observation,p_evidence_urls) then
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
revoke all on function public.hermes_grade_ladder(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.hermes_grade_ladder(uuid,jsonb,jsonb) to service_role;

create or replace view public.hermes_ladder_evaluations with (security_invoker=true) as
select f.*,l.ticker,l.registered_at,l.payload,r.agent_name,r.prompt_id,r.prompt_version,l.payload->>'model_version' as model_version,
  o.id as outcome_id,o.actual_value,o.alpha,o.hit,o.brier,o.absolute_error,o.evidence_urls,o.observation,p.policy_version as measurement_policy
from public.hermes_ladder_forecasts f join public.hermes_forecast_ladders l on l.id=f.ladder_id
join public.hermes_agent_runs r on r.id=l.run_id left join public.hermes_ladder_outcomes o on o.forecast_id=f.id
left join public.hermes_ladder_market_policies p on p.forecast_id=f.id;
revoke all on public.hermes_ladder_evaluations from public,anon,authenticated;
grant select on public.hermes_ladder_evaluations to service_role;

revoke all on function public.hermes_bind_market_policy() from public,anon,authenticated,service_role;
drop trigger if exists hermes_bind_market_policy on public.hermes_ladder_forecasts;
create trigger hermes_bind_market_policy after insert on public.hermes_ladder_forecasts
  for each row execute function public.hermes_bind_market_policy();

insert into public.hermes_ladder_market_policies(forecast_id,reason)
select f.id,'User-authorized GuruFocus split-adjusted price-return adoption on 2026-09-09; original prompt and forecast retained'
from public.hermes_ladder_forecasts f where f.horizon in ('90d','12m')
  and not exists(select 1 from public.hermes_ladder_outcomes o where o.forecast_id=f.id)
on conflict do nothing;

-- Source: https://www.nyse.com/trade/hours-calendars, verified 2026-09-09.
-- Unknown years and scheduled non-trading days fail closed; early-close days are sessions.
create or replace function public.hermes_is_price_session(d date)
returns boolean language sql immutable set search_path='' as $$
select coalesce(d between date '2026-01-01' and date '2028-12-31' and extract(isodow from d)<6 and d<>all(array[
 '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
 '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
 '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25'
]::date[]),false)
$$;
revoke all on function public.hermes_is_price_session(date) from public,anon,authenticated;

create or replace function public.hermes_validate_price_evidence(f public.hermes_ladder_forecasts, obs jsonb, urls jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare leg jsonb; symbol text; ticker text; cfg public.hermes_market_price_providers;
  day date := (statement_timestamp() at time zone 'UTC')::date; latest date;
begin
  select * into cfg from public.hermes_market_price_providers where provider=obs->>'provider';
  if not found then return false; end if;
  select l.ticker into ticker from public.hermes_forecast_ladders l where l.id=f.ladder_id;
  if obs->>'policy_version' is distinct from 'price-return-split-v1'
    or obs->>'adjustment_basis' is distinct from 'split-adjusted'
    or obs->>'return_basis' is distinct from 'price-return'
    or obs->>'calendar_version' is distinct from 'us-equities-2026-2028-v1'
    or not exists(select 1 from public.hermes_ladder_market_policies p where p.forecast_id=f.id and p.policy_version=obs->>'policy_version')
    or not public.hermes_is_price_session(f.start_date) or not public.hermes_is_price_session(f.due_date)
    or obs->>'start_date' is distinct from f.start_date::text or obs->>'end_date' is distinct from f.due_date::text
    or jsonb_typeof(obs->'stock') is distinct from 'object' or jsonb_typeof(obs->'qqq') is distinct from 'object' then return false; end if;
  select max(day-offset_days) into latest from generate_series(1,7) offset_days
    where public.hermes_is_price_session(day-offset_days);
  if latest is null then return false; end if;
  foreach symbol in array array['stock','qqq'] loop
    leg:=obs->symbol;
    if leg->>'provider' is distinct from cfg.provider
      or leg->>'symbol' is distinct from (case when symbol='stock' then ticker else 'QQQ' end)
      or leg->>'currency' is distinct from 'USD'
      or leg->>'adjustment_basis' is distinct from 'split-adjusted' or leg->>'return_basis' is distinct from 'price-return'
      or leg->>'endpoint' is distinct from cfg.endpoint
      or leg->>'source_url' is distinct from cfg.source_prefix||(case when symbol='stock' then ticker else 'QQQ' end)||cfg.source_suffix
      or not (urls @> jsonb_build_array(leg->>'source_url'))
      or leg->>'source_date' is distinct from latest::text
      or leg->>'start_source_date' is distinct from f.start_date::text or leg->>'end_source_date' is distinct from f.due_date::text
      or coalesce((leg->>'retrieved_at')::timestamptz,'-infinity'::timestamptz) not between statement_timestamp()-interval '24 hours' and statement_timestamp()+interval '5 minutes'
      then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.hermes_validate_price_evidence(public.hermes_ladder_forecasts,jsonb,jsonb) from public,anon,authenticated;

do $$ declare tab text; begin
  foreach tab in array array['hermes_ladder_market_policies','hermes_market_price_providers'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
    execute format('grant select on public.%I to service_role',tab);
    execute format('drop trigger if exists hermes_ladder_append_only on public.%I',tab);
    execute format('create trigger hermes_ladder_append_only before update or delete on public.%I for each row execute function public.hermes_ladder_immutable()',tab);
  end loop;
end $$;
