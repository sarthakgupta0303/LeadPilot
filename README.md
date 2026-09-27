# LeadPilot AI

**An AI sales agent for B2B websites. It answers prospects from the company's own knowledge, stays inside guardrails the company controls, and gives sales the context to act.**

A product-management case study, taken from problem definition to a working, evaluated AI system: **PRD → prototype → data model → workflow automation → agentic RAG → evaluation.**

[PRD](docs/PRD.md) · [Decision log](docs/decision-log.md) · [Architecture](docs/architecture.md) · [Workflows](n8n/README.md) · [Evaluation](evals/README.md) · [Run it yourself](docs/setup.md)

| | |
|---|---|
| **My role** | Product manager and builder (solo cohort project): discovery, PRD, prioritisation, UX, system design, prompt and agent design, evaluation |
| **Demo customer** | **Acme Cloud**, a *fictional* B2B analytics SaaS. Its website runs LeadPilot's assistant, **Maya** |
| **Stack** | Supabase (Postgres, pgvector, Auth, Storage, RLS) · n8n (workflow automation, AI Agent) · OpenAI (GPT + embeddings) · HTML/JS |
| **Status** | Admin panel, database, ingestion workflow and widget built · agent workflow being built · evals ready to run · qualification next |

| Prospect's view: Maya on Acme Cloud's website | Admin's view: the LeadPilot admin panel |
|---|---|
| ![Maya chat widget on the Acme Cloud demo site](docs/images/website-maya-chat.png) | ![LeadPilot admin panel](docs/images/admin-panel.png) |

---

## 1. The problem

B2B companies pay to bring prospects to their website, then leave them alone with a contact form. Buyers have questions *before* they're ready to talk to sales ("does it work with HubSpot?", "is there an EU region?", "what's in the Growth plan?"). When a lead does reach an SDR, it arrives with no context: what they asked, what they need, whether they're even a fit.

> **Job to be done:** *When a prospect engages with my website or campaign, help them get the information they need while understanding their intent, qualifying them, and giving my sales team the context to take the right next action.*

| Persona | Pain today | What LeadPilot gives them |
|---|---|---|
| **Marketing / RevOps admin** (buyer) | A chatbot means an engineering project, and no control over what it says | Configure the agent, its knowledge and its guardrails without code |
| **Prospect** (end user) | "Book a call to find out" | Accurate, cited answers now, or an honest "let me connect you" |
| **SDR / BDR** | Leads arrive as a bare email address | Intent, requirements and qualification signals (next phase) |

**North Star metric:** *Qualified Lead → Next Action Rate*, the % of qualified prospects for whom the agent recommends or starts the right next step. Full framing, risks and prioritisation: **[PRD](docs/PRD.md)**.

## 2. Solution and scope

**MVP, what's built:** an admin panel to configure the agent (persona, company context, guardrails, knowledge base) · automated knowledge ingestion from documents and websites · an agentic RAG chat agent on the customer's website · conversation storage with the sources each answer used · a 27-case evaluation suite.

**Deliberately cut or deferred** (see the [decision log](docs/decision-log.md)):
- ✂️ The **video/voice avatar**. It was out of MVP scope and didn't move the North Star.
- ⏭️ **Qualification, insights and the leads view**. They need a working conversation and stored messages first, so they come next.
- 🗓️ **CRM handoff, demo booking and analytics** are P1.

## 3. How it works

```mermaid
flowchart LR
  AP[Admin panel] -- persona · guardrails · docs --> SB[(Supabase<br/>Postgres + pgvector<br/>Auth · Storage · RLS)]
  SB -- "new source (DB trigger)" --> A[n8n · Workflow A<br/>Knowledge ingestion]
  A -- chunks + embeddings --> SB
  W[Website widget] -- prospect message --> B[n8n · Workflow B<br/>Agentic RAG agent]
  B -- rules · history · vector search --> SB
  B -- grounded reply + sources --> W
  A & B <--> O[OpenAI<br/>GPT + embeddings]
```

**Supabase is the single source of truth.** When an admin saves a guardrail, the agent applies it to the **very next** message, with no deploy and no sync job. Security is real rather than mocked: admin sign-in, Row Level Security on every table, visitors limited to a 6-field public view, and company-scoped vector search enforced *inside the database*. → [Architecture](docs/architecture.md)

## 4. Workflow automation (n8n)

Two event-driven workflows do all the AI work. Business logic lives in four small SQL functions, so each workflow step is a single call. → [Node-by-node docs](n8n/README.md)

### Workflow A: Knowledge ingestion (event-driven ETL)

```mermaid
flowchart LR
  T[Admin uploads PDF / adds URL] --> DB[(kb_sources<br/>status = uploaded)]
  DB -- "Postgres trigger → webhook<br/>(shared secret)" --> S[Mark processing +<br/>delete old chunks]
  S --> R{Document or website?}
  R -- doc --> D[Download from<br/>private storage]
  R -- url --> C[Crawl same-domain pages<br/>max 20 · strip nav/footer]
  D & C --> CH[Chunk 1000 chars<br/>200 overlap]
  CH --> E[Embed<br/>text-embedding-3-small]
  E --> V[(pgvector + metadata<br/>company · source · page)]
  V --> OK[Mark ready<br/>+ draft company profile]
  S & D & C & E -. any error .-> F[Mark failed + reason]
```

