(() => {
  "use strict";

  const FEEDBACK_EMAIL = "suvadipchakraborty@gmail.com";
  const CACHE_PREFIX = "retro:cache:";
  const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
  const FILED_KEY = "retro:filed";
  const MODE_KEY = "retro:mode";

  const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  // ---------- Category classification ----------
  // Precision over recall: every pattern below is a specific term, proper
  // noun, or multi-word phrase. Earlier versions used bare dictionary words
  // (e.g. "television", "founded", "scientist", "discovers", "engineer",
  // "circuit", "nuclear") which matched constantly in ordinary biographies
  // and history ("known for his television career", "founded a charity",
  // "political scientist", "circuit court") and dragged in unrelated
  // entries. Every rule here is deliberately narrow; a date with few real
  // tech stories should show few cards, backed by the general-history
  // filler in pickDisplaySet(), rather than stretch to fill a quota.

  // Recognizable tech/computing/aerospace company and org names. Proper
  // nouns are low-risk: they rarely appear by coincidence in unrelated text.
  const TECH_ORG_RE = /\b(Apple(?: Inc| Computer)?|Microsoft|Google|Alphabet Inc|Amazon\.com|Meta Platforms|Facebook|Instagram|WhatsApp|Twitter|\bX Corp\b|IBM|Intel\b|NVIDIA|AMD\b|Qualcomm|Samsung|Sony(?! Pictures| Music)|Nintendo|Sega|Atari|Commodore|Motorola|Nokia|BlackBerry|Xerox|Bell Labs|Texas Instruments|Hewlett-Packard|\bHP\b|Dell\b|Oracle Corporation|Adobe\b|Netflix|Yahoo!?|eBay|PayPal|Uber\b|Airbnb|SpaceX|Tesla,? Inc|Boeing|Lockheed Martin|\bNASA\b|ARPANET|\bCERN\b|Bitcoin|Ethereum|Wikipedia|Reddit|LinkedIn|TikTok|ByteDance|Napster|MySpace)\b/;

  // Specific technical concepts and events, expressed as compound phrases
  // rather than single words, so they don't fire on unrelated usage.
  const TECH_CONCEPT_RE = /\b(microcomputer|supercomputer|mainframe computer|computer software|computer hardware|microchip|semiconductor chip|integrated circuit|microprocessor|transistor radio|first transistor|programming language|source code|computer algorithm|operating system|world wide web|web browser|domain name registered|internet service provider|dial-up internet|broadband internet|smartphone|mobile phone (is unveiled|is launched|is patented)|video game|game console|arcade game|virtual reality|augmented reality|artificial intelligence|machine learning|autonomous robot|industrial robot|robotics|drone aircraft|unmanned aerial vehicle|3D printer|data encryption|cryptocurrency|blockchain|satellite (is launched|goes into orbit|enters orbit)|space(craft|ship|walk)|space station|space shuttle|rocket (is launched|launch)|orbits? (the )?(Earth|Moon|Sun|Mars)|astronaut|cosmonaut|Nobel Prize in Physics|Turing Award|Apollo \d+|Mars rover|telescope is launched|telegraph line|radio transmission|first radio broadcast|television (is invented|technology|broadcast begins)|cathode ray tube|nuclear reactor|nuclear power plant|laser (beam|technology|is invented)|fiber-optic|search engine|social media platform)\b/i;

  // Job titles/roles that are specifically technical (kept narrow: bare
  // "engineer" or "scientist" would match almost any biography).
  const TECH_ROLE_RE = /\b(computer scientist|software engineer|computer engineer|electrical engineer|aerospace engineer|robotics engineer|systems architect|network engineer|programmer|coder|roboticist|computing pioneer|internet pioneer|video game designer|tech entrepreneur|astronaut|cosmonaut)\b/i;

  // Tech-specific business events, as phrases (bare "founded" or
  // "corporation" match nearly any historical organization).
  const TECH_BUSINESS_RE = /\b(startup founded|tech company founded|co-founded (Apple|Microsoft|Google|Amazon|Facebook|IBM)|initial public offering|\bIPO\b|acquires .*(startup|tech company|software company)|acquired by (Google|Apple|Microsoft|Amazon|Meta|Facebook|IBM)|unveils its (first|new) (computer|smartphone|phone|software|console|product)|launches its (first|new) (computer|smartphone|phone|software|console|product))\b/i;

  const CATEGORY_RULES = [
    { name: "Gaming", re: /\bvideo game|game console|arcade game|Nintendo|Atari|PlayStation|Xbox|Sega|Commodore 64/i },
    { name: "Computing", re: /\bcomputer\b|microcomputer|supercomputer|mainframe|microchip|semiconductor|integrated circuit|microprocessor|programming language|operating system|\bIBM\b|Microsoft|Apple (Inc|Computer)|Commodore|\bCPU\b/i },
    { name: "Internet & web", re: /\binternet|world wide web|website|web browser|domain name|\.com\b|email|\bHTML\b|\bHTTP\b|Google|Facebook|Twitter|Instagram|TikTok|social media platform|search engine|Wikipedia|Reddit/i },
    { name: "Space & science", re: /\bNASA\b|satellite|rocket|spacecraft|astronaut|cosmonaut|\borbits?\b.*(Earth|Moon|Sun|Mars)|space station|space shuttle|telescope|Apollo \d|SpaceX|Soyuz|Mars rover|Nobel Prize in Physics/i },
    { name: "Companies & business", re: TECH_BUSINESS_RE },
  ];

  function classify(item) {
    const haystack = `${item.text} ${item.pageTitles}`;
    for (const rule of CATEGORY_RULES) {
      if (rule.re.test(haystack)) return rule.name;
    }
    if (item.type !== "event" && TECH_ROLE_RE.test(haystack)) return "People";
    return "Tech history";
  }

  function isTechRelevant(item) {
    const haystack = `${item.text} ${item.pageTitles}`;
    return (
      TECH_ORG_RE.test(haystack) ||
      TECH_CONCEPT_RE.test(haystack) ||
      TECH_BUSINESS_RE.test(haystack) ||
      (item.type !== "event" && TECH_ROLE_RE.test(haystack))
    );
  }

  // ---------- State ----------
  const state = {
    date: new Date(),           // real "today", used only for years-ago math & default
    displayMonth: null,         // 1-12, the month/day currently browsed
    displayDay: null,
    items: [],
    filter: "all",
    filed: loadFiled(),
    loading: false,
  };

  function loadFiled() {
    try {
      const raw = localStorage.getItem(FILED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  }
  function saveFiled() {
    try { localStorage.setItem(FILED_KEY, JSON.stringify([...state.filed])); } catch {}
  }

  // ---------- Element refs ----------
  const el = {
    flapMonth: document.getElementById("flapMonth"),
    flapDay: document.getElementById("flapDay"),
    dateSr: document.getElementById("dateSr"),
    prevDay: document.getElementById("prevDay"),
    nextDay: document.getElementById("nextDay"),
    todayBtn: document.getElementById("todayBtn"),
    randomBtn: document.getElementById("randomBtn"),
    datePicker: document.getElementById("datePicker"),
    tagScroll: document.getElementById("tagScroll"),
    ledger: document.getElementById("ledger"),
    counterText: document.getElementById("counterText"),
    modeToggle: document.getElementById("modeToggle"),
    installBtn: document.getElementById("installBtn"),
    shareBtn: document.getElementById("shareBtn"),
    aboutBtn: document.getElementById("aboutBtn"),
    aboutOverlay: document.getElementById("aboutOverlay"),
    aboutClose: document.getElementById("aboutClose"),
    feedbackBtn: document.getElementById("feedbackBtn"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    installOverlay: document.getElementById("installOverlay"),
    installClose: document.getElementById("installClose"),
    toast: document.getElementById("toast"),
  };

  el.feedbackBtn.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Retroactive Feedback")}`;

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("is-visible"), 2200);
  }

  // ---------- Split-flap date board ----------
  function buildFlapGroup(container, chars) {
    container.innerHTML = "";
    chars.split("").forEach(ch => {
      const span = document.createElement("span");
      span.className = "flap-char";
      span.textContent = ch;
      container.appendChild(span);
    });
  }

  function updateFlapGroup(container, newChars) {
    const spans = container.querySelectorAll(".flap-char");
    if (spans.length !== newChars.length) {
      buildFlapGroup(container, newChars);
      return;
    }
    newChars.split("").forEach((ch, i) => {
      const span = spans[i];
      if (span.textContent === ch) return;
      span.classList.add("is-flipping");
      setTimeout(() => {
        span.textContent = ch;
        span.classList.remove("is-flipping");
      }, 160);
    });
  }

  function renderDateBoard(animate) {
    const monthStr = MONTH_NAMES[state.displayMonth - 1];
    const dayStr = String(state.displayDay).padStart(2, "0");
    if (animate) {
      updateFlapGroup(el.flapMonth, monthStr);
      updateFlapGroup(el.flapDay, dayStr);
    } else {
      buildFlapGroup(el.flapMonth, monthStr);
      buildFlapGroup(el.flapDay, dayStr);
    }
    el.dateSr.textContent = `${monthStr} ${dayStr}`;
    el.datePicker.value = `2024-${String(state.displayMonth).padStart(2,"0")}-${dayStr}`;
  }

  // ---------- Data fetching ----------
  function cacheKey(m, d) {
    return `${CACHE_PREFIX}${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  async function fetchOnThisDay(month, day) {
    const key = cacheKey(month, day);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw);
        if (Date.now() - cached.ts < CACHE_MAX_AGE_MS) return cached.items;
      }
    } catch {}

    const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${String(month).padStart(2,"0")}/${String(day).padStart(2,"0")}`;
    const res = await fetch(url, { headers: { "Api-User-Agent": "Retroactive/1.0 (suvadipchakraborty@gmail.com)" } });
    if (!res.ok) throw new Error(`Wikipedia API returned ${res.status}`);
    const data = await res.json();

    const items = [];
    const seen = new Set();

    function pushGroup(list, type) {
      (list || []).forEach(entry => {
        const pageTitles = (entry.pages || []).map(p => `${p.title} ${p.extract || ""}`).join(" ");
        const dedupeKey = `${type}:${entry.year}:${(entry.text || "").slice(0, 60)}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        const firstPage = (entry.pages || [])[0];
        items.push({
          type,
          year: entry.year,
          text: entry.text || "",
          pageTitles,
          thumb: firstPage && firstPage.thumbnail ? firstPage.thumbnail.source : null,
          link: firstPage && firstPage.content_urls ? firstPage.content_urls.desktop.page : null,
          extract: firstPage ? firstPage.extract : null,
        });
      });
    }

    pushGroup(data.events, "event");
    pushGroup(data.births, "birth");
    pushGroup(data.deaths, "death");

    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), items }));
    } catch {}

    return items;
  }

  function pickDisplaySet(rawItems) {
    const withCategory = rawItems.map(item => ({
      ...item,
      id: `${item.type}-${item.year}-${item.text.slice(0, 40)}`,
      tag: classify(item),
      tech: isTechRelevant(item),
    }));

    let tech = withCategory.filter(i => i.tech);
    const general = withCategory.filter(i => !i.tech);

    // If a date is thin on tech history, round it out with the most
    // substantial general entries so the page is never empty.
    if (tech.length < 6) {
      const filler = general
        .slice()
        .sort((a, b) => (b.thumb ? 1 : 0) - (a.thumb ? 1 : 0))
        .slice(0, 6 - tech.length)
        .map(i => ({ ...i, tag: "This day" }));
      tech = tech.concat(filler);
    }

    return tech.sort((a, b) => b.year - a.year);
  }

  // ---------- Rendering ----------
  function yearsAgoLabel(item) {
    const nowYear = new Date().getFullYear();
    const diff = nowYear - item.year;
    if (item.type === "birth") return diff <= 0 ? "born this year" : `born ${diff} yr ago`;
    if (item.type === "death") return diff <= 0 ? "died this year" : `died ${diff} yr ago`;
    return diff <= 0 ? "this year" : `${diff} yr ago`;
  }

  function kindLabel(item) {
    if (item.type === "birth") return "Born";
    if (item.type === "death") return "Died";
    return "Event";
  }

  function renderTags() {
    const counts = new Map();
    state.items.forEach(i => counts.set(i.tag, (counts.get(i.tag) || 0) + 1));
    const tags = ["all", "filed", ...[...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a))];

    el.tagScroll.innerHTML = "";
    tags.forEach(tag => {
      const btn = document.createElement("button");
      btn.className = "tag-chip" + (state.filter === tag ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", state.filter === tag ? "true" : "false");
      if (tag === "all") btn.textContent = `All (${state.items.length})`;
      else if (tag === "filed") btn.textContent = `★ Filed (${state.filed.size})`;
      else btn.textContent = `${tag} (${counts.get(tag)})`;
      btn.addEventListener("click", () => {
        state.filter = tag;
        renderTags();
        renderCards();
      });
      el.tagScroll.appendChild(btn);
    });
  }

  function renderCards() {
    let list = state.items;
    if (state.filter === "filed") {
      list = list.filter(i => state.filed.has(i.id));
    } else if (state.filter !== "all") {
      list = list.filter(i => i.tag === state.filter);
    }

    el.ledger.innerHTML = "";

    if (state.loading) {
      el.ledger.innerHTML = `<div class="ledger__status">Pulling the file for this date…</div>`;
      return;
    }

    if (list.length === 0) {
      const msg = state.filter === "filed"
        ? "No filed stories yet — tap ☆ File this on any card to keep it here."
        : "Nothing on record for this filter, on this date.";
      el.ledger.innerHTML = `<div class="ledger__status">${msg}</div>`;
      return;
    }

    list.forEach(item => {
      const card = document.createElement("article");
      card.className = "card";

      const isFiled = state.filed.has(item.id);
      const extract = item.extract ? item.extract : item.text;
      const headline = item.type === "event" ? item.text : `${(item.pageTitles || item.text).split(" ").slice(0, 12).join(" ")}`;

      card.innerHTML = `
        <div class="card__stamp">
          <div class="card__year">${item.year}</div>
          <div class="card__yearsago">${yearsAgoLabel(item)}</div>
        </div>
        <div class="card__body">
          <div class="card__meta">
            <span class="card__tag">${item.tag}</span>
            <span class="card__kind">${kindLabel(item)}</span>
          </div>
          <h2 class="card__headline">${escapeHtml(item.type === "event" ? item.text : (item.text || headline))}</h2>
          ${extract && extract !== item.text ? `<p class="card__extract">${escapeHtml(truncate(extract, 220))}</p>` : ""}
          <div class="card__footer">
            <button class="card__file-btn${isFiled ? " is-filed" : ""}" data-id="${item.id}">
              ${isFiled ? "★ Filed" : "☆ File this"}
            </button>
            ${item.link ? `<a class="card__link" href="${item.link}" target="_blank" rel="noopener">Read on Wikipedia ↗</a>` : ""}
          </div>
        </div>
      `;

      card.querySelector(".card__file-btn").addEventListener("click", (e) => {
        toggleFile(item.id, e.currentTarget);
      });

      el.ledger.appendChild(card);
    });
  }

  function toggleFile(id, btn) {
    if (state.filed.has(id)) {
      state.filed.delete(id);
      btn.classList.remove("is-filed");
      btn.textContent = "☆ File this";
      showToast("Removed from your filed record");
    } else {
      state.filed.add(id);
      btn.classList.add("is-filed");
      btn.textContent = "★ Filed";
      showToast("Filed for later");
    }
    saveFiled();
    if (state.filter === "filed") renderCards();
    renderTags();
    updateCounter();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function truncate(str, n) {
    if (!str || str.length <= n) return str || "";
    return str.slice(0, n - 1).trimEnd() + "…";
  }

  function updateCounter() {
    const total = state.items.length;
    const filedHere = state.items.filter(i => state.filed.has(i.id)).length;
    el.counterText.textContent = `${total} on record today • ${filedHere} filed here`;
  }

  // ---------- Loading a date ----------
  async function loadDate(month, day, { animate = true } = {}) {
    state.displayMonth = month;
    state.displayDay = day;
    state.loading = true;
    renderDateBoard(animate);
    renderCards();
    el.counterText.textContent = "Pulling the file…";

    try {
      const raw = await fetchOnThisDay(month, day);
      state.items = pickDisplaySet(raw);
      state.filter = "all";
    } catch (err) {
      state.items = [];
      el.ledger.innerHTML = `
        <div class="ledger__status">
          The archive drawer stuck — could not reach Wikipedia.
          <button class="ledger__retry" id="retryBtn">Try again</button>
        </div>`;
      const retryBtn = document.getElementById("retryBtn");
      if (retryBtn) retryBtn.addEventListener("click", () => loadDate(month, day, { animate: false }));
      state.loading = false;
      updateCounter();
      return;
    }

    state.loading = false;
    renderTags();
    renderCards();
    updateCounter();
  }

  function shiftDay(delta) {
    const ref = new Date(2024, state.displayMonth - 1, state.displayDay); // 2024: leap year, safe for Feb 29
    ref.setDate(ref.getDate() + delta);
    loadDate(ref.getMonth() + 1, ref.getDate());
  }

  function goToday() {
    const now = new Date();
    loadDate(now.getMonth() + 1, now.getDate());
  }

  function goRandom() {
    const ref = new Date(2024, Math.floor(Math.random() * 12), 1);
    const daysInMonth = new Date(2024, ref.getMonth() + 1, 0).getDate();
    const day = 1 + Math.floor(Math.random() * daysInMonth);
    loadDate(ref.getMonth() + 1, day);
  }

  // ---------- Terminal mode ----------
  function applyMode(mode) {
    document.documentElement.classList.toggle("terminal", mode === "terminal");
    el.modeToggle.setAttribute("aria-label", mode === "terminal" ? "Switch to paper mode" : "Switch to terminal mode");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "terminal" ? "#060A07" : "#EDE3C7");
  }
  function toggleMode() {
    const current = localStorage.getItem(MODE_KEY) === "terminal" ? "terminal" : "paper";
    const next = current === "terminal" ? "paper" : "terminal";
    localStorage.setItem(MODE_KEY, next);
    applyMode(next);
    showToast(next === "terminal" ? "Terminal mode engaged" : "Back to paper");
  }

  // ---------- Modals ----------
  function openModal(overlay) { overlay.classList.add("is-open"); }
  function closeModal(overlay) { overlay.classList.remove("is-open"); }

  // ---------- Install prompt ----------
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    el.installBtn.hidden = false;
  });
  el.installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      el.installBtn.hidden = true;
    } else {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      document.getElementById("installSteps").innerHTML = isIOS
        ? `Tap the <b>Share</b> icon in Safari's toolbar, then choose <b>"Add to Home Screen."</b>`
        : `Open your browser menu and choose <b>"Add to Home Screen"</b> or <b>"Install app."</b>`;
      openModal(el.installOverlay);
    }
  });
  document.getElementById("installClose").addEventListener("click", () => closeModal(el.installOverlay));

  // ---------- Wire up events ----------
  el.prevDay.addEventListener("click", () => shiftDay(-1));
  el.nextDay.addEventListener("click", () => shiftDay(1));
  el.todayBtn.addEventListener("click", goToday);
  el.randomBtn.addEventListener("click", goRandom);
  el.datePicker.addEventListener("change", (e) => {
    const parts = e.target.value.split("-").map(Number);
    const [, m, d] = parts;
    const valid = parts.length === 3 && !parts.some(Number.isNaN) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
    if (!valid) {
      showToast("Couldn't read that date — showing today instead");
      goToday();
      return;
    }
    loadDate(m, d);
  });
  el.modeToggle.addEventListener("click", toggleMode);

  el.aboutBtn.addEventListener("click", () => openModal(el.aboutOverlay));
  el.aboutClose.addEventListener("click", () => closeModal(el.aboutOverlay));
  el.aboutOverlay.addEventListener("click", (e) => { if (e.target === el.aboutOverlay) closeModal(el.aboutOverlay); });

  el.clearHistoryBtn.addEventListener("click", () => {
    state.filed = new Set();
    saveFiled();
    renderTags();
    renderCards();
    updateCounter();
    showToast("Filed record cleared");
  });

  el.shareBtn.addEventListener("click", async () => {
    const monthStr = MONTH_NAMES[state.displayMonth - 1];
    const shareData = {
      title: "Retroactive",
      text: `Tech history for ${monthStr} ${state.displayDay} — check it out on Retroactive.`,
      url: location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        showToast("Link copied to clipboard");
      } catch {
        showToast("Couldn't copy the link");
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowLeft") shiftDay(-1);
    else if (e.key === "ArrowRight") shiftDay(1);
    else if (e.key.toLowerCase() === "r") goRandom();
    else if (e.key.toLowerCase() === "t") toggleMode();
  });

  // ---------- Boot ----------
  applyMode(localStorage.getItem(MODE_KEY) === "terminal" ? "terminal" : "paper");
  const now = new Date();
  loadDate(now.getMonth() + 1, now.getDate(), { animate: false });

  if ("serviceWorker" in navigator) {
    // No service worker shipped yet — reserved for future offline support.
  }
})();
