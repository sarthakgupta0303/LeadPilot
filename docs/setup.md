# Run it yourself

About 60–90 minutes from zero. You need free accounts on **Supabase** and **n8n Cloud**, plus an **OpenAI API key** with a monthly budget cap set.

## 1. Supabase

1. Create a project (the Free plan is fine).
2. **SQL Editor:** run the files in [`supabase/`](../supabase/) in order:

   | File | Creates |
   |---|---|
   | `01_tables.sql` | companies, agent_config, guardrails, kb_sources, RLS on, demo seed |
   | `02_security.sql` | `company_admins` guest list, RLS policies, anon lockdown, `public_agent_profile` view |
   | `03_storage.sql` | `kb-documents` (private) and `avatars` (public) buckets + policies |
   | `05_rag.sql` | pgvector, `kb_chunks`, `match_kb_chunks`, conversations, messages, the 4 helper functions |
3. **Authentication → Users → Add user** (Auto Confirm on). Then **Sign In / Providers → turn off "Allow new users to sign up"**.
4. Run `04_admin_user.sql` with your email, to put yourself on the guest list.
5. **Project Settings → API Keys:** note the project URL, the **publishable** key (goes in the HTML) and the legacy **service_role** key (goes in n8n only; never commit it).

## 2. n8n credentials

| Credential | Type | Value |
|---|---|---|
| `OpenAI – LeadPilot` | OpenAI | your OpenAI API key |
| `Supabase – LeadPilot (service)` | Supabase API | Host = project URL · Service Role Secret = `service_role` key |
| `LeadPilot ingest secret` | Header Auth | Name `x-leadpilot-secret` · Value = output of `openssl rand -hex 24` |

## 3. Workflow A: KB Ingestion

Node-by-node (see the diagram in [`n8n/README.md`](../n8n/README.md)). All Supabase calls use *HTTP Request → Predefined Credential Type → Supabase API*.

| # | Node | Settings |
|---|---|---|
| 1 | Webhook | POST `kb-ingest` · Header Auth → ingest secret · Respond *Immediately* |
| 2 | Start ingestion | POST `{URL}/rest/v1/rpc/start_ingestion` · body `p_source_id = {{ $json.body.source_id }}` |
| 3 | Is website? | If `{{ $json.source_type }}` equals `url` |
| 4 | Download file (false) | GET `{URL}/storage/v1/object/kb-documents/{{ $json.storage_path }}` · Response: File → `data` |
| 5 | Store document chunks | Supabase Vector Store → *Add documents* · table `kb_chunks` · Embeddings OpenAI `text-embedding-3-small` · Default Data Loader: Binary, auto-detect, field `data`, split PDF pages, metadata `company_id, source_id, source_type, source_name, category` from `$('Start ingestion').first().json` · Recursive splitter 1000/200 |
| 6 | Mark ready | POST `rpc/finish_ingestion` · `p_source_id`, `p_status=ready` · **Execute Once** |
| 7 | Fetch homepage (true) | GET `{{ $json.source_url }}` · Response: Text → `html` |
| 8 | Collect links | Code: [`a-collect-links.js`](../n8n/code/a-collect-links.js) |
| 9 | Fetch pages | GET `{{ $json.url }}` · Text → `html` · batching 5 / 1000 ms · On Error: Continue |
| 10 | Clean text | Code: [`a-clean-text.js`](../n8n/code/a-clean-text.js) |
| 11 | Store website chunks | as #5, but loader JSON, *Load Specific Data* `{{ $json.text }}`, extra metadata `page_url`, `page_title` |
| 12 | Mark ready (website) | as #6 + `p_pages_indexed = {{ $('Clean text').all().length }}` |
| 13 | Draft company context | OpenAI *Message a model* (mini) · 180-word profile from `$('Clean text')` text · Execute Once · On Error: Continue |
| 14 | Save context draft | Supabase *Update row* in `agent_config` where `company_id` matches · `company_context_draft` = model reply · On Error: Continue |
| 15 | Mark failed | POST `rpc/finish_ingestion` · `p_status=failed`, `p_error = {{ $json.error?.message ?? $json.error ?? 'Unknown error' }}` · Execute Once |