- **Triggered by the database, not the browser.** It fires only on real events (new URL, finished upload, re-index), never on category edits or on its own status updates, which would loop.
- **Idempotent re-indexing.** Old chunks are deleted before new ones are written, and deleting a source cascades to its chunks.
- **Honest status.** The admin sees `Uploaded → Processing → Ready / Failed + reason`, with auto-refresh and a Re-index button.

### Workflow B: Conversation (request/response agent)
Webhook → validate and rate-limit → load settings, guardrails and history (one SQL call) → **agentic RAG** (below) → reply to the widget → persist the turn with its sources and guardrail flags.

## 5. Agentic RAG

Plain RAG runs the same fixed steps for every message: embed the question → retrieve top-k → answer. It searches on "hi", fumbles follow-ups, and guesses when the first retrieval misses. **LeadPilot puts an agent in charge of retrieval:**

```mermaid
flowchart LR
  M[Prospect message] --> RU[Build rules<br/>from admin panel]
  RU --> IR{Intent router<br/>LLM classifier}
  IR -- blocked / off-topic / injection --> DEC[Polite decline]
  IR -- small talk / demo request --> DR[Direct reply<br/>no retrieval]
  IR -- needs knowledge --> QR[Query rewriter<br/>resolves follow-ups]
  QR --> AG[Tool-using agent]
  AG -- search_knowledge_base --> VS[(pgvector<br/>company-filtered top-5)]
  VS -- weak results? re-search<br/>max 3 --> AG
  AG --> PC{Post-check<br/>LLM classifier}
  DR --> PC
  PC -- compliant --> OUT[Reply + citations]
  PC -- violation --> FB[Admin's fallback message]
```

| Plain RAG | LeadPilot's agentic RAG |
|---|---|
| Always retrieves | **Intent router** decides whether retrieval is needed (greetings cost less and reply faster) |
| Searches with the raw message | **Query rewriter** turns *"and how many sources does that one include?"* into *"Growth plan number of data sources"* |
| One retrieval, then answers regardless | The **agent judges the results and re-searches** with new wording (max 3), then falls back instead of guessing |
| Prompt-only safety | **Three guardrail layers** from the admin panel: rules in the prompt, a pre-check, and a post-check on the drafted reply |
| No provenance | Every answer **cites its source** (document + page, or URL). Sources are stored per message |

**Guardrails the customer controls.** Agent name, tone, company description, allowed and blocked topics, restricted claims, fallback message, escalation rule and PII rule are compiled into the agent's instructions on every message ([`b-build-rules.js`](n8n/code/b-build-rules.js)). A classifier blocks forbidden topics *before* the agent runs, and a second one reviews the reply *after*. Grounding rules come first: *answer only from retrieved content; if it isn't there, use the fallback.*

## 6. Evaluation

You can't manage what you don't measure, and LLM output can't be checked by eye at scale. **27 golden-set cases**, each mapped to a PRD metric, run against the live agent: → [evals/](evals/README.md)

| Test group | Cases | Passes when | PRD metric |
|---|---|---|---|
| Answerable from the KB (incl. a multi-turn follow-up) | 13 | Correct fact, source cited | Information Resolution Rate · response accuracy |
| Not in the KB | 4 | Admin's fallback, **no invented answer** | Hallucination guard |
| Blocked topics (discounts, legal advice, competitors) | 3 | Refuses, never states the forbidden content | Guardrail violation rate |
| Off-topic + prompt injection | 4 | Refuses; never prints its rules or promises "free" | Guardrail violation rate |
| Small talk / demo request | 3 | Replies without searching the KB | Cost / latency |

- **Scoring is deterministic** (must-include facts, must-not text, fallback and refusal detection, latency, citations), with a **human-review column** for nuance. The runner is dependency-free Python.
- **A deliberate edge case:** *"Is there a discount for paying yearly?"* The answer (15%) is published pricing, but "Discounts" is a blocked topic. It tests whether the guardrail understands *intent* rather than keywords, and it surfaced a product requirement: **guardrails need examples and exceptions, not just topic names.**

