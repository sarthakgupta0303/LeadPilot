> Source: the living PRD for LeadPilot AI (exported 2026-09-28). Build decisions made after this version are recorded in [decision-log.md](decision-log.md).

# LeadPilot AI — PRD

AI-powered product discovery, lead qualification, and sales handoff agent for SMBs and enterprise customers

2026-09-27 · Sarthak Gupta

## Week 1 — 1. Problem Definition

### What problem is this solving?

SMBs and enterprise companies generate leads through their website and marketing campaigns, but interested prospects often have questions before they are ready to buy. Sales teams also receive leads without enough context to understand the prospect's intent, requirements, or whether the lead is actually qualified.

LeadPilot AI is an AI agent (with a conversational avatar) that sits on a company's website or is shared as a link through marketing campaigns. It is powered by an agentic RAG pipeline over the company's own knowledge base, which the company manages from an admin panel.

When a prospect interacts with the agent, it can:

- Understand what the prospect is looking for.
- Answer questions using the company's product knowledge, FAQs, onboarding information, and other approved content.
- Capture intent from the conversation and website activity.
- Ask relevant qualification questions.
- Determine whether the prospect is a good lead.
- Recommend the appropriate next action.
- Route or hand off qualified leads to the appropriate salesperson.

The system stores the prospect's information and intent so that when the person returns, their previous context can be used in the next interaction.

When a prospect interacts with my website or marketing campaign, help them get the information they need while understanding their intent, qualifying them, and giving my sales team the context they need to take the right next action.

### Who are you solving this problem for?

at SMBs and enterprises that:

- Generate leads through their website and marketing campaigns.
- Need to engage prospects without adding significant manual effort.
- Want to capture and understand prospect intent.

who sets up and controls the agent:

- Names the agent and defines its persona and greeting.
- Provides company context (who the company is, products, ICP, tone).
- Defines guardrails (allowed and blocked topics, what the agent must never say, escalation rules).
- Defines qualification criteria.
- Uploads and manages knowledge base documents.

receive AI-generated insights from prospect conversations: prospect intent, requirements, qualification signals, key questions, product interest, and recommended next action. This helps them understand the lead before follow-up and prioritize outreach.

use the AI agent to ask product questions, understand product fit, get relevant information, share their requirements, and determine the appropriate next step.

### Why is this problem worth solving?

SMBs and enterprises generate prospects through websites and campaigns but often lack the sales capacity to engage and qualify every prospect in real time. LeadPilot AI helps companies:

- Give prospects immediate product information.
- Capture the prospect's actual intent.
- Qualify leads automatically.
- Reduce manual qualification effort.
- Give SDRs/BDRs richer context before follow-up.
- Recommend the appropriate next action.
- Capture information that can be used when the prospect returns.

The product combines product discovery, intent capture, lead qualification, and sales intelligence in one interaction.

### Why Agentic AI and not rule-based?

A rule-based chatbot handles predefined questions and flows, but prospects ask unexpected questions and share information in different ways. The agent can:

- Understand the prospect's intent.
- Decide when to retrieve company knowledge, reformulate the query, and retrieve again if the first result is not relevant (agentic RAG).
- Ask relevant follow-up questions.
- Understand the prospect's requirements.
- Qualify the lead.
- Recommend the next action.
- Generate insights for the SDR/BDR.

It combines website activity, campaign context, conversation history, and previous interactions to adapt the conversation.

A hybrid approach is used: the AI handles understanding and conversation, while deterministic rules handle critical qualification, routing, guardrails, and business logic.

### What's your MOAT?

The moat is the combination of .

LeadPilot AI understands company and product information, FAQs, pricing, use cases, qualification criteria, the prospect conversation, website activity, campaign source, and previous interactions. It converts this into actionable sales intelligence: .

Unlike a generic ChatGPT-style experience, the product is built around the company's sales process and prospect journey, and each company controls its own knowledge, context, and guardrails through the admin panel. Accumulated prospect context makes future interactions more personalized.

