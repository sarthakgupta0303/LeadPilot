# Decision log

The product and technical decisions made while building the LeadPilot prototype: what I chose, what I rejected, and the trade-off I accepted. Newest first within each theme.

---

## Scope and product

### D1 · Chat only; video/voice avatar removed
- **Context:** The first prototype had a "Video" mode (text-to-speech, lip-synced avatar, mic input). The PRD lists *voice avatar* as **out of scope for the MVP**.
- **Decision:** Remove video and voice entirely; ship chat only.
- **Why:** The value of the product is *qualification and sales context*, not the avatar talking. Voice added browser-compatibility bugs, accessibility work and a second UX to test, with no impact on the North Star (Qualified Lead → Next Action).
- **Trade-off:** A less flashy demo. Voice goes back on the roadmap once conversion data shows it matters.

### D2 · The admin panel is LeadPilot's; the customer is a "workspace"
- **Context:** The admin panel was styled with the demo customer's brand.
- **Decision:** Brand the panel as **LeadPilot** and show the customer company as the active *workspace*, loaded from the database.
- **Why:** It's a B2B SaaS. The admin UI belongs to the vendor, and the widget belongs to the customer. Getting this right makes the multi-tenant model obvious.

### D2b · A clearly fictional demo customer (Acme Cloud)
- **Context:** The first demo customer was an invented legal-tech brand. An invented name that happens to match a real company could look like impersonation on a public portfolio, and legal-tech narrowed the audience.
- **Decision:** Demo the agent on **Acme Cloud**, a fictional B2B customer-analytics SaaS (with the classic sample companies Northwind, Contoso and others as its "customers"), plus a `.example` domain.
- **Why:** Nobody mistakes Acme for a real company. B2B SaaS pricing, integrations and security questions are exactly what LeadPilot's buyers field every day.

### D3 · Honest statuses over a fake "Ready"
- **Context:** The prototype animated every upload to "Ready" after two seconds.
- **Decision:** Show the real pipeline state: `Uploaded → Processing → Ready / Failed + reason`, with auto-refresh and a Re-index button.
- **Why:** A fake Ready tells the admin the agent can answer from a document when it can't, which is exactly the trust failure the product exists to prevent.

### D4 · Supported formats: PDF **and DOCX** (a deviation from the PRD)
- **Decision:** Accept DOCX in the MVP (the PRD says PDF only); drop legacy `.doc`.
- **Why:** n8n's data loader reads DOCX for free, and legal and sales teams live in Word. `.doc` can't be parsed reliably, so accepting it would create Failed rows.

### D5 · Qualification deferred behind a working answer path
- **Decision:** Build ingestion and grounded answers first; qualification, insights and the leads view come next.
- **Why:** Qualification depends on the conversation working, and on stored messages to extract signals from. The `messages` table was designed for that from day one.
- **Risk accepted:** Until qualification ships, the demo looks like a well-guarded RAG chatbot rather than the lead-qualification product the PRD describes. This is the top roadmap item.

---

## Architecture

### D6 · Supabase is the single source of truth
- **Options:** browser localStorage (the prototype) · n8n data tables · **Supabase**.
- **Decision:** Supabase (Postgres + Auth + Storage + pgvector) holds all configuration, knowledge and conversations.
- **Why:** Three consumers need the same data: the admin panel, the widget and the agent. One database means a guardrail saved in the panel applies to the **next** reply, with no sync jobs.

### D7 · pgvector in Supabase, not n8n's in-memory vector store
- **Options:** n8n *Simple Vector Store* (used in the course template) · **Supabase pgvector**.
- **Decision:** pgvector with metadata on every chunk.
- **Why:** The in-memory store is **wiped when n8n restarts** and has no notion of companies. pgvector persists, can be filtered by company or category, and cascade-deletes chunks when a source is removed (a PRD acceptance criterion).

