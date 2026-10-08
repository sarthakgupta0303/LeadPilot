-- ============ 08. Observability: per-answer health, daily health, alerts ============
-- The course's model: observability is the layer over evaluation, guardrails and cost. Everything
-- here reads the trace already stored with each reply (messages.answer_trace, see 07) plus the
-- telemetry block Workflow B adds to it (latency, model calls, tokens, cost).
-- Views use security_invoker, so an admin only ever sees their own company (the RLS on
-- conversations/messages applies). Additive: no existing table changes.

-- ---------- 1. One row per assistant reply ----------
create or replace view public.turn_health
with (security_invoker = true) as
select
  m.id                                   as message_id,
  c.company_id,
  c.id                                   as conversation_id,
  c.campaign_source,
  m.created_at,
  m.guardrail_flag,
  -- Route: what the workflow did with the message
  case
    when m.guardrail_flag = 'blocked_topic'                                then 'declined'
    when m.guardrail_flag = 'direct_reply'                                 then 'small_talk'
    when m.guardrail_flag in ('fallback_used', 'postcheck_uncertain')      then 'safety_fallback'
    when m.guardrail_flag = 'agent_error'                                  then 'error'
    when m.content ilike 'I don''t have that information yet%'             then 'kb_fallback'
    else 'answered'
  end                                                                       as route,
  coalesce(jsonb_array_length(m.answer_trace -> 'sources'), 0) > 0
    or coalesce(jsonb_array_length(m.retrieved_sources), 0) > 0          as cited,
  -- Failure modes, clustered cheaply with patterns over the reply (the course's
  -- "regular expressions over traces"). Each one is a candidate golden-set case.
  case
    when m.guardrail_flag = 'agent_error'                                   then 'provider_or_agent_error'
    when m.content ~* '(might|may|could) (need to )?(explore|use|try|allow)|other ways to|workaround'
                                                                            then 'speculation'
    when m.content ~* '(does not|doesn''t) (offer|support|provide|have)|not (listed|mentioned)|no mention of'
                                                                            then 'unsupported_negative_claim'
    when m.content ~* 'search engine|encyclopedia'                          then 'off_topic_redirect'
    else null
  end                                                                       as failure_mode,
  -- Telemetry written by Workflow B ("Explain answer"); null for older rows
  nullif(m.answer_trace #>> '{telemetry,latency_ms}', '')::int              as latency_ms,
  nullif(m.answer_trace #>> '{telemetry,model_calls}', '')::int             as model_calls,
  nullif(m.answer_trace #>> '{telemetry,search_calls}', '')::int            as search_calls,
  nullif(m.answer_trace #>> '{telemetry,est_tokens}', '')::int              as est_tokens,
  nullif(m.answer_trace #>> '{telemetry,est_cost_usd}', '')::numeric        as est_cost_usd
from public.messages m
join public.conversations c on c.id = m.conversation_id
where m.role = 'assistant';

-- ---------- 2. Daily health, three dimensions side by side ----------
-- Usage & cost | Quality | Safety  (the dashboard the course recommends)
create or replace view public.health_daily
with (security_invoker = true) as
select
  company_id,
  date_trunc('day', created_at)::date                                       as day,
  -- Usage & cost
  count(distinct conversation_id)                                           as conversations,
  count(*)                                                                  as replies,
  round(avg(latency_ms))                                                    as avg_latency_ms,
  percentile_cont(0.9) within group (order by latency_ms)                   as p90_latency_ms,
  sum(est_tokens)                                                           as est_tokens,
  round(sum(est_cost_usd), 4)                                               as est_cost_usd,
  -- Quality
  round(100.0 * count(*) filter (where route = 'answered') / nullif(count(*), 0), 1)     as answered_pct,
  round(100.0 * count(*) filter (where route = 'answered' and cited)
        / nullif(count(*) filter (where route = 'answered'), 0), 1)                       as cited_pct,
  round(100.0 * count(*) filter (where route = 'kb_fallback') / nullif(count(*), 0), 1)  as kb_fallback_pct,
  count(*) filter (where failure_mode in ('speculation', 'unsupported_negative_claim'))  as honesty_flags,
  -- Safety
  round(100.0 * count(*) filter (where route = 'declined') / nullif(count(*), 0), 1)     as declined_pct,
  round(100.0 * count(*) filter (where route = 'safety_fallback') / nullif(count(*), 0), 1) as postcheck_override_pct,
  round(100.0 * count(*) filter (where route = 'error') / nullif(count(*), 0), 1)        as error_pct
from public.turn_health
group by 1, 2;

-- ---------- 3. Failure modes: what to add to the golden set next ----------
create or replace view public.failure_modes
with (security_invoker = true) as
select company_id, failure_mode, count(*) as replies, max(created_at) as last_seen
from public.turn_health
where failure_mode is not null
group by 1, 2;

-- ---------- 4. Alerts: thresholds agreed in advance (PM owns them) ----------
-- Returns one row per breached threshold over the last p_hours. Workflow C (scheduled) calls it
-- and notifies the owner. Thresholds follow docs/evaluation-prd.md §9.
create or replace function public.health_alerts(p_hours int default 24)
returns table (company_id uuid, metric text, value numeric, threshold numeric, severity text, action text)
language sql stable set search_path = '' as $$
  with w as (
    select * from public.turn_health
    where created_at > now() - make_interval(hours => p_hours)
  ), agg as (
    select company_id,
      count(*)                                                                         as n,
      100.0 * count(*) filter (where route = 'error') / nullif(count(*), 0)            as error_pct,
      100.0 * count(*) filter (where route = 'kb_fallback') / nullif(count(*), 0)      as kb_fallback_pct,
      100.0 * count(*) filter (where route = 'safety_fallback') / nullif(count(*), 0)  as postcheck_pct,
      100.0 * count(*) filter (where failure_mode in ('speculation','unsupported_negative_claim'))
            / nullif(count(*) filter (where route = 'answered'), 0)                    as honesty_pct,
      percentile_cont(0.9) within group (order by latency_ms)                          as p90_ms,
      sum(est_cost_usd)                                                                as cost
    from w group by company_id
  )
  select company_id, 'error_pct', round(error_pct,1), 5, 'high', 'Check provider status and n8n executions; errors fall back safely but cost answers'
    from agg where n >= 10 and error_pct > 5
  union all
  select company_id, 'kb_fallback_pct', round(kb_fallback_pct,1), 25, 'medium', 'Read the fallback questions: these are knowledge-base gaps'
    from agg where n >= 10 and kb_fallback_pct > 25
  union all
  select company_id, 'postcheck_override_pct', round(postcheck_pct,1), 15, 'high', 'Harmless review: above 15% the course calls for a kill-or-continue decision'
    from agg where n >= 10 and postcheck_pct > 15
  union all
  select company_id, 'honesty_flag_pct', round(honesty_pct,1), 10, 'medium', 'Sample flagged replies; add cases to the golden set'
    from agg where n >= 10 and honesty_pct > 10
  union all
  select company_id, 'p90_latency_ms', round(p90_ms::numeric), 15000, 'low', 'Look for retries or long agent loops in traces'
    from agg where n >= 10 and p90_ms > 15000
  union all
  select company_id, 'cost_usd_window', round(cost,4), 5, 'medium', 'Check for a traffic spike or runaway loop'
    from agg where cost > 5;
$$;

revoke execute on function public.health_alerts(int) from public, anon;
grant  execute on function public.health_alerts(int) to authenticated, service_role;
grant select on public.turn_health, public.health_daily, public.failure_modes to authenticated;
revoke select on public.turn_health, public.health_daily, public.failure_modes from anon;