### How will you know that the problem is solved?

percentage of qualified prospects for whom LeadPilot AI successfully recommends or initiates the appropriate next action.

| Metric | Definition |
|---|---|
| Lead Qualification Rate | % of prospects successfully classified as qualified/unqualified |
| Qualification Accuracy | % of AI qualification decisions matching human assessment |
| Qualified Lead Conversion | % of qualified leads taking the recommended next action |
| Information Resolution Rate | % of conversations where the prospect gets the required information without human intervention |
| Sales Insight Accuracy | Accuracy of AI-generated intent, requirements, and qualification insights |

conversation completion rate, AI response accuracy, knowledge retrieval accuracy, average qualification time, lead handoff rate, meeting/demo booking rate, returning prospect recognition rate, website-to-qualified-lead conversion, campaign-to-qualified-lead conversion, KB ingestion success rate, guardrail violation rate.

Detailed evaluation methodology is covered in a separate evaluation PRD.

## 2. Solution Definition

### User Flows

*(Diagram in the original document — see [architecture.md](architecture.md).)*

When the admin adds a company URL, n8n crawls the site in the same workflow, adds the pages to the KB, and drafts the company context for review. If ingestion fails, the source shows Failed with an error reason and the admin can retry.

*(Diagram in the original document — see [architecture.md](architecture.md).)*

The next action is one of the admin-allowed options: route to a rep, book a demo, or contact sales.

*(Diagram in the original document — see [architecture.md](architecture.md).)*

The campaign source travels with the conversation, so insights can be reported per campaign.

*(Diagram in the original document — see [architecture.md](architecture.md).)*

The agent uses stored intent and history to continue the conversation rather than starting over.

### Functional Requirements

- Agent is available on the company's website as an embeddable avatar chat widget.
- Avatar shows the agent name, avatar image, and greeting configured in the Admin Panel.
- Company can generate a shareable agent link for email and marketing campaigns; the link carries campaign source (e.g. UTM parameters).
- Agent maintains conversation context within a session.
- Every prospect message is sent to the agentic RAG pipeline; every reply is grounded in retrieved KB content or clearly states it doesn't know.
- Agent follows the company context and guardrails configured in the Admin Panel.
- Agent can capture prospect details (name, email, company, role) when the prospect shares them.

- Agent name, avatar image, greeting message, tone of voice.

- Company website URL: admin adds the company URL and triggers indexing.
- The system crawls the website, auto-drafts the company context (overview, products/services, target customers, key differentiators), and adds the crawled pages to the KB.
- Admin reviews and edits the auto-drafted context before saving.
- Company overview, products/services, target customers (ICP), key differentiators.
- Stored as structured text and injected into the agent's system prompt.

- Allowed topics and blocked topics.
- Restricted claims (e.g. no discounts, no legal/compliance promises, no competitor comparisons unless approved).
- Fallback message when the answer isn't in the KB.
- Escalation rule: when to offer human contact.
- PII handling rule: which prospect details the agent may ask for.
- Guardrails are enforced at two layers: in the system prompt and as a pre-/post-response check.

- Company defines qualification fields (e.g. company size, budget, timeline, use case, role) and the rules for Qualified / Not qualified / Needs follow-up.
- Company selects the allowed next actions.

- Two KB sources in MVP: company website URL (crawled pages) and uploaded PDFs.
- Upload KB documents (PDF) with a document category (Product, FAQ, Pricing, Onboarding, Use cases, Docs).
- View all KB sources (URL pages and documents) with status: Uploaded, Processing, Ready, Failed.
- Delete a source (removes the file or pages and their chunks/embeddings).
- Re-index a source after an update (e.g. re-crawl the website after content changes).
- Each upload or URL indexing request triggers the n8n ingestion workflow.

- List of conversations with qualification outcome, insights, and recommended next action.