### D8 · The database triggers ingestion (pg_net + Vault), not the browser
- **Options:** the admin panel calls n8n directly · n8n polls every minute · **a DB trigger calls n8n**.
- **Decision:** A Postgres trigger sends `{source_id}` to n8n with a shared-secret header. The URL and secret are kept in Supabase Vault.
- **Why:** A browser call would expose the n8n URL to anyone, and polling adds up to 60s of delay plus constant executions. The trigger fires only on real events (new URL, finished upload, re-index), never on category edits or on n8n's own status updates, which would loop.
- **Lesson learned:** The first version cancelled the upload when the webhook URL was misconfigured. Fixed so a bad n8n setting only logs a warning; **a side-system failure must never block the core action.**

### D9 · Business logic in 4 small SQL functions
- **Decision:** `start_ingestion`, `finish_ingestion`, `chat_context` and `save_chat_turn` run as single RPC calls from n8n.
- **Why:** Each replaces 4–6 n8n nodes, runs atomically, and is testable in SQL. For example, `chat_context` creates or loads the conversation, counts messages for rate limiting, and returns settings, guardrails and history in one round trip.

### D10 · One AI vendor (OpenAI) for embeddings and chat
- **Options:** Claude for chat + OpenAI embeddings · **OpenAI for both** · Supabase's built-in embeddings.
- **Decision:** OpenAI `text-embedding-3-small` plus a GPT "mini" model.
- **Why:** One key, one bill and one spending cap for a prototype. Embedding quality is strong and cheap. The chat model can be swapped per node later without touching the data.

---

## Agent design (agentic RAG)

### D11 · Agentic RAG, not a fixed retrieve-then-answer pipeline
- **Decision:** Intent Router → (Direct reply | Query Rewriter → tool-using agent that can **re-search up to 3 times**) → post-check.
- **Why:** Prospects ask follow-ups ("and for 20 of us?"), small talk, and things the KB doesn't cover. A fixed pipeline searches on "hi", answers follow-ups badly, and guesses when the first search misses. The router skips retrieval when it isn't needed (cheaper, faster), and the agent decides when results are good enough.
- **Cap:** Max 6 agent iterations, to bound cost and latency.

### D12 · Guardrails come from the admin panel and are enforced in three layers
1. **Rules:** admin settings are compiled into the system prompt on every message.
2. **Pre-check:** blocked, off-topic and injection messages never reach the agent.
3. **Post-check:** an independent classifier reviews the drafted reply against blocked topics and restricted claims.

- **Why:** The PRD's core promise is that *each company controls what the agent may say*. A prompt alone can be talked around, and the post-check catches what slips through.
- **Trade-off:** 1–2 extra LLM calls per message (latency and cost), measured in the evals.

### D13 · Fallback over guessing
- **Decision:** If the KB doesn't answer it, the agent returns the admin's exact fallback message and offers a human.
- **Why:** For a sales agent, a confident wrong answer about pricing or security is worse than "let me connect you with the team". It's measured directly in the evals ("not in KB" cases).

### D14 · Company isolation enforced in the database, not just the prompt
- **Decision:** `match_kb_chunks` refuses to search without a `company_id` filter, and only n8n's service role can call it.
- **Why:** Multi-tenant leakage is the highest-impact failure for a B2B AI product. It shouldn't depend on one n8n field being configured correctly.

---

## Security and cost

### D15 · Real sign-in and Row Level Security, even for a mock
- **Decision:** An email/password admin login, public sign-ups disabled, a `company_admins` guest list, RLS on every table, and anonymous access revoked except for a 6-column public view.
- **Why:** The publishable key is visible in the HTML. Without RLS, anyone could edit the agent's guardrails. It took about 20 minutes, and it's the difference between a demo and something shareable.

### D16 · Public chat endpoint: rate limit + budget cap (known gap)
- **Decision:** 20 messages per session per 10 minutes, a 1,000-character limit, and an OpenAI monthly budget cap.
- **Known gap:** The session ID is client-generated, so a determined attacker can rotate it. The spending cap is the real backstop. For production: per-IP limits at the edge, and a signed widget token per customer.

---

## Known limitations (accepted for the prototype)
- **Crawler:** regex HTML parsing, links from the homepage only, max 20 pages; doesn't render JavaScript and **doesn't read robots.txt yet** (which the PRD risk table asks for).
- **Single tenant in the widget:** the company ID and endpoint are hard-coded; production needs a one-line embed snippet.
- **Single-file HTML front-ends:** fast to iterate and demo; would move to a component framework for a real team.
