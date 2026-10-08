/* =========================================================
   LeadPilot AI — chat widget (embedded on the Acme Cloud demo site)
   Plain JavaScript, no dependencies. Chat only.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- Config ---------------- */
  const CONFIG = {
    agentName: "Maya",
    chatGreeting:
      "Hi, I'm Maya 👋 Ask me anything about Acme Cloud — features, pricing, security or booking a demo.",
    // LeadPilot backend: n8n Workflow B (agentic RAG) + the public agent profile in Supabase.
    companyId: "3fbdd46d-e940-4bc9-93cf-7013f7ff216d",
    chatEndpoint: "https://ankita301.app.n8n.cloud/webhook/maya-chat",
    supabaseUrl: "https://fgzfeylyhtnsjxxjytdr.supabase.co",
    supabaseKey: "sb_publishable_V9ae9T9b1D0KrbxszfmOTw_XVxfsMA7", // public key; RLS only exposes public_agent_profile
    replyTimeoutMs: 45000,
    // false: sources and reasoning are kept out of the chat window and only appear in the Excel export.
    showAnswerTrace: false,
    errorReply: "Sorry — I couldn't reach the server just now. Please try again in a moment.",
    // Avatar: tries each source in order and uses the first that loads.
    // bear.gif is the animated mascot; avatar.svg is the offline fallback.
    avatarSources: [
      "assets/bear.gif",
      "assets/avatar.svg",
    ],
  };

  /* ---------------- Elements ---------------- */
  const $ = (id) => document.getElementById(id);
  const root = $("lg-widget");
  const launcher = $("lgwLauncher");
  const panel = $("lgwPanel");
  const bubble = $("lgwBubble");
  const bubbleClose = $("lgwBubbleClose");
  const closeBtn = $("lgwClose");
  const downloadBtn = $("lgwDownload");

  const messagesEl = $("lgwMessages");
  const chatForm = $("lgwChatForm");
  const chatInput = $("lgwChatInput");
  const chips = $("lgwChips");

  /* ---------------- State ---------------- */
  const state = {
    open: false,
    avatarUrl: "",
    greeted: false,
    log: [], // one entry per question: { question, response, source, reasoning }
  };

  /* ---------------- Avatar loading ---------------- */
  const FALLBACK_AVATAR =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#dfe7f6"/><stop offset="1" stop-color="#b9c7e3"/></linearGradient></defs>
        <rect width="400" height="500" fill="url(#g)"/>
        <circle cx="200" cy="190" r="86" fill="#8fa2c6"/>
        <path d="M60 500c10-110 70-170 140-170s130 60 140 170z" fill="#8fa2c6"/>
      </svg>`
    );

  function loadAvatar(sources, i = 0) {
    if (i >= sources.length) return applyAvatar(FALLBACK_AVATAR);
    const img = new Image();
    img.onload = () => applyAvatar(sources[i]);
    img.onerror = () => loadAvatar(sources, i + 1);
    img.src = sources[i];
  }
  function applyAvatar(url) {
    state.avatarUrl = url;
    // document-wide: also fills any .lgw-avatar-img used outside the widget (e.g. hero proof card)
    document.querySelectorAll(".lgw-avatar-img").forEach((el) => (el.src = url));
  }

  /* ---------------- Open / close ---------------- */
  function openWidget() {
    state.open = true;
    root.dataset.state = "open";
    launcher.setAttribute("aria-expanded", "true");
    panel.setAttribute("aria-hidden", "false");
    hideBubble();
    if (!state.greeted) {
      state.greeted = true;
      addMessage("bot", CONFIG.chatGreeting);
    }
    setTimeout(() => chatInput.focus(), 50);
    scrollMessages();
  }
  function closeWidget() {
    state.open = false;
    root.dataset.state = "closed";
    launcher.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");
    launcher.focus();
  }

  function showBubble() {
    if (!state.open && !sessionFlag("lgwBubbleDismissed")) bubble.classList.add("is-visible");
  }
  function hideBubble() {
    bubble.classList.remove("is-visible");
  }

  /* ---------------- Messages ---------------- */
  function timeNow() {
    return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function addMessage(role, text, trace) {
    const row = document.createElement("div");
    row.className = "lgw-msg" + (role === "user" ? " is-user" : "");

    if (role === "bot") {
      const av = document.createElement("img");
      av.className = "lgw-msg-avatar lgw-avatar-img";
      av.alt = "";
      av.src = state.avatarUrl || FALLBACK_AVATAR;
      row.appendChild(av);
    }

    const wrap = document.createElement("div");
    const body = document.createElement("div");
    body.className = "lgw-msg-body";
    body.textContent = text;
    const meta = document.createElement("div");
    meta.className = "lgw-msg-time";
    meta.textContent = timeNow();
    wrap.appendChild(body);
    if (role === "bot" && trace) {
      const t = buildTrace(trace);
      if (t) wrap.appendChild(t);
    }
    wrap.appendChild(meta);
    row.appendChild(wrap);

    messagesEl.appendChild(row);
    scrollMessages();
    return row;
  }

  /* ---------------- "Source" and "How I answered" under each reply ----------------
     Both come from what the workflow actually did (n8n "Explain answer" step), not from the model
     explaining itself. Collapsed by default so the chat stays clean. All text is set with
     textContent, never innerHTML. */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function buildTrace(trace) {
    const sources = Array.isArray(trace.source_details) ? trace.source_details : [];
    const r = trace.reasoning;
    if (!sources.length && !r) return null;

    const box = el("div", "lgw-trace");
    const bar = el("div", "lgw-trace-bar");
    const panels = [];

    function addToggle(label, panel) {
      const btn = el("button", "lgw-trace-btn", label);
      btn.type = "button";
      btn.setAttribute("aria-expanded", "false");
      panel.hidden = true;
      btn.addEventListener("click", () => {
        const open = panel.hidden;
        panels.forEach((p) => { p.panel.hidden = true; p.btn.setAttribute("aria-expanded", "false"); });
        panel.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        scrollMessages();
      });
      bar.appendChild(btn);
      panels.push({ btn, panel });
    }

    if (sources.length) {
      const panel = el("div", "lgw-trace-panel");
      sources.forEach((s) => {
        const item = el("div", "lgw-trace-src");
        const name = (s.source || "Knowledge base").replace(/\.(pdf|docx?)$/i, "").replace(/[-_]+/g, " ");
        item.appendChild(el("div", "lgw-trace-src-name", name + (s.page ? " · page " + s.page : "")));
        if (s.passage) item.appendChild(el("blockquote", "lgw-trace-quote", s.passage));
        if (s.url && /^https?:\/\//.test(s.url)) {
          const a = el("a", "lgw-trace-link", "Open page");
          a.href = s.url; a.target = "_blank"; a.rel = "noopener noreferrer";
          item.appendChild(a);
        }
        panel.appendChild(item);
      });
      addToggle("📄 Source", panel);
    }

    if (r) {
      const panel = el("div", "lgw-trace-panel");
      const steps = el("ol", "lgw-trace-steps");
      const add = (k, v) => { if (!v || (Array.isArray(v) && !v.length)) return; const li = el("li"); li.appendChild(el("span", "lgw-trace-k", k)); li.appendChild(el("span", "lgw-trace-v", Array.isArray(v) ? v.join(" · ") : v)); steps.appendChild(li); };
      add("Understood as", r.understood_as);
      add("Searched for", (r.searched_for || []).map((q) => "“" + q + "”"));
      add("Found", (r.found || []).map((f) => f.replace(/\.(pdf|docx?)(?=:|$)/i, "").replace(/[-_]+/g, " ")));
      add("Safety check", r.safety_check);
      add("Result", r.outcome);
      panel.appendChild(steps);
      addToggle("🧭 How I answered", panel);
    }

    box.appendChild(bar);
    panels.forEach((p) => box.appendChild(p.panel));
    return box;
  }

  function showTyping() {
    const row = document.createElement("div");
    row.className = "lgw-msg";
    row.dataset.typing = "true";
    const av = document.createElement("img");
    av.className = "lgw-msg-avatar lgw-avatar-img";
    av.alt = "";
    av.src = state.avatarUrl || FALLBACK_AVATAR;
    const body = document.createElement("div");
    body.className = "lgw-msg-body lgw-typing";
    body.innerHTML = "<i></i><i></i><i></i>";
    body.setAttribute("aria-label", CONFIG.agentName + " is typing");
    row.appendChild(av);
    row.appendChild(body);
    messagesEl.appendChild(row);
    scrollMessages();
    return row;
  }

  function scrollMessages() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /* ---------------- Core: handle a user message ---------------- */
  function handleUserMessage(text) {
    const clean = (text || "").trim();
    if (!clean) return;

    addMessage("user", clean);
    chips.style.display = "none";

    const typing = showTyping();
    setBusy(true);

    getAgentReply(clean).then((r) => {
      typing.remove();
      // The chat shows only the reply. Source and reasoning go to the Excel export
      // (set CONFIG.showAnswerTrace = true to also show them under each answer).
      addMessage("bot", r.text, CONFIG.showAnswerTrace ? r.trace : null);
      state.log.push({ question: clean, response: r.text, source: r.source, reasoning: r.reasoning });
      updateDownloadState();
      setBusy(false);
    });
  }

  const REASON_FAILED = "No answer was generated: the request to the assistant failed or timed out, so the apology message was shown.";

  // Source cell for the Excel export: every passage the agent used, with its file, page and link.
  function formatSource(data) {
    const details = Array.isArray(data.source_details) ? data.source_details : [];
    if (details.length) {
      return details.map(function (d) {
        const head = (d.source || "Knowledge base") + (d.page ? " (page " + d.page + ")" : "");
        const lines = [head];
        if (d.url && /^https?:\/\//.test(d.url)) lines.push(d.url);
        if (d.passage) lines.push("\u201C" + d.passage + "\u201D");
        return lines.join("\n");
      }).join("\n\n");
    }
    const names = Array.isArray(data.sources) ? data.sources.filter(Boolean).map(String) : [];
    return names.join("\n");
  }

  // Reasoning cell: the workflow's own "Explain answer" trace (what it understood, searched, found, checked).
  function formatReasoning(data) {
    const r = data.reasoning;
    if (typeof r === "string" && r.trim()) return r.trim();
    if (r && typeof r === "object") {
      const join = function (v) { return Array.isArray(v) ? v.join(" \u00B7 ") : v; };
      const rows = [
        ["Understood as", r.understood_as],
        ["Searched for", (r.searched_for || []).map(function (q) { return "\u201C" + q + "\u201D"; })],
        ["Found", r.found],
        ["Safety check", r.safety_check],
        ["Result", r.outcome],
      ].filter(function (x) { return x[1] && !(Array.isArray(x[1]) && !x[1].length); });
      if (rows.length) return rows.map(function (x) { return x[0] + ": " + join(x[1]); }).join("\n");
    }
    // Older workflow versions return only the reply and a source list: describe what that implies.
    const names = Array.isArray(data.sources) ? data.sources.filter(Boolean) : [];
    return names.length
      ? "The agent searched the company knowledge base and grounded this answer in: " + names.join(", ") + "."
      : "The agent did not retrieve any knowledge-base source for this message, so the reply is conversational or a guardrail response rather than a cited answer.";
  }

  // Sends the message to n8n Workflow B. Always resolves with { text, trace, source, reasoning } (never rejects).
  async function getAgentReply(userText) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.replyTimeoutMs);
    try {
      const res = await fetch(CONFIG.chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: CONFIG.companyId,
          session_id: getSessionId(),
          message: userText,
          campaign_source: getCampaignSource(),
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (data.reply) {
        return {
          text: data.reply,
          trace: { source_details: data.source_details, reasoning: data.reasoning },
          source: formatSource(data),
          reasoning: formatReasoning(data),
        };
      }
      if (data.error) return { text: "Sorry \u2014 " + data.error + ".", source: "", reasoning: "The assistant returned an error instead of an answer: " + data.error };
      return { text: CONFIG.errorReply, source: "", reasoning: REASON_FAILED };
    } catch (_) {
      return { text: CONFIG.errorReply, source: "", reasoning: REASON_FAILED };
    } finally {
      clearTimeout(timer);
    }
  }


  /* ---------------- Excel export (no libraries: writes a real .xlsx) ---------------- */
  // Columns: Question · Response · Source · Reasoning. The chat window itself only ever
  // shows the reply; sources and reasoning live in the downloaded file.
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // Minimal ZIP writer (stored, no compression), enough for an .xlsx package.
  function zipStore(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const parts = [], central = [];
    let offset = 0;
    files.forEach(function (f) {
      const name = enc.encode(f.name), data = enc.encode(f.text);
      const crc = crc32(data), size = data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true);
      ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    const cdSize = central.reduce(function (n, c) { return n + c.length; }, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce(function (n, c) { return n + c.length; }, 0));
    let pos = 0;
    all.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  function xmlText(v) {
    return String(v == null ? "" : v)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .slice(0, 32000)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function buildXlsx(rows, sheetName) {
    const cols = ["A", "B", "C", "D"];
    const sheetRows = rows.map(function (row, r) {
      const cells = row.map(function (v, c) {
        return '<c r="' + cols[c] + (r + 1) + '" s="' + (r === 0 ? 1 : 2) + '" t="inlineStr"><is><t xml:space="preserve">' + xmlText(v) + "</t></is></c>";
      }).join("");
      return '<row r="' + (r + 1) + '">' + cells + "</row>";
    }).join("");
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const HDR = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    return zipStore([
      { name: "[Content_Types].xml", text: HDR + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: "_rels/.rels", text: HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", text: HDR + "<workbook " + NS + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xmlText(sheetName) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", text: HDR + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", text: HDR + "<styleSheet " + NS + '><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4FD8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD5D9E5"/></left><right style="thin"><color rgb="FFD5D9E5"/></right><top style="thin"><color rgb="FFD5D9E5"/></top><bottom style="thin"><color rgb="FFD5D9E5"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
      { name: "xl/worksheets/sheet1.xml", text: HDR + "<worksheet " + NS + '><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="2" width="70" customWidth="1"/><col min="3" max="3" width="40" customWidth="1"/><col min="4" max="4" width="70" customWidth="1"/></cols><sheetData>' + sheetRows + "</sheetData></worksheet>" },
    ]);
  }

  const NO_SOURCE = "No knowledge-base source used";

  function updateDownloadState() {
    const has = state.log.length > 0;
    downloadBtn.setAttribute("aria-disabled", has ? "false" : "true");
    downloadBtn.title = has ? "Download chat as Excel (" + state.log.length + (state.log.length === 1 ? " question)" : " questions)")
                            : "Download chat as Excel (available after your first question)";
  }

  function downloadChat() {
    if (!state.log.length) return;
    const rows = [["Question", "Response", "Source", "Reasoning"]].concat(
      state.log.map(function (e) {
        return [e.question, e.response, e.source || NO_SOURCE, e.reasoning];
      })
    );
    const bytes = buildXlsx(rows, "Chat log");
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    a.href = url;
    a.download = CONFIG.agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-chat-" + stamp + ".xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------------- Visitor session + campaign source ---------------- */
  // One id per browser so the agent remembers the conversation across page loads.
  function getSessionId() {
    let id = storageGet(localStorage, "lgwSessionId");
    if (!id) {
      id = "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
      storageSet(localStorage, "lgwSessionId", id);
    }
    return id;
  }

  // Campaign links carry ?utm_source=…; remember it for the whole visit.
  function getCampaignSource() {
    const fromUrl = new URLSearchParams(location.search).get("utm_source");
    if (fromUrl) storageSet(sessionStorage, "lgwCampaign", fromUrl.slice(0, 100));
    return storageGet(sessionStorage, "lgwCampaign") || "";
  }

  function storageGet(store, key) {
    try { return store.getItem(key); } catch (_) { return null; }
  }
  function storageSet(store, key, value) {
    try { store.setItem(key, value); } catch (_) { /* private mode: fine, just not remembered */ }
  }

  /* ---------------- Agent profile from the admin panel ---------------- */
  // Name, greeting and custom photo come from Supabase (public_agent_profile), so
  // changes saved in the LeadPilot admin panel show up here on the next page load.
  async function loadAgentProfile() {
    try {
      const url = CONFIG.supabaseUrl + "/rest/v1/public_agent_profile?select=agent_name,greeting,avatar_style,avatar_url" +
        "&company_id=eq." + encodeURIComponent(CONFIG.companyId);
      const res = await fetch(url, { headers: { apikey: CONFIG.supabaseKey } });
      const rows = await res.json();
      const p = Array.isArray(rows) && rows[0];
      if (!p) return;
      if (p.agent_name) {
        CONFIG.agentName = p.agent_name;
        root.querySelectorAll(".lgw-name").forEach((el) => (el.textContent = p.agent_name));
        const bubbleTitle = bubble.querySelector("strong");
        if (bubbleTitle) bubbleTitle.textContent = "Hi, I'm " + p.agent_name + " 👋";
      }
      if (p.greeting) CONFIG.chatGreeting = p.greeting;
      if (p.avatar_style === "custom" && p.avatar_url) loadAvatar([p.avatar_url].concat(CONFIG.avatarSources));
    } catch (_) { /* keep the built-in defaults */ }
  }

  function setBusy(busy) {
    root.querySelectorAll(".lgw-send").forEach((b) => (b.disabled = busy));
  }

  /* ---------------- Session flag helper (safe storage) ---------------- */
  function sessionFlag(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, value ? "1" : "0");
    } catch (_) { return false; }
  }

  /* ---------------- Events ---------------- */
  launcher.addEventListener("click", () => openWidget());
  bubble.addEventListener("click", (e) => { if (e.target !== bubbleClose) openWidget(); });
  bubbleClose.addEventListener("click", (e) => {
    e.stopPropagation();
    hideBubble();
    sessionFlag("lgwBubbleDismissed", true);
  });
  closeBtn.addEventListener("click", closeWidget);
  downloadBtn.addEventListener("click", downloadChat);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.open) closeWidget(); });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value;
    chatInput.value = "";
    handleUserMessage(text);
  });

  chips.addEventListener("click", (e) => {
    const chip = e.target.closest(".lgw-chip");
    if (chip) handleUserMessage(chip.textContent);
  });

  const heroTalk = document.getElementById("heroTalkBtn");
  if (heroTalk) heroTalk.addEventListener("click", () => openWidget());
  const ctaTalk = document.getElementById("ctaTalkBtn");
  if (ctaTalk) ctaTalk.addEventListener("click", () => openWidget());

  /* ---------------- Init ---------------- */
  loadAvatar(CONFIG.avatarSources);
  loadAgentProfile();
  setTimeout(showBubble, 1800);

  // Expose a tiny API for later integration / testing
  window.LeadPilotWidget = { open: openWidget, close: closeWidget, send: handleUserMessage, download: downloadChat, config: CONFIG };
})();
