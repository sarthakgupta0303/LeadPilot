/* =========================================================
   LegalGraph AI — Avatar chat widget (prototype)
   Plain JavaScript, no dependencies. Chat only.
   ========================================================= */
(function () {
  "use strict";

  /* ---------------- Config ---------------- */
  const CONFIG = {
    agentName: "Maya",
    chatGreeting:
      "Hi, I'm Maya 👋 Ask me anything about LegalGraph AI — research, contract review, pricing or booking a demo.",
    // LeadPilot backend: n8n Workflow B (agentic RAG) + the public agent profile in Supabase.
    companyId: "3fbdd46d-e940-4bc9-93cf-7013f7ff216d",
    chatEndpoint: "https://sarthak03.app.n8n.cloud/webhook/maya-chat",
    supabaseUrl: "https://fgzfeylyhtnsjxxjytdr.supabase.co",
    supabaseKey: "sb_publishable_V9ae9T9b1D0KrbxszfmOTw_XVxfsMA7", // public key; RLS only exposes public_agent_profile
    replyTimeoutMs: 45000,
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

  const messagesEl = $("lgwMessages");
  const chatForm = $("lgwChatForm");
  const chatInput = $("lgwChatInput");
  const chips = $("lgwChips");

  /* ---------------- State ---------------- */
  const state = {
    open: false,
    avatarUrl: "",
    greeted: false,
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

  function addMessage(role, text) {
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
    wrap.appendChild(meta);
    row.appendChild(wrap);

    messagesEl.appendChild(row);
    scrollMessages();
    return row;
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

    getAgentReply(clean).then((reply) => {
      typing.remove();
      addMessage("bot", reply);
      setBusy(false);
    });
  }

  // Sends the message to n8n Workflow B. Always resolves with text to show (never rejects).
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
      if (data.reply) return data.reply;
      if (data.error) return "Sorry — " + data.error + ".";
      return CONFIG.errorReply;
    } catch (_) {
      return CONFIG.errorReply;
    } finally {
      clearTimeout(timer);
    }
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
  window.LegalGraphWidget = { open: openWidget, close: closeWidget, send: handleUserMessage, config: CONFIG };
})();
