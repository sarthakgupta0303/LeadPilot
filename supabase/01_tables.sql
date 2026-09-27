-- ============ 1. companies: one row per customer company ============
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  website_url text,
  created_at  timestamptz not null default now()
);

-- ============ 2. agent_config: "Avatar & Name" + company description/tone ============
create table public.agent_config (
  company_id            uuid primary key references public.companies(id) on delete cascade,
  agent_name            text not null default 'Maya' check (length(trim(agent_name)) > 0),
  greeting              text not null default '' check (length(greeting) <= 220),
  avatar_style          text not null default 'bear'
                        check (avatar_style in ('bear','owl','fox','robot','shield','person1','person2','initial','custom')),
  avatar_url            text,                 -- public URL of an uploaded photo (style = 'custom')
  tone                  text not null default 'professional'
                        check (tone in ('professional','friendly','formal','casual')),
  company_description   text not null default '',
  company_context_draft text,                 -- filled later by n8n from the website crawl
  updated_at            timestamptz not null default now()
);

-- ============ 3. guardrails: "Rules & Guardrails" ============
create table public.guardrails (
  company_id        uuid primary key references public.companies(id) on delete cascade,
  allowed_topics    text[] not null default '{}',
  blocked_topics    text[] not null default '{}',
  restricted_claims text[] not null default '{}',
  fallback_message  text not null default '',
  escalation_rule   text not null default '',
  pii_rule          text not null default 'basic' check (pii_rule in ('none','basic','full')),
  updated_at        timestamptz not null default now()
);

-- ============ 4. kb_sources: "Knowledge Base" — one row per URL or document ============
create table public.kb_sources (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  source_type     text not null check (source_type in ('url','pdf','docx')),
  name            text not null,              -- hostname for URLs, file name for documents
  source_url      text,                       -- only for URLs
  storage_path    text,                       -- only for documents (path in the storage bucket)
  file_size_bytes bigint,
  category        text not null default 'Product'
                  check (category in ('Product','FAQ','Pricing','Onboarding','Use cases','Docs')),
  status          text not null default 'uploaded'
                  check (status in ('uploaded','processing','ready','failed')),
  error           text,                       -- n8n writes the failure reason here
  pages_indexed   int,                        -- n8n writes how many pages it crawled
  created_at      timestamptz not null default now(),
  indexed_at      timestamptz,
  check ((source_type = 'url') = (source_url is not null))   -- URLs must have a URL, files must not
);
create index kb_sources_company_idx on public.kb_sources (company_id, created_at desc);

-- ============ 5. Auto-update "updated_at" whenever a row changes ============
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agent_config_set_updated_at before update on public.agent_config
  for each row execute function public.set_updated_at();
create trigger guardrails_set_updated_at before update on public.guardrails
  for each row execute function public.set_updated_at();

-- ============ 6. Lock every table (rules come in 02_security.sql) ============
alter table public.companies    enable row level security;
alter table public.agent_config enable row level security;
alter table public.guardrails   enable row level security;
alter table public.kb_sources   enable row level security;

-- ============ 7. Starting data: Acme Cloud (fictional demo company) + admin-panel defaults ============
with c as (
  insert into public.companies (name, website_url)
  values ('Acme Cloud', 'https://www.acme-cloud.example')
  returning id
), a as (
  insert into public.agent_config (company_id, agent_name, greeting, avatar_style, tone, company_description)
  select id, 'Maya',
         'Hi, I''m Maya 👋 Ask me anything about our product, pricing, or book a demo.',
         'bear', 'professional',
         'Acme Cloud is a customer analytics platform for B2B software companies. It connects product usage, billing and CRM data into live dashboards, smart alerts and AI insights, so teams spot churn earlier and find expansion revenue faster. We sell to revenue operations, customer success, product and finance teams at B2B SaaS companies.'
  from c
)
insert into public.guardrails (company_id, allowed_topics, blocked_topics, restricted_claims,
                               fallback_message, escalation_rule, pii_rule)
select id,
       array['Product features','Pricing tiers','Security & compliance'],
       array['Discounts','Legal advice','Competitor comparisons'],
       array['No discounts or custom pricing promises','No legal or compliance guarantees'],
       'I don''t have that information yet, but I can connect you with our team who can help.',
       'Offer to book a demo or connect with sales when the prospect asks for pricing specifics or says they''re ready to buy.',
       'basic'
from c;
