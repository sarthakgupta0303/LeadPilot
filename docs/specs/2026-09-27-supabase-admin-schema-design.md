# Supabase schema + admin panel connection — design

Date: 2026-09-27 · Status: approved in chat, awaiting spec review

## Goal

Everything the admin enters in `admin-panel/admin-panel.html` is stored in Supabase instead of browser localStorage. Supabase becomes the single source of truth that n8n (and later the website widget and the agentic RAG agent) read from.

Success = edit any field in the admin panel → **Save changes** → the value is visible in the Supabase Table Editor and comes back after a reload on any browser.

## Context and constraints

- Mock / prototype. One admin (the project owner), one company (Acme Cloud).
- Admin panel stays a single self-contained HTML file with no build step.
- A new, dedicated Supabase project is created for LeadPilot.
- `company_id` is kept on every table so the schema matches the PRD's multi-company model, even though only one company row exists.
- Out of scope for this step: `kb_chunks` / pgvector, n8n ingestion, the website widget reading config, leads/prospects/conversations, qualification criteria, config change history.

## Access model

| Actor | How it connects | Can do |
|---|---|---|
| Admin (you) | Admin panel, Supabase Auth email + password, public (anon) key | Read and write all admin tables and both storage buckets |
| Website visitor (later) | Widget, anon key, not signed in | Read only `public_agent_profile` (name, greeting, avatar, tone) |
| n8n (later) | `service_role` key, server-side only | Everything (bypasses RLS) |

The admin user is created by hand in the Supabase dashboard; there is no sign-up form. Row Level Security (RLS) is enabled on every table.

## Schema

### `companies`
`id uuid pk`, `name text`, `website_url text`, `created_at timestamptz`

Seeded with one row: Acme Cloud (fictional demo company), `https://www.acme-cloud.example`.

### `agent_config` (one row per company)
| Column | Panel field | Notes |
|---|---|---|
| `company_id uuid pk → companies` | — | |
| `agent_name text` | Assistant name | not empty |
| `greeting text` | Greeting message | ≤ 220 chars (matches panel limit) |
| `avatar_style text` | Avatar style tile | one of bear, owl, fox, robot, shield, person1, person2, initial, custom |
| `avatar_url text` | Uploaded photo | public URL in `avatars` bucket; null unless style = custom |
| `tone text` | Tone of voice | professional / friendly / formal / casual |
| `company_description text` | Company description | |
| `company_context_draft text` | — | filled by n8n later from the website crawl |
| `updated_at timestamptz` | — | set by trigger |

### `guardrails` (one row per company)
| Column | Panel field |
|---|---|
| `company_id uuid pk → companies` | — |
| `allowed_topics text[]` | Allowed topics chips |
| `blocked_topics text[]` | Blocked topics chips |
| `restricted_claims text[]` | new field (PRD 2c); added to the panel as a chip input |
| `fallback_message text` | Fallback message |
| `escalation_rule text` | Escalation rule |
| `pii_rule text` | none / basic / full |
| `updated_at timestamptz` | — |

### `kb_sources` (many per company)
| Column | Notes |
|---|---|
| `id uuid pk` | |
| `company_id uuid → companies` | |
| `source_type text` | url / pdf / docx |
| `name text` | hostname for URLs, file name for documents |
| `source_url text` | URLs only |
| `storage_path text` | documents only, path in `kb-documents` bucket |
| `file_size_bytes bigint` | documents only |
| `category text` | Product / FAQ / Pricing / Onboarding / Use cases / Docs |
| `status text` | uploaded → processing → ready / failed (PRD wording). Panel writes `uploaded`; n8n moves it on. |
| `error text` | set by n8n on failure |
| `pages_indexed int` | set by n8n for URLs |
| `created_at`, `indexed_at timestamptz` | |

### View `public_agent_profile`
`company_id, agent_name, greeting, avatar_style, avatar_url, tone` — the only thing anonymous visitors can read.

### Storage
- `kb-documents` — private. Admin can upload/delete; n8n reads with the service key. Path: `<company_id>/<source_id>/<file name>`.
- `avatars` — public read, admin write. Path: `<company_id>/avatar-<timestamp>.<ext>`.

## Admin panel changes

1. Load `@supabase/supabase-js` v2 from cdn.jsdelivr.net; a config block at the top of the script holds `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public by design).
2. Sign-in overlay (email + password). Session is remembered by supabase-js; a Sign out link in the sidebar.
3. On load: read `companies` (first row), `agent_config`, `guardrails`, `kb_sources` → fill the existing state object. localStorage is no longer used for data.
4. **Save changes**: upsert `agent_config` and `guardrails`. Errors show in the existing toast; the "All changes saved" indicator only turns green on success.
5. Custom avatar photo: uploaded to `avatars` at pick time; the URL is stored on save (replaces the base64 blob).
6. Knowledge base:
   - Add URL → insert `kb_sources` row (status `uploaded`).
   - Upload file → insert row, upload to `kb-documents`, store path + size. If the upload fails, the row is deleted and an error toast is shown.
   - Change category → update row immediately.
   - Delete → remove storage object then row.
   - The simulated Queued→Processing→Ready animation is removed; the table shows the real status from the database. A Refresh button re-reads statuses (n8n will update them).
7. **Reset to defaults** writes the default values to the database (after a confirm).
8. Accepted uploads narrowed to PDF + DOCX (DOC dropped — not parseable by the planned pipeline).

## Error handling

- Not signed in / session expired → sign-in overlay.
- Network or RLS error → toast with the Supabase message; unsaved edits stay in the form.
- Missing `agent_config`/`guardrails` row → panel shows defaults and creates the row on first save.

## Testing

- SQL: after migration, `get_advisors` (security) shows no missing-RLS warnings.
- Anon (signed-out) insert into `agent_config` is rejected; anon select on `public_agent_profile` succeeds.
- In the browser: sign in, change name/greeting/tone/topics, save, reload → values persist; rows visible via SQL.
- Upload a PDF → object in `kb-documents`, row in `kb_sources` with `uploaded`. Delete → both gone.

## What the owner does in Supabase

1. Confirm creation of the new project (cost shown before creation).
2. Authentication → Users → Add user: your email + a password (auto-confirm).
3. Later (n8n step): copy the `service_role` key into n8n credentials — never into the HTML.
