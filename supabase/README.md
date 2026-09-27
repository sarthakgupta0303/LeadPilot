# Supabase

The complete database for LeadPilot: tables, security, storage, vector search and the ingestion trigger. Run the files in the SQL Editor **in this order** (full walkthrough in [`docs/setup.md`](../docs/setup.md)).

| File | What it does |
|---|---|
| `01_tables.sql` | `companies`, `agent_config`, `guardrails`, `kb_sources`, `updated_at` triggers, RLS switched on, LegalGraph demo seed |
| `02_security.sql` | `company_admins` guest list, RLS policies, anonymous lockdown, `public_agent_profile` view for the widget |
| `03_storage.sql` | `kb-documents` (private, 25 MB, PDF/DOCX) and `avatars` (public, 2 MB, images) buckets + per-company folder policies |
| `04_admin_user.sql` | Adds your admin login (created in Authentication → Users) to the guest list |
| `05_rag.sql` | pgvector, `kb_chunks` (+ auto-fill of company/source from metadata), `match_kb_chunks` search, `conversations`, `messages`, and the helper functions n8n calls: `start_ingestion`, `finish_ingestion`, `chat_context`, `save_chat_turn` |
| `06_ingest_trigger.sql` | pg_net + Vault + triggers that call n8n Workflow A when a source needs indexing (new URL, finished upload, re-index) |

**Keys**
- The **publishable** key is in the HTML files. That's safe: RLS limits it to the 6 public widget fields when signed out, and to your own company's rows when signed in.
- The **service_role** key, the n8n ingest secret and the OpenAI key are **never** committed. They live only in n8n credentials and Supabase Vault.

Every script was tested against the live project inside a rolled-back transaction before being applied, covering: anonymous access denied, admin access limited to their own company, cascade-deletes, and trigger firing rules.
