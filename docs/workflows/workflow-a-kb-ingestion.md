# Workflow A: Knowledge ingestion

**Job:** when an admin uploads a document or adds a website in the LeadPilot admin panel, turn it into **searchable, labelled knowledge** that Maya can cite, automatically, with an honest status the admin can see.

**Type:** event-driven ETL pipeline (extract → transform → load) · **Trigger:** Supabase database webhook · **Runs on:** n8n Cloud

← [Workflows overview](README.md) · [Workflow B: Agentic RAG](workflow-b-agentic-rag.md) →

---

## Flow diagram

```mermaid
flowchart TD
  W([🔔 Webhook<br/>POST /kb-ingest<br/>secret header required]):::trigger
  S[Start ingestion<br/>rpc/start_ingestion<br/><i>status → processing<br/>delete old chunks</i>]:::db
  R{Is website?}:::decision

  subgraph DOC["📄 Document branch (PDF / DOCX)"]
    D[Download file<br/>from private Storage]:::db
    VD[(Store document chunks<br/>Supabase Vector Store)]:::ai
    RD[Mark ready<br/>rpc/finish_ingestion]:::db
  end

  subgraph WEB["🌐 Website branch"]
    H[Fetch homepage]:::step
    L[Collect links<br/>same domain · max 20<br/>skip blog, careers, legal]:::code
    P[Fetch pages<br/>5 at a time]:::step
    C[Clean text<br/>strip nav, footer, scripts]:::code
    VW[(Store website chunks<br/>+ page URL)]:::ai
    RW[Mark ready<br/>+ pages indexed]:::db
    G[Draft company context<br/>GPT mini]:::ai
    SD[Save context draft<br/>→ agent_config]:::db
  end

  F[❌ Mark failed<br/>+ error reason]:::fail

  W --> S --> R
  R -- no --> D --> VD --> RD
  R -- yes --> H --> L --> P --> C --> VW --> RW --> G --> SD
  D -. error .-> F
  VD -. error .-> F
  H -. error .-> F
  L -. error .-> F
  C -. error .-> F
  VW -. error .-> F

  subgraph SUB["Inside each 'Store chunks' node"]
    direction LR
    DL[Default Data Loader<br/>+ metadata labels] --> TS[Recursive Text Splitter<br/>1000 chars · 200 overlap] --> EM[Embeddings OpenAI<br/>text-embedding-3-small]
  end

  classDef trigger fill:#fef3c7,stroke:#d97706,color:#78350f;
  classDef db fill:#ecfdf5,stroke:#059669,color:#064e3b;
  classDef ai fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b;
  classDef code fill:#fff7ed,stroke:#ea580c,color:#7c2d12;
  classDef step fill:#f8fafc,stroke:#64748b,color:#0f172a;
  classDef decision fill:#fdf4ff,stroke:#a21caf,color:#4a044e;
  classDef fail fill:#fef2f2,stroke:#dc2626,color:#7f1d1d;
```

**Legend:** 🟨 trigger · 🟩 database call · 🟪 AI / vector step · 🟧 custom code · ⬜ HTTP step · 🟥 error path

## What each node does, and why

