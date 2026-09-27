-- =====================================================================
-- 06_ingest_trigger.sql — Supabase calls n8n Workflow A automatically
-- Run AFTER Workflow A is active. Step 2 needs your real values.
-- =====================================================================

-- ============ 1. pg_net: lets the database make HTTP calls ============
create extension if not exists pg_net;

-- ============ 2. Store the n8n URL + secret in Vault (encrypted) ============
-- Replace both placeholders. Run this block ONCE (names must be unique).
select vault.create_secret('PASTE_N8N_PRODUCTION_URL', 'n8n_ingest_url');
select vault.create_secret('PASTE_YOUR_SECRET', 'n8n_ingest_secret');
-- To change a value later:
--   select vault.update_secret((select id from vault.secrets where name = 'n8n_ingest_url'), 'NEW_VALUE');

-- ============ 3. The function that calls n8n ============
-- security definer: runs with the owner's rights so it can read Vault,
-- even though the change was made by the admin panel's signed-in user.
create function public.notify_kb_ingest() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'n8n_ingest_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'n8n_ingest_secret';
  if v_url is null or v_secret is null then
    raise warning 'n8n ingest webhook is not configured in Vault';
    return new;
  end if;
  -- A bad URL/secret must never block the admin panel from saving the source.
  begin
    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object('source_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-leadpilot-secret', v_secret),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'Could not call n8n: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.notify_kb_ingest() from public, anon, authenticated;

-- ============ 4. When to call it ============
-- Websites: as soon as they are added.
create trigger kb_ingest_on_insert after insert on public.kb_sources
  for each row when (new.source_type = 'url' and new.status = 'uploaded')
  execute function public.notify_kb_ingest();

-- Files: once the upload has finished (the panel saves storage_path last).
-- Re-index: when status is set back to 'uploaded'.
-- NOT on category changes, and NOT when n8n itself sets processing/ready/failed.
create trigger kb_ingest_on_update after update on public.kb_sources
  for each row when (
    new.status = 'uploaded'
    and (new.source_type = 'url' or new.storage_path is not null)
    and ((old.storage_path is null and new.storage_path is not null) or old.status <> 'uploaded')
  )
  execute function public.notify_kb_ingest();
