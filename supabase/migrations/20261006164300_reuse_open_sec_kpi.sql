-- Reuse an already-registered open SEC KPI after its quarter starts.
-- A new ladder, a shifted quarter, or a material forecast change still requires
-- a period that starts after today. This does not grade, publish, or change rank.

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
  reuse_open_kpi boolean := false;
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
  select * into previous from public.hermes_forecast_ladders
    where ticker=p_input->>'ticker' order by registered_at desc,id desc limit 1;
  -- Exact open contract only. A NULL comparison must not skip the gate.
  reuse_open_kpi := coalesce(previous.id is not null
    and c->>'kind'='sec_kpi'
    and previous.payload->'operating'->>'kind'='sec_kpi'
    and (previous.payload->'operating'->>'operator') is not distinct from (c->>'operator')
    and (previous.payload->'operating'->>'cik') is not distinct from (c->>'cik')
    and (previous.payload->'operating'->>'taxonomy') is not distinct from (c->>'taxonomy')
    and (previous.payload->'operating'->>'concept') is not distinct from (c->>'concept')
    and (previous.payload->'operating'->>'unit') is not distinct from (c->>'unit')
    and (previous.payload->'operating'->>'target')::numeric = (c->>'target')::numeric
    and (previous.payload->'operating'->>'period_start')::date = (c->>'period_start')::date
    and (previous.payload->'operating'->>'period_end')::date = (c->>'period_end')::date
    and (previous.payload->'operating'->>'due_date')::date = deadline
    and deadline > day, false);
  if c->>'kind'='sec_kpi' and (
    coalesce(c->>'operator','') not in ('gte','lte') or coalesce(c->>'cik','') !~ '^\d{1,10}$'
    or coalesce(c->>'taxonomy','') not in ('us-gaap','ifrs-full')
    or coalesce(c->>'concept','') !~ '^[A-Za-z][A-Za-z0-9]*$'
    or coalesce(length(c->>'unit'),0)=0 or coalesce(c->>'target','NaN') in ('NaN','Infinity','-Infinity')
    or (c->>'target')::numeric is null
    or (reuse_open_kpi is not true and coalesce((c->>'period_start')::date,day) <= day)
    or coalesce((c->>'period_end')::date,day) <= (c->>'period_start')::date
    or (c->>'period_end')::date > deadline
    or (c->>'period_end')::date - (c->>'period_start')::date not between 60 and 110
  ) then raise exception 'KPI must specify a future fiscal quarter and exact SEC measure' using errcode='23514'; end if;
  if c->>'kind'='milestone' and coalesce(length(c->>'resolution_rule'),0)=0 then raise exception 'Milestone resolution rule required' using errcode='23514'; end if;

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
  if changed and c->>'kind'='sec_kpi' and coalesce((c->>'period_start')::date,day) <= day then
    raise exception 'KPI must specify a future fiscal quarter and exact SEC measure' using errcode='23514';
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


grant execute on function public.hermes_register_forecast_ladder(jsonb) to service_role;
