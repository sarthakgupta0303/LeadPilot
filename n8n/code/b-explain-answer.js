// Workflow B · "Explain answer" (Code node, Run Once for All Items)
// Sits just before "Send reply", so every path (answer, decline, small talk, fallback, error) goes through it.
// Builds the trace behind the reply from what the workflow ACTUALLY did. We never ask the model to explain
// itself, because a model's self-explanation can sound right and still be invented.
//   source_details: the passages the answer came from (document, page, the exact sentences)
//   reasoning:      how the message was understood, what was searched, what was found, what the post-check decided
const item = $input.first().json;
const reply = String(item.reply || '');
const flag = item.flag || null;
const fallbackText = String($('Build rules').first().json.fallback || '');

// Safe read of an upstream node: returns null if that branch didn't run.
const from = (name) => { try { return $(name).first().json; } catch (e) { return null; } };

// ---------- 1. Passages the agent retrieved ----------
// "Collect sources" passes the agent's steps along as trace_steps. (Reading "Maya agent" directly from
// here doesn't work: that node has two outputs, answer and error, so $('Maya agent').first() is empty.)
const agentSteps = Array.isArray(item.trace_steps) ? item.trace_steps : null;
const queries = [];
const passages = [];
const seen = new Set();

function collectDocs(v, depth = 0) {
  if (depth > 8 || v == null) return;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('{') || s.startsWith('[')) { try { collectDocs(JSON.parse(s), depth + 1); } catch (e) { /* not JSON */ } }
    return;
  }
  if (Array.isArray(v)) { v.forEach((x) => collectDocs(x, depth + 1)); return; }
  if (typeof v === 'object') {
    if (typeof v.pageContent === 'string') {
      const m = v.metadata || {};
      const doc = {
        source: m.source_name || (m.pdf && m.pdf.info && m.pdf.info.Title) || m.page_url || 'Knowledge base',
        page: (m.loc && m.loc.pageNumber) || m.page || null,
        url: m.page_url || null,
        text: v.pageContent,
      };
      const key = doc.source + '|' + doc.text.slice(0, 80);
      if (!seen.has(key)) { seen.add(key); passages.push(doc); }
      return;
    }
    Object.values(v).forEach((x) => collectDocs(x, depth + 1));
  }
}

for (const step of agentSteps || []) {
  const inp = step.action && step.action.toolInput;
  const q = typeof inp === 'string' ? inp : inp && (inp.input || inp.query);
  if (q && !queries.includes(q)) queries.push(String(q));
  collectDocs(step.observation);
}

// ---------- 2. Pick the sentences that best support the reply ----------
const words = (s) => (s.toLowerCase().match(/[a-z0-9$%][a-z0-9$%.,-]*/g) || []).filter((w) => w.length > 2);
// Ignore the "(Source: …)" citation itself, or every passage would match on the document's name.
const replyBody = reply.replace(/\(\s*source:[^)]*\)/gi, ' ');
const replyWords = new Set(words(replyBody));
const citedPages = [...reply.matchAll(/p\.\s*(\d+)/gi)].map((m) => Number(m[1]));

function bestExcerpt(text) {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+|\s·\s/).filter((s) => s.length > 15);
  let best = { score: 0, i: -1 };
  sentences.forEach((s, i) => {
    const score = words(s).filter((w) => replyWords.has(w)).length;
    if (score > best.score) best = { score, i };
  });
  if (best.i < 0) return { score: 0, excerpt: '' };
  const excerpt = sentences.slice(best.i, best.i + 2).join(' ');
  return { score: best.score, excerpt: excerpt.length > 360 ? excerpt.slice(0, 357) + '…' : excerpt };
}

const answeredFromKb = passages.length > 0 && !flag && reply.trim() !== fallbackText.trim();
let source_details = [];
if (answeredFromKb) {
  const scored = passages.map((p) => ({ ...p, ...bestExcerpt(p.text) }));
  const top = Math.max(0, ...scored.map((p) => p.score));
  source_details = scored
    .filter((p) => p.score >= 2 && p.score >= top * 0.75)
    .sort((a, b) => (citedPages.includes(b.page) - citedPages.includes(a.page)) || (b.score - a.score))
    .slice(0, 2)
    .map((p) => ({ source: p.source, page: p.page, url: p.url, passage: p.excerpt }));
}

