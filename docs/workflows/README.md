# Workflows: how LeadPilot works end to end

LeadPilot runs on **two n8n workflows** connected through **Supabase**. This page shows how everything fits together. The two deep dives explain every node.

| Workflow | Job | Deep dive |
|---|---|---|
| **A · Knowledge ingestion** | Turns a PDF, DOCX or website into searchable, labelled knowledge | [workflow-a-kb-ingestion.md](workflow-a-kb-ingestion.md) |
| **B · Maya chat (agentic RAG)** | Answers a prospect from that knowledge, inside the admin's guardrails | [workflow-b-agentic-rag.md](workflow-b-agentic-rag.md) |

How it was built, what broke, and what I learned: **[build journal](../build-journal.md)**.

---

## The big picture

```mermaid
flowchart LR
  subgraph ADMIN["👩‍💼 Admin (RevOps / Marketing)"]
    AP[LeadPilot<br/>Admin Panel]
  end
  subgraph PROSPECT["🧑‍💻 Prospect"]
    WS[Acme Cloud website<br/>+ Maya chat widget]
  end
  subgraph SUPA["🗄️ Supabase: single source of truth"]
    CFG[(agent_config<br/>guardrails)]
    SRC[(kb_sources<br/>+ Storage)]
    VEC[(kb_chunks<br/>pgvector)]
    CHAT[(conversations<br/>messages)]
    TRG{{DB trigger<br/>pg_net + Vault}}
  end
  subgraph N8N["⚙️ n8n Cloud"]
    A[Workflow A<br/>Knowledge ingestion]
    B[Workflow B<br/>Agentic RAG chat]
  end
  OAI[🤖 OpenAI<br/>embeddings + GPT]

  AP -- "1 · persona & guardrails" --> CFG
  AP -- "2 · upload PDF / add URL" --> SRC
  SRC --> TRG -- "3 · webhook + secret" --> A
  A -- "4 · chunks + embeddings" --> VEC
  A -. status: ready / failed .-> SRC
  A <--> OAI
  WS -- "5 · prospect question" --> B
  B -- "6 · rules + history" --> CFG
  B -- "7 · semantic search" --> VEC
  B <--> OAI
  B -- "8 · save turn + sources" --> CHAT
  B -- "9 · grounded reply" --> WS

  classDef ai fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b;
  classDef db fill:#ecfdf5,stroke:#059669,color:#064e3b;
  classDef ui fill:#fff7ed,stroke:#ea580c,color:#7c2d12;
  class A,B,OAI ai;
  class CFG,SRC,VEC,CHAT,TRG db;
  class AP,WS ui;
```

**Reading the diagram:** the admin panel never calls n8n directly. It only writes to Supabase, and Supabase triggers n8n. Both workflows read their settings from Supabase on every run. That's why a guardrail saved in the admin panel applies to Maya's **very next** reply, with no deploy and no sync job.

## Flow 1: an admin adds knowledge

```mermaid
sequenceDiagram
  autonumber
  actor Admin
  participant Panel as Admin Panel
  participant DB as Supabase (Postgres + Storage)
  participant A as n8n · Workflow A
  participant AI as OpenAI Embeddings

  Admin->>Panel: Upload acme-cloud-product-guide.pdf
  Panel->>DB: Insert kb_sources row (status = uploaded)
  Panel->>DB: Upload file to private bucket, save path
  DB-->>A: Trigger fires → POST /webhook/kb-ingest (+ secret header)
  A->>DB: start_ingestion(): status = processing, delete old chunks
  A->>DB: Download the PDF
  A->>A: Split into ~1,000-char chunks (200 overlap), label each chunk
  A->>AI: Embed every chunk (text-embedding-3-small)
  AI-->>A: 1,536-number vector per chunk
  A->>DB: Insert chunks into kb_chunks (pgvector)
  A->>DB: finish_ingestion(): status = ready
  Panel-->>Admin: Auto-refresh shows "Ready" ✅
```

## Flow 2: a prospect asks Maya a question

```mermaid
sequenceDiagram
  autonumber
  actor Prospect
  participant Widget as Maya widget (Acme Cloud site)
  participant B as n8n · Workflow B
  participant DB as Supabase
  participant AI as OpenAI (GPT + embeddings)

  Prospect->>Widget: "How much is the Starter plan?"
  Widget->>B: POST /webhook/maya-chat {company_id, session_id, message, utm_source}
  B->>B: Validate input
  B->>DB: chat_context(): settings, guardrails, last 10 messages, rate count
  B->>B: Build rules (admin guardrails → system prompt)
  B->>AI: Intent Router: kb_question / general / blocked?
  AI-->>B: kb_question
  B->>AI: Query Rewriter → "Starter plan price"
  B->>AI: Maya agent decides to call search_knowledge_base
  AI->>DB: match_kb_chunks(query embedding, company filter)
  DB-->>AI: Top-5 chunks + source metadata
  AI-->>B: "The Starter plan costs $49 per user per month…"
  B->>AI: Post-check: compliant with guardrails?
  AI-->>B: compliant
  B-->>Widget: {reply, sources: ["acme-cloud-product-guide.pdf"]}
  B->>DB: save_chat_turn(): both messages + sources + flags
  Widget-->>Prospect: Answer with source
```

## What each part is responsible for

| Layer | Owns | Why it lives there |
|---|---|---|
| **Admin panel** | Configuration UX | Non-technical admins change agent behaviour without code |
| **Supabase** | Data, security, business rules (RLS, SQL functions, triggers) | One source of truth; security enforced where the data lives |
| **n8n** | Orchestration: calling models, branching, retries, error paths | Visual, inspectable pipelines; each run is logged and replayable |
| **OpenAI** | Embeddings (meaning → numbers) and language (classify, rewrite, answer, review) | Best-in-class models behind one API key and one spending cap |
