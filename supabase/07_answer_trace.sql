-- ============ 07. Answer trace: the source passages and reasoning behind each reply ============
-- Additive. Stores, per assistant message, what the agent actually did: how it understood the
-- message, what it searched for, which passages it used, and what the post-check decided.
-- Built from the workflow's real steps (not an LLM's self-explanation), so it can't be invented.
-- Used by the widget's "Source" / "How I answered" links and, later, the SDR lead-review screen.

alter table public.messages add column if not exists answer_trace jsonb;

comment on column public.messages.answer_trace is
  'Per assistant reply: {sources:[{source,page,url,passage}], reasoning:{understood_as,searched_for,found,safety_check,outcome}}. Written by n8n Workflow B.';

-- Replace save_chat_turn with a version that also stores the trace.
-- The new parameter has a default, so callers that don't send it keep working.
drop function if exists public.save_chat_turn(uuid, text, text, jsonb, text);

create function public.save_chat_turn(
  p_conversation_id uuid, p_user_message text, p_assistant_message text,
  p_sources jsonb default '[]', p_guardrail_flag text default null,
  p_answer_trace jsonb default null
) returns void
language sql set search_path = '' as $$
  insert into public.messages (conversation_id, role, content, created_at)
  values (p_conversation_id, 'user', p_user_message, now());
  insert into public.messages (conversation_id, role, content, retrieved_sources, guardrail_flag, answer_trace, created_at)
  values (p_conversation_id, 'assistant', p_assistant_message, coalesce(p_sources, '[]'::jsonb),
          p_guardrail_flag, p_answer_trace, now() + interval '1 millisecond');
  update public.conversations set last_message_at = now() where id = p_conversation_id;
$$;

-- Only n8n (service_role) may call it, as before.
revoke execute on function public.save_chat_turn(uuid, text, text, jsonb, text, jsonb) from public, anon, authenticated;
grant  execute on function public.save_chat_turn(uuid, text, text, jsonb, text, jsonb) to service_role;