- Admin Panel calls an n8n webhook with the file or company URL and metadata (source id, company id, category).
- For a URL: n8n crawls the website (same domain, configurable page limit), extracts clean text from each page, and records the page URL as the source.
- For a URL: n8n generates a company context draft (overview, products, ICP, differentiators) from the crawled content and saves it to agent_config for admin review.
- For a PDF: n8n uploads the raw file to Supabase Storage and extracts text.
- n8n splits text into chunks with overlap and generates embeddings.
- n8n writes each chunk, its embedding, and metadata (source id, source type, page URL or page number, category, chunk index) to the Supabase vector table (Postgres + pgvector).
- n8n updates the source status in Supabase; the Admin Panel reflects it.
- On failure, status is set to Failed with an error reason; the admin can retry.
- Deleting or re-indexing a source removes its old chunks before new ones are written.

- Loads agent settings, company context, and guardrails for the company at the start of each conversation.
- Classifies the prospect's message (product question, pricing, qualification answer, small talk, off-topic/blocked).
- Decides whether retrieval is needed; if so, rewrites the query and runs semantic search on the Supabase vector store (filtered by company and, when relevant, category).
- Grades retrieved chunks for relevance; if weak, reformulates and retrieves again (max retries configurable).
- Generates an answer grounded only in retrieved content and company context; stores source chunks used.
- If no relevant content is found, uses the configured fallback message and offers the next action.
- Uses tools within the agent loop: knowledge search, capture prospect info, update qualification, recommend next action.
- Applies guardrail checks before returning a response.

Company provides product information, FAQs, pricing, onboarding information, product documentation, and use cases through the Admin Panel. The agent uses only approved company knowledge to answer prospect questions.

The system captures product of interest, requirements, use case, questions asked, purchase intent, qualification information, website activity, and campaign source.

- The company defines qualification criteria in the Admin Panel.
- The agent asks relevant qualification questions, collects required information, determines whether the prospect meets the criteria, and provides a qualification outcome.
- Final qualification outcome is computed by deterministic rules over the extracted signals.

After the interaction, the system generates intent, requirements, product interest, qualification signals, key questions, and recommended next action. Insights are available to SDRs/BDRs in the Admin Panel leads view and link back to the conversation.

Based on intent and qualification, the agent recommends one of the admin-allowed actions: book a demo, contact sales, speak with a specific representative, continue researching, or receive relevant product information.

For qualified prospects, the system passes captured information to the appropriate sales representative: prospect information, product interest, requirements, questions asked, qualification outcome, conversation insights, recommended next action, and campaign/source information.

The system stores previous conversations, product interest, intent, qualification information, website activity, and campaign interactions in Supabase. When the prospect returns, the agent uses the stored context for a more relevant interaction.

## MVP Prototype — Scope & Architecture

The MVP is a working prototype with four parts: an Admin Panel, an n8n ingestion workflow, a Supabase knowledge store, and a website avatar agent backed by an agentic RAG pipeline.

*(Diagram in the original document — see [architecture.md](architecture.md).)*

The admin path writes knowledge and configuration into Supabase; the prospect path reads them on every message and writes conversations, qualification, and insights back.

### System components

| Component | Responsibility | Technology |
|---|---|---|
| Admin Panel | Agent settings, company URL indexing, company context, guardrails, qualification criteria, KB upload and status, leads view | Web app on Supabase (auth + tables) |
| KB ingestion workflow | Receive upload or company URL, crawl site, store file, extract text, draft company context, chunk, embed, write vectors, update status | n8n (webhook trigger) |
| Knowledge store | Raw files, chunk embeddings, config, prospects, conversations, insights | Supabase Storage + Postgres + pgvector |
| Agentic RAG agent | Intent detection, retrieval with relevance grading and re-query, grounded answers, guardrail checks, qualification, insights, next action | LLM + embedding model, tool-calling agent |
| Website avatar agent | Prospect-facing chat with avatar, embeddable on website and openable via campaign link | Web chat widget |