Set **On Error → Continue (using error output)** on nodes 4, 5, 7, 8, 10 and 11, and connect their error outputs to #15. **Activate** the workflow.

## 4. Connect Supabase → n8n

Run [`supabase/06_ingest_trigger.sql`](../supabase/06_ingest_trigger.sql) after replacing the two placeholders with Workflow A's **Production** URL (`…/webhook/kb-ingest`, **not** `webhook-test`) and your ingest secret. To change them later, go to **Integrations → Vault**.

## 5. Workflow B: Maya chat (Agentic RAG)

| # | Node | Settings |
|---|---|---|
| 1 | Webhook | POST `maya-chat` · Auth none · Respond *Using 'Respond to Webhook' node* · Allowed Origins `*` |
| 2 | Validate input | Code: [`b-validate-input.js`](../n8n/code/b-validate-input.js) |
| 3 | Input OK? | `{{ $json.ok }}` is true · false → Respond 400 `{{ JSON.stringify({ error: $json.error }) }}` |
| 4 | Load context | POST `rpc/chat_context` · `p_company_id`, `p_session_id`, `p_campaign_source` |
| 5 | Under rate limit? | `{{ $json.recent_user_messages }}` < 20 · false → Respond "please wait a minute" |
| 6 | Build rules | Code: [`b-build-rules.js`](../n8n/code/b-build-rules.js) |
| 7 | Intent Router | Text Classifier on `{{ $json.message }}` · categories `kb_question`, `general`, `blocked` (blocked description includes `{{ $json.blocked_topics.join('; ') }}`) · no match → Other (treat as kb_question) · model mini, temp 0 |
| 8 | Decline (blocked) | Set: `reply` = polite decline, `sources` = `{{ [] }}`, `flag` = `blocked_topic` |
| 9 | Direct reply (general) | AI Agent, no tools · system = rules + "don't state product facts; follow the escalation rule" |
| 10 | Query Rewriter (kb_question / Other) | Basic LLM Chain · "rewrite as ONE standalone search query" + `{{ $json.chat_input }}` · temp 0 |
| 11 | Maya agent | AI Agent · prompt `{{ $('Build rules').first().json.chat_input }}` + suggested query `{{ $json.text }}` · system `{{ $('Build rules').first().json.system_prompt }}` · max iterations 6 · return intermediate steps · On Error: error output → #14 |
| 11a | ↳ search_knowledge_base | Supabase Vector Store *as tool* · `kb_chunks` · limit 5 · include metadata · query name `match_kb_chunks` · metadata filter `company_id = {{ $('Build rules').first().json.company_id }}` · Embeddings `text-embedding-3-small` |
| 12 | Collect sources | Code: [`b-collect-sources.js`](../n8n/code/b-collect-sources.js) (after #9 and #11) |
| 13 | Post-check | Text Classifier on `{{ $json.reply }}` · `compliant` / `violation` (lists blocked topics and restricted claims) · no match → Other |
| 14 | Use fallback | Set: `reply = {{ $('Build rules').first().json.fallback }}`, `sources = {{ [] }}`, `flag = fallback_used` |
| 15 | Send reply | Respond to Webhook · JSON `{{ JSON.stringify({ reply: $json.reply, sources: $json.sources \|\| [] }) }}` · inputs: #8, #13 compliant/Other, #14 |
| 16 | Save turn | POST `rpc/save_chat_turn` · *Using JSON* body with conversation id, message, reply, sources, flag · On Error: Continue |

**Activate** the workflow.

## 6. Point the front-ends at your backend

- `admin-panel/admin-panel.html` → `SUPABASE_URL`, `SUPABASE_KEY` (publishable).
- `website/source/js/widget.js` → `companyId`, `chatEndpoint`, `supabaseUrl`, `supabaseKey`. Then run `python3 website/build.py` to rebuild the demo site and re-embed it in the admin panel's **Preview** tab.

## 7. Load knowledge and test

1. Open the admin panel, sign in, and upload [`knowledge-base/acme-cloud-product-guide.pdf`](../knowledge-base/acme-cloud-product-guide.pdf). Wait for **Ready**.
2. Open the admin panel's **Preview** tab and ask Maya *"How much is the Starter plan?"*
3. Run the evals: `python3 evals/run_evals.py` (see [`evals/`](../evals/)).
