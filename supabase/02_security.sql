-- ============ 1. Guest list: which login is an admin of which company ============
create table public.company_admins (
  user_id    uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
alter table public.company_admins enable row level security;

-- An admin can see their own guest-list entries (nobody can add themselves)
create policy "admins read own membership" on public.company_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ============ 2. companies ============
create policy "admins read their company" on public.companies
  for select to authenticated
  using (id in (select company_id from public.company_admins where user_id = (select auth.uid())));
create policy "admins update their company" on public.companies
  for update to authenticated
  using      (id in (select company_id from public.company_admins where user_id = (select auth.uid())))
  with check (id in (select company_id from public.company_admins where user_id = (select auth.uid())));

-- ============ 3. agent_config ============
create policy "admins read agent_config" on public.agent_config
  for select to authenticated
  using (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));
create policy "admins insert agent_config" on public.agent_config
  for insert to authenticated
  with check (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));
create policy "admins update agent_config" on public.agent_config
  for update to authenticated
  using      (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())))
  with check (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));

-- ============ 4. guardrails ============
create policy "admins read guardrails" on public.guardrails
  for select to authenticated
  using (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));
create policy "admins insert guardrails" on public.guardrails
  for insert to authenticated
  with check (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));
create policy "admins update guardrails" on public.guardrails
  for update to authenticated
  using      (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())))
  with check (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));

-- ============ 5. kb_sources (admins can also delete sources) ============
create policy "admins read kb_sources" on public.kb_sources
  for select to authenticated
  using (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));
create policy "admins insert kb_sources" on public.kb_sources
  for insert to authenticated
  with check (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));
create policy "admins update kb_sources" on public.kb_sources
  for update to authenticated
  using      (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())))
  with check (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));
create policy "admins delete kb_sources" on public.kb_sources
  for delete to authenticated
  using (company_id in (select company_id from public.company_admins where user_id = (select auth.uid())));

-- ============ 6. Second lock: anonymous visitors get nothing by default ============
revoke all on public.companies, public.agent_config, public.guardrails,
              public.kb_sources, public.company_admins from anon;

-- ============ 7. The one public window: what the website widget may read ============
grant select (company_id, agent_name, greeting, avatar_style, avatar_url, tone)
  on public.agent_config to anon;
create policy "public reads widget fields" on public.agent_config
  for select to anon
  using (true);

create view public.public_agent_profile
  with (security_invoker = true) as
  select company_id, agent_name, greeting, avatar_style, avatar_url, tone
  from public.agent_config;
grant select on public.public_agent_profile to anon, authenticated;
