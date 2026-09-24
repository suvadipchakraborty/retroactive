(() => {
  "use strict";

  const FEEDBACK_EMAIL = "suvadipchakraborty@gmail.com";
  const CACHE_PREFIX = "retro:cache:";
  const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
  const FILED_KEY = "retro:filed";
  const MODE_KEY = "retro:mode";

  const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  // ---------- Category classification ----------
  // Order matters: first matching group wins.
  const CATEGORY_RULES = [
    { name: "Computing", re: /\bcomputer|software|hardware|processor|microchip|semiconductor|programming|algorithm|operating system|IBM\b|Microsoft|Apple (Inc|Computer)|mainframe|supercomputer|CPU\b/i },
    { name: "Internet & web", re: /\binternet|world wide web|website|web browser|domain name|\.com\b|email|HTML|HTTP|Google|Facebook|Twitter|social media|search engine/i },
    { name: "Space & science", re: /\bNASA|satellite|rocket|spacecraft|astronaut|orbit|space station|telescope|Apollo \d|SpaceX|Soyuz|Mars rover|physics|discovers?/i },
    { name: "Gaming", re: /\bvideo game|game console|Nintendo|Atari|PlayStation|Xbox|arcade|Sega/i },
    { name: "Companies & business", re: /\bfounded|corporation|patent|IPO|acquires?|acquisition|launches its|Tesla|IBM founded|startup|Sony|Samsung/i },
  ];

  const TECH_KEYWORD_RE = /\b(computer|software|hardware|internet|website|web browser|programming|algorithm|processor|microchip|semiconductor|satellite|spacecraft|NASA|astronaut|rocket|orbit|video game|console|robot|robotics|artificial intelligence|\bAI\b|patent|invents?|invention|telegraph|radio broadcast|television|transistor|silicon|IBM|Microsoft|Apple (Inc|Computer)|Google|Facebook|Twitter|smartphone|mobile phone|operating system|database|encryption|cryptograph|electronics|circuit|engineer(ing)?|scientist|physicist|Nobel Prize in Physics|domain name|email|browser|Tesla|SpaceX|drone|3D print|nuclear|laser)/i;

  const PEOPLE_KEYWORD_RE = /computer scientist|programmer|software engineer|computing pioneer|roboticist|technologist|systems architect|network engineer|electrical engineer|aerospace engineer|astronaut|video game designer|tech entrepreneur|internet pioneer/i;

  function classify(item) {
    const haystack = `${item.text} ${item.pageTitles}`;
    for (const rule of CATEGORY_RULES) {
      if (rule.re.test(haystack)) return rule.name;
    }
    if (item.type !== "event" && PEOPLE_KEYWORD_RE.test(haystack)) return "People";
    return "Tech history";
  }

  function isTechRelevant(item) {
    const haystack = `${item.text} ${item.pageTitles}`;
    if (TECH_KEYWORD_RE.test(haystack)) return true;
    if (item.type !== "event" && PEOPLE_KEYWORD_RE.test(haystack)) return true;
    return false;
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