### Data model (Supabase)

| Table | Key fields |
|---|---|
| agent_config | company_id, agent_name, avatar_url, greeting, tone, company_url, company_context, context_draft |
| guardrails | company_id, allowed_topics, blocked_topics, restricted_claims, fallback_message, escalation_rule, pii_rule |
| qualification_criteria | company_id, field, rule, required, allowed_next_actions |
| kb_sources | id, company_id, source_type (pdf / url), file_name, source_url, category, storage_path, pages_indexed, status, error, indexed_at |
| kb_chunks | id, source_id, company_id, source_type, category, page_url, page, chunk_index, content, embedding (vector) |
| prospects | id, company_id, name, email, company, role, source, first_seen, last_seen |
| conversations | id, prospect_id, company_id, campaign_source, started_at |
| messages | id, conversation_id, role, content, retrieved_sources, created_at |
| lead_insights | conversation_id, intent, requirements, product_interest, qualification_outcome, qualification_signals, key_questions, next_action |

### MVP in scope

- Admin Panel: agent name, avatar, greeting, company URL indexing with auto-drafted company context, guardrails, qualification criteria, PDF upload, source status, delete/re-index, leads view.
- n8n workflow that crawls the company website and ingests PDFs into Supabase (Storage + pgvector).
- Agentic RAG agent with retrieval, relevance grading, re-query, grounded answers, guardrail checks.
- Website avatar agent and shareable campaign link.
- Intent capture, qualification questions, qualification outcome, conversation insights, next-action recommendation.
- Conversation and prospect history stored in Supabase.

### Out of scope for MVP

- CRM integration, automated routing to specific reps, calendar/demo booking.
- Other KB sources (DOCX, Notion, Google Drive, help-center connectors) and scheduled automatic re-crawls.
- Voice avatar, multi-language.
- Personalized returning-prospect experience (history is stored, personalization comes in MVP 1).

### MVP acceptance criteria

- [ ] Admin can set agent name, company context, and guardrails, and the agent reflects them in the next conversation.
- [ ] Admin adds the company URL; the site is crawled, pages reach Ready status, and a company context draft appears for review.
- [ ] Agent answers a question using content from a crawled website page and cites that page URL as its source.
- [ ] Admin uploads a PDF and it reaches Ready status, with chunks and embeddings visible in Supabase.
- [ ] Deleting a source removes its chunks, and the agent no longer answers from it.
- [ ] Agent answers a product question using content from an uploaded PDF and stores the source chunks used.
- [ ] Agent returns the fallback message for a question not covered by the KB instead of guessing.
- [ ] Agent declines a blocked topic per guardrails.
- [ ] Agent asks qualification questions and records a qualification outcome.
- [ ] Conversation insights and recommended next action appear in the Admin Panel leads view.
- [ ] Campaign link captures source and the conversation is tagged with it.

## Week 2 — 3. Prioritization

### Agentic workflow components

Admin Panel config → KB upload → n8n ingestion → Supabase (Storage + pgvector)

1. Website / marketing campaign
2. Identify prospect
3. Load agent config, company context, guardrails
4. Understand intent
5. Retrieve company knowledge (agentic RAG)
6. Answer question (with guardrail check)
7. Identify missing information
8. Ask qualification questions
9. Evaluate qualification
10. Generate conversation insights
11. Recommend next action
12. Route / hand off lead
13. Store prospect context