// ---------- 3. Reasoning trace ----------
const ranAgent = agentSteps !== null;
let understood_as, outcome, safety_check;
switch (flag) {
  case 'blocked_topic':
    understood_as = 'A blocked or off-topic request (set by the company in the admin panel)';
    outcome = 'Declined politely and offered to connect with the team';
    safety_check = 'Stopped before answering';
    break;
  case 'direct_reply':
    understood_as = 'Small talk or a request to talk to sales, so no knowledge search was needed';
    outcome = 'Replied directly';
    safety_check = 'Passed';
    break;
  case 'fallback_used':
    understood_as = 'A question about the company';
    outcome = 'The drafted answer was replaced with the safe fallback message';
    safety_check = 'Flagged a possible rule break';
    break;
  case 'postcheck_uncertain':
    understood_as = 'A question about the company';
    outcome = 'The safety check was unsure, so the safe fallback message was used';
    safety_check = 'Uncertain, so failed closed';
    break;
  case 'agent_error':
    understood_as = 'A question about the company';
    outcome = 'Something went wrong while answering, so the fallback message was used';
    safety_check = 'Not reached';
    break;
  default:
    understood_as = 'A question about the company';
    safety_check = 'Passed';
    outcome = reply.trim() === fallbackText.trim()
      ? "Nothing in the knowledge base answered this, so it said so instead of guessing"
      : 'Answered from the knowledge base';
}

const rewritten = from('Query Rewriter');
// Group by document: "acme-cloud-product-guide.pdf: pages 3, 1, 2" (in retrieval order).
const bySource = new Map();
for (const p of passages) {
  if (!bySource.has(p.source)) bySource.set(p.source, []);
  if (p.page && !bySource.get(p.source).includes(p.page)) bySource.get(p.source).push(p.page);
}
const found = [...bySource].map(([src, pages]) => src + (pages.length ? (pages.length > 1 ? ': pages ' : ': page ') + pages.join(', ') : ''));
const reasoning = {
  understood_as,
  searched_for: ranAgent ? (queries.length ? queries : (rewritten && rewritten.text ? [rewritten.text] : [])) : [],
  found: ranAgent ? found.slice(0, 5) : [],
  safety_check,
  outcome,
};

// ---------- 4. Telemetry (observability) ----------
// Reply time is measured; tokens and cost are ESTIMATES (about 4 characters per token, from the text
// each model call actually saw), calibrated against n8n's measured usage on 2026-10-01
// (knowledge answer: about 4,900 input / 110 output tokens across 5 calls).
const start = (from('Validate input') || {}).received_at;
const rules = from('Build rules') || {};
const sys = String(rules.system_prompt || '').length;
const chat = String(rules.chat_input || '').length;
const obsChars = (agentSteps || []).reduce((n, st) => n + JSON.stringify(st.observation || '').length, 0);
const searches = (agentSteps || []).length;
let calls = 1, inChars = 900 + chat; // Intent Router (classifier prompt + message)
if (flag === 'direct_reply') { calls += 2; inChars += sys + chat + 700 + reply.length; } // direct reply + post-check
else if (ranAgent || flag === 'fallback_used' || flag === 'postcheck_uncertain' || flag === 'agent_error') {
  calls += 1; inChars += 300 + chat;                                    // Query Rewriter
  const agentCalls = Math.max(1, searches + 1);                         // tool-call turns + final answer
  calls += agentCalls; inChars += agentCalls * (sys + chat) + obsChars; // Maya agent (re-reads results)
  if (flag !== 'agent_error') { calls += 1; inChars += 700 + reply.length; } // Post-check
}
const outChars = reply.length + 40 * calls;
const inTok = Math.round(inChars / 4), outTok = Math.round(outChars / 4);
const telemetry = {
  latency_ms: start ? Date.now() - start : null,
  model_calls: calls,
  search_calls: searches,
  est_tokens: inTok + outTok,
  est_cost_usd: Number(((inTok * 0.40 + outTok * 1.60) / 1e6).toFixed(6)), // gpt-4.1-mini list price
  model: 'gpt-4.1-mini',
};

const { trace_steps, ...rest } = item; // don't send the raw steps to the widget or the database
return [{ json: { ...rest, source_details, reasoning, telemetry } }];