| # | Node | What it does | Why it's designed this way |
|---|---|---|---|
| 1 | **Webhook** | Receives `{source_id}` from Supabase | **Header Auth** with a shared secret, so only my database can start ingestion, even though the URL is public |
| 2 | **Start ingestion** | One SQL function: marks the source *processing*, **deletes its old chunks**, returns the row | Re-indexing is clean (no duplicate chunks), and the admin sees a spinner immediately |
| 3 | **Is website?** | Routes on `source_type` | Documents and websites are read in completely different ways |
| 4 | **Download file** | Fetches the file from the **private** storage bucket with the service key | Prospect-facing agents need internal docs; the bucket is never public |
| 5 | **Store document chunks** | Loads the PDF/DOCX → splits → embeds → writes to `kb_chunks` | See "chunking and labels" below |
| 6 | **Mark ready** | Status → *ready*, `indexed_at` set · **Execute Once** | Without *Execute Once* it would run once **per chunk** |
| 7–10 | **Fetch homepage → Collect links → Fetch pages → Clean text** | A small, polite crawler: same domain only, max 20 pages, 5 at a time, strips menus and footers | Menus and footers repeat on every page; left in, they'd fill the KB with duplicate "Home · Pricing · Contact" chunks |
| 11 | **Store website chunks** | Same as #5, plus `page_url` and `page_title` labels | So Maya can cite *which page* an answer came from |
| 12–14 | **Mark ready → Draft company context → Save draft** | GPT writes a 180-word company profile from the crawl into a *draft* field | PRD requirement: auto-draft the context for the admin to **review**. It never overwrites their text |
| 15 | **Mark failed** | Any error output → status *failed* + the error reason | The admin sees **Failed: reason** instead of an endless spinner, and can click Re-index |

### Chunking and labels (the RAG foundation)

Every chunk is stored with **metadata labels**. Here's a real one from the Acme Cloud guide:

```jsonc
{
  "company_id":  "3fbdd46d-…",            // multi-tenant isolation: search is always filtered by this
  "source_id":   "d3cc6409-…",            // deleting the source cascades to its chunks
  "source_type": "pdf",
  "source_name": "acme-cloud-product-guide.pdf",   // what Maya cites
  "category":    "Product",               // lets search be narrowed to e.g. Pricing
  "loc": { "pageNumber": 1 }              // "Source: …pdf, p. 1"
}
```

| Choice | Value | Reasoning |
|---|---|---|
| Chunk size | 1,000 characters | About one idea per chunk: specific enough to match a question, big enough to answer it |
| Overlap | 200 characters | A sentence cut at a boundary still appears whole in one of the two chunks |
| Embedding model | `text-embedding-3-small` (1,536 dimensions) | Cheap and strong. **Must be identical in Workflow B**, or question and chunks are measured on different scales |
| Index | pgvector HNSW, cosine distance | Fast approximate nearest-neighbour search inside Postgres, with no separate vector DB |

## How it's triggered (and why not from the browser)

```mermaid
flowchart LR
  E1[Admin adds a URL] --> T{kb_sources change}
  E2[Admin's file upload finishes] --> T
  E3[Admin clicks Re-index] --> T
  E4[Admin changes a category] -.-> T
  E5[n8n sets processing / ready / failed] -.-> T
  T -- "E1, E2, E3 only" --> N[pg_net → n8n webhook<br/>URL + secret from Vault]
  T -. "E4, E5: ignored<br/>(no wasted runs, no infinite loop)" .-> X[no call]
```

A Postgres trigger calls n8n only for the three events that need processing. The n8n URL and secret are kept in **Supabase Vault**, not in code. If the call can't be sent (say, a misconfigured URL), the trigger **logs a warning instead of blocking the upload**. That rule came from a real incident, described in the [build journal](../build-journal.md).

## Results (live run)

| Check | Result |
|---|---|
| Source | `acme-cloud-product-guide.pdf` (4 pages) |
| Status in admin panel | Uploaded → Processing → **Ready**, with no manual refresh |
| Chunks written | **9**, each 81–995 characters, each with a 1,536-d embedding |
| Labels | company, source, file name, category and **page number** on every chunk |
| Spot check | The pricing chunk ("Starter … $49") is present and later retrieved by Maya |

## How to rebuild it
Field-by-field settings: [docs/setup.md, section 3](../setup.md#3-workflow-a-kb-ingestion) · Code nodes: [`a-collect-links.js`](../../n8n/code/a-collect-links.js), [`a-clean-text.js`](../../n8n/code/a-clean-text.js) · SQL: [`05_rag.sql`](../../supabase/05_rag.sql), [`06_ingest_trigger.sql`](../../supabase/06_ingest_trigger.sql)