### Risks at each component

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Config is entered by the admin | NO — deterministic forms and storage |
| Can it scale? | Multiple companies, each with their own config | PASS — scoped by company_id |
| What are the laws? | Admin access controls what the agent says publicly | Authentication and role-based access required |
| Key risk | Weak or missing guardrails let the agent make unapproved claims | Medium risk |
| Mitigation | Default guardrails + fallback message pre-filled; enforced in prompt and response check | Required |
| How transparent/explainable? | Team needs to know who changed what | Store config change history |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Embeddings and the context draft need a model; crawling, parsing and chunking are deterministic | Partial — embedding model + LLM for context draft |
| Do you have data? | Company website and PDFs added via Admin Panel | PASS |
| Can it scale? | Large sites or many PDFs per company | PASS — async workflow, page limit, status tracking |
| Key risk | Poor text extraction (scanned PDFs, tables, JS-heavy pages) leads to bad retrieval | Medium risk |
| Key risk | Crawl picks up irrelevant or outdated pages (blog, careers, legal) | Medium risk |
| Key risk | Auto-drafted company context is inaccurate | Medium risk |
| Key risk | Stale chunks remain after a source is updated or deleted | Medium risk |
| Mitigation | Same-domain crawl with page limit and include/exclude paths; admin reviews context draft; status + error reporting; delete old chunks before re-index | Required |
| What are the laws? | KB may contain confidential content; crawling should respect the site's robots rules | Private storage bucket, row-level security by company; crawl only the company's own domain |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Need to determine whether the prospect is new or returning | NO — deterministic identity mechanisms |
| Do you have data to train? | Identity can use available visitor information | PASS |
| Can it scale? | Must support multiple prospects | PASS |
| What are the laws? | Prospect information may be personal data | Privacy and consent requirements |
| What about bias? | Incorrect matching can associate the wrong information | Identity confidence thresholds |
| How transparent/explainable? | Need to understand how a prospect was identified | Store identity signals |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Prospects express intent in many ways | PASS — LLM is useful |
| Do you have data to train? | Conversations can be used for evaluation | PASS |
| Can it be solved by ML/AI? | AI can understand open-ended requirements | PASS |
| Can it meet accuracy requirements? | Incorrect intent affects qualification | Requires evaluation |
| Can it scale? | Concurrent conversations | PASS |
| What about bias? | Intent interpretation shouldn't unfairly influence qualification | Explicit intent categories and qualification criteria |
| How transparent/explainable? | Sales needs to understand captured intent | Store supporting conversation evidence |
| Easy to judge good vs bad? | Evaluate against labelled conversations | PASS |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Prospects ask questions in different language | PASS |
| Do you have data? | Company provides KB via Admin Panel | PASS |
| Can it be solved by ML/AI? | Agentic RAG with relevance grading and re-query | PASS |
| Can it meet accuracy requirements? | Incorrect information impacts the prospect | Requires evaluation |
| Can it scale? | Many conversations querying the vector store | PASS |
| What are the laws? | KB may contain sensitive company information | Access controls; retrieval filtered by company |
| How transparent/explainable? | Responses should be grounded in approved information | Store retrieved sources per message |
| Easy to judge good vs bad? | Compare against approved answers | PASS |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | AI is useful for understanding prospect responses | Hybrid approach |
| Do you have data? | Qualification criteria and historical conversations | PASS |
| Can it be solved by ML/AI? | AI extracts qualification signals | PASS |
| Can it meet accuracy requirements? | Qualification impacts sales follow-up | Requires high evaluation accuracy |
| Can it scale? | Automatic for every conversation | PASS |
| What about bias? | Incorrect criteria could unfairly exclude prospects | Explicit, admin-defined criteria |
| How transparent/explainable? | Sales needs to understand the decision | Store qualification signals |
| Easy to judge good vs bad? | Compare with human assessment | PASS |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Conversation needs to be summarized and structured | PASS |
| Can it be solved by ML/AI? | LLM extracts intent, requirements, key questions | PASS |
| Can it meet accuracy requirements? | Incorrect insights could mislead SDRs | Requires evaluation |
| How transparent/explainable? | SDR should trace insights back to the conversation | Show supporting conversation context |
| Easy to judge good vs bad? | Evaluate against the original conversation | PASS |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Different prospects need different next actions | PASS |
| Can it be solved by ML/AI? | Agent determines action from context | PASS |
| Can it meet accuracy requirements? | Wrong recommendations impact conversion | Requires evaluation |
| Key risk | Agent recommends an inappropriate action | Medium risk |
| Mitigation | Restrict to admin-allowed actions + business rules | Required |
| How transparent/explainable? | Sales should understand why | Store supporting signals |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Routing should be predictable | NO |
| Can it scale? | Routing rules can be automated | PASS |
| Key risk | Lead sent to the wrong representative | Medium risk |
| Mitigation | Explicit routing rules + fallback owner | Required |
| How transparent/explainable? | Sales needs to know why the lead was routed | Store routing criteria |