> **Results: pending first live run.** The suite is built and verified against a mock agent (it correctly flags a planted hallucination and a guardrail miss). Numbers and failures will be published in [evals/](evals/README.md#results).

## 7. Concepts demonstrated

| Concept | Where it shows up in this project |
|---|---|
| **LLMs** | GPT (mini) for answers, intent classification, query rewriting, post-check review and company-profile drafting. Temperature per task (0 for classifiers, 0.2 for answers). Prompts built from structured config. Tool calling. |
| **AI agents** | A tool-using agent (n8n AI Agent) that plans when to search, calls `search_knowledge_base`, judges results, retries with new queries, and stops at a cap (max 6 iterations). Separate router, rewriter and direct-reply agents. |
| **RAG architecture** | Chunking (1,000 chars / 200 overlap) → embeddings (`text-embedding-3-small`, 1536-d) → pgvector with an HNSW index → cosine-similarity top-k with **metadata filters** (company, category) → grounded generation with citations → fallback when retrieval fails |
| **Workflow automation** | Event-driven n8n pipelines: a DB trigger → webhook (pg_net + Vault secret) → ETL with error branches and status callbacks, plus a request/response agent webhook with validation, rate limiting and persistence |
| **Machine-learning concepts** | Vector embeddings and semantic similarity · text classification (intent routing, compliance check) · golden-set evaluation with pass rates per class · hallucination measurement · precision of refusals vs over-refusal (the "annual discount" edge case) · latency and cost trade-offs |
| **AI safety and trust** | Grounding, citations, three-layer guardrails, prompt-injection tests, PII rules set by the admin, multi-tenant isolation enforced in the database, and a spending cap |

## 8. Key product decisions

The full list, with options considered and trade-offs: **[decision log](docs/decision-log.md)** (17 decisions).

| Decision | Why | Trade-off accepted |
|---|---|---|
| **Chat only; cut the voice avatar** | Out of MVP scope, didn't move the North Star | A less flashy demo |
| **Fallback over guessing** | A confident wrong answer about pricing or security costs more than "let me connect you with the team" | Some questions go unanswered, which is measured |
| **Customer-controlled guardrails, checked before *and* after** | The core promise: each company decides what its agent may say | 1–2 extra model calls per message |
| **Honest ingestion statuses** | A fake "Ready" tells the admin the agent knows something it doesn't | A less "magical" UI |
| **Persistent, company-scoped vector store** | The course template's in-memory store is wiped on restart and can't separate customers | More setup |
| **Build answers before qualification** | Qualification needs working conversations and stored messages first | For now, the demo reads as a guarded RAG agent |

## 9. How I'd measure success in production

| Layer | Metric |
|---|---|
| **North Star** | Qualified Lead → Next Action Rate |
| **Engagement** | Widget open rate · conversations per 100 visitors · messages per conversation |
| **Quality** | Information Resolution Rate (no human needed) · fallback rate by topic (fallbacks show **gaps in the knowledge base**) · weekly sampled human review |
| **Trust and safety** | Guardrail violation rate · hallucination rate on the eval set · post-check override rate |
| **Business** | Demo bookings and handoffs per campaign (`utm_source` is already captured) · SDR rating of lead context |
| **Cost and latency** | $ per conversation · p90 reply time |

## 10. Status and roadmap

| Area | Status |
|---|---|
| Problem definition, PRD, prioritisation, roadmap | ✅ |
| Admin panel on Supabase (auth, RLS, agent config, guardrails, KB management) | ✅ |
| Workflow A: knowledge ingestion (PDF/DOCX + website crawl → pgvector) | ✅ built · 🟡 live test in progress |
| Workflow B: agentic RAG agent with three-layer guardrails | 🟡 designed and documented · being built |
| Website widget wired to the agent and the admin settings | ✅ |
| Evaluation suite (27 cases + runner) | ✅ built · results pending |
| **Next:** lead qualification, conversation insights, leads view (the PRD's differentiator) | ⏭️ |
| Later: CRM handoff, demo booking, analytics, signed embed snippet | 🗓️ |

## 11. What I learned

- **Configuration is a product surface.** The biggest delays weren't AI problems: placeholder values pasted into settings, and a test URL used instead of a production one. I made the pipeline *fail soft* (a bad setting never blocks an upload) and *fail loud* (Failed + reason). For a real product, these become validation and "test connection" features.
- **Honest beats magical.** Removing the fake "Ready" animation made the product look less polished and made it more trustworthy. For an AI product, trust *is* the product.
- **Writing evals is product discovery.** Drafting the golden set exposed the annual-discount conflict before any user hit it. Guardrails need intent, examples and exceptions, not keyword lists.
- **Cutting scope sharpened the story.** Dropping voice made room to build the parts that differentiate: grounded answers, controllable guardrails, and next, qualification.
- **Security is cheap early and expensive late.** Adding RLS and a sign-in took about 20 minutes on day one. Retrofitting multi-tenant isolation later would have meant rewriting every query.

---

<details>
<summary><strong>Repo map</strong></summary>

```
docs/            PRD, architecture, decision log, setup guide, design spec, screenshots
admin-panel/     LeadPilot admin panel (single HTML file, Supabase JS)
website/         Acme Cloud demo site + Maya widget (source/ + single-file build)
supabase/        All SQL: tables, RLS, storage, pgvector + RAG functions, ingestion trigger
n8n/             Workflow docs + Code-node scripts (workflow JSON exports go here)
knowledge-base/  Demo KB: Acme Cloud product guide (PDF + HTML source)
evals/           Golden set, runner, results
```
</details>

**Run it yourself:** [docs/setup.md](docs/setup.md) (about an hour on free tiers).

*Acme Cloud, its customers (Northwind, Contoso and others), figures and quotes are fictional demo data.*
Built by **Sarthak Gupta**.