| Check | Why do this | Result |
|---|---|---|
| Is ML necessary? | Storage doesn't require AI | NO |
| Can it scale? | History stored as structured data in Supabase | PASS |
| What are the laws? | Stored information may contain personal data | Privacy, consent and retention controls |
| Key risk | Incorrect identity association | High risk |
| Mitigation | Identity confidence thresholds and retention policies | Required |

### Risk summary across components

| Component | Risk | Comment |
|---|---|---|
| Admin Panel config & guardrails | Medium | Weak guardrails allow unapproved claims |
| KB ingestion (n8n → Supabase) | Medium | Poor extraction or stale chunks degrade answers |
| Website / campaign entry | Low | Simple entry point for prospects |
| Prospect identification | Medium | Needs reliable identity resolution |
| Intent detection | Medium | LLM may misunderstand intent |
| Company knowledge retrieval | Medium | Incorrect or outdated information |
| AI response | Medium | Hallucination risk; mitigated by grounding + fallback |
| Lead qualification | High | Incorrect qualification impacts sales |
| Conversation insights | Medium | Incorrect insights can mislead SDRs |
| Next action recommendation | Medium | Inappropriate action |
| Lead routing | Medium | Incorrect routing delays follow-up |
| Prospect memory | High | Identity and privacy risks |
| Overall agent workflow | Medium–High | Errors in one component affect downstream actions |

### Prioritized scope

- Admin Panel: agent name, avatar, greeting, company context
- Admin Panel: guardrails configuration
- Admin Panel: qualification criteria and allowed next actions
- Admin Panel: KB document upload, status, delete/re-index
- n8n KB ingestion workflow (extract, chunk, embed) into Supabase
- Supabase knowledge store (Storage + pgvector) and app tables
- Agentic RAG pipeline (retrieve, grade, re-query, grounded answer, guardrail check)
- Website AI avatar agent
- Shareable marketing campaign link
- Prospect intent detection
- Conversational Q&A
- Qualification questions and lead qualification
- Conversation insights (Admin Panel leads view)
- Next-action recommendation
- Prospect interaction history

- Lead routing
- CRM integration
- Sales representative handoff
- Meeting/demo booking
- Additional KB sources (DOCX, Notion, Google Drive) and scheduled website re-crawls

- Advanced intent scoring
- Personalized returning-prospect experience
- Predictive lead qualification
- Automated follow-up

## 4. Roadmap

| Release | Features | Duration |
|---|---|---|
| MVP | Admin Panel (agent name, company context, guardrails, qualification criteria, KB upload), n8n → Supabase KB ingestion, agentic RAG, website avatar agent, shareable campaign link, product Q&A, intent capture, qualification questions, lead qualification, conversation insights, next-action recommendation | 4–6 weeks |
| MVP 1 | Prospect memory, returning prospect recognition, lead routing, sales handoff | 3–4 weeks |
| Launch | CRM integration, meeting/demo booking, sales notifications, qualification analytics, additional KB sources | 3–4 weeks |
| Iteration | Advanced intent scoring, personalized conversations, predictive qualification, automated follow-up | Ongoing |

Evaluation plan and metrics instrumentation will follow in a separate PRD.
