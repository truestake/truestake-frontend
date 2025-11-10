// ===============================
// Глобальное состояние
// ===============================
const state = {
  lang: "en",
  dict: {},
  token: null,
  user: null,
  markets: [],
  category: "all",
  filterStatus: "active",
  search: "",
  loadingMarkets: false
};

// ===============================
// I18N helpers
// ===============================
function detectLang(tg) {
  try {
    const code = tg?.initDataUnsafe?.user?.language_code || "";
    const low = code.toLowerCase();
    if (["ru", "uk", "be"].includes(low)) return "ru";
    return "en";
  } catch {
    return "en";
  }
}

function setLang(lang) {
  state.lang = lang;
  state.dict =
    lang === "ru"
      ? (window.I18N_RU || window.I18N_EN)
      : (window.I18N_EN || window.I18N_RU);

  const brandName = document.getElementById("ts-brand-name");
  const brandTagline = document.getElementById("ts-brand-tagline");
  const searchInput = document.getElementById("ts-search-input");
  const langBtn = document.getElementById("ts-lang-current");

  if (brandName)
    brandName.textContent = state.dict.brand_name || "TrueStake";
  if (brandTagline)
    brandTagline.textContent =
      state.dict.brand_tagline || "on TON · Telegram Mini App";
  if (searchInput)
    searchInput.placeholder =
      state.dict.search_placeholder || "Search events...";
  if (langBtn)
    langBtn.textContent = lang === "ru" ? "🇷🇺" : "🇺🇸";

  renderCategories();
  renderMarkets();
  renderRoleActions();
}

function t(key, fallback = "") {
  return (state.dict && state.dict[key]) || fallback || key;
}

// ===============================
// INIT
// ===============================
function initApp() {
  const tg = window.Telegram?.WebApp;

  const initialLang = detectLang(tg);
  setLang(initialLang);

  setupLangMenu();

  if (tg && tg.initData) {
    tg.ready();
    fetchAuth(tg.initData)
      .then(loadMarkets)
      .catch((err) => {
        logDebug("auth_error", err);
        loadMarkets();
      });
  } else {
    loadMarkets();
  }

  setupCommonUI();
}

// ===============================
// Auth
// ===============================
async function fetchAuth(initData) {
  const res = await fetch("https://api.corsarinc.ru/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: initData })
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok || !data.token) throw new Error("auth_failed");

  state.token = data.token;
  state.user = data.user || null;

  // Дополнительный запрос /auth/me для роли
  try {
    const meRes = await fetch("https://api.corsarinc.ru/auth/me", {
      headers: { Authorization: "Bearer " + state.token }
    });
    const me = await meRes.json();
    if (me.ok && me.user) state.user = me.user;
  } catch (_) {}

  renderUserHeader();
  renderRoleActions();
}

// ===============================
// UI: язык
// ===============================
function setupLangMenu() {
  const btn = document.getElementById("ts-lang-current");
  const menu = document.getElementById("ts-lang-menu");
  if (!btn || !menu) return;

  let opened = false;

  const close = () => {
    opened = false;
    menu.style.display = "none";
  };

  btn.onclick = (e) => {
    e.stopPropagation();
    opened = !opened;
    menu.style.display = opened ? "block" : "none";
  };

  menu.querySelectorAll("div[data-lang]").forEach((item) => {
    item.onclick = (e) => {
      const lang = e.currentTarget.getAttribute("data-lang");
      close();
      setLang(lang);
    };
  });

  document.addEventListener("click", (e) => {
    if (!opened) return;
    if (!menu.contains(e.target) && e.target !== btn) {
      close();
    }
  });
}

// ===============================
// UI: общие обработчики
// ===============================
function setupCommonUI() {
  const searchInput = document.getElementById("ts-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.search = e.target.value.trim().toLowerCase();
      renderMarkets();
    });
  }

  document.querySelectorAll(".ts-filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".ts-filter-chip")
        .forEach((b) => b.classList.remove("ts-filter-chip-active"));
      btn.classList.add("ts-filter-chip-active");
      state.filterStatus = btn.dataset.filter || "active";
      renderMarkets();
    });
  });

  const walletBtn = document.getElementById("ts-wallet-connect");
  if (walletBtn) {
    walletBtn.onclick = () => {
      alert("Later: TonConnect in testnet here.");
    };
  }
}

// ===============================
// Рендер: user + role
// ===============================
function renderUserHeader() {
  const userLabel = document.getElementById("ts-user-label");
  const roleLabel = document.getElementById("ts-role-label");
  if (!userLabel || !roleLabel) return;

  if (!state.user) {
    userLabel.textContent = "guest";
    roleLabel.textContent = "";
    roleLabel.className = "ts-role-label";
    return;
  }

  const username = state.user.username
    ? "@" + state.user.username
    : String(state.user.id || "");
  userLabel.textContent = username;

  const role = (state.user.role || "user").toLowerCase();
  roleLabel.className = "ts-role-label";
  roleLabel.textContent = "";

  if (role === "creator") {
    roleLabel.textContent = "CREATOR";
    roleLabel.classList.add("creator");
  } else if (role === "admin") {
    roleLabel.textContent = "ADMIN";
    roleLabel.classList.add("admin");
  }
}

// ===============================
// Рендер: категории
// ===============================
function renderCategories() {
  const wrap = document.getElementById("ts-categories");
  if (!wrap || !window.TRUESTAKE_CATEGORIES) return;
  wrap.innerHTML = "";

  window.TRUESTAKE_CATEGORIES.forEach((cat) => {
    if (!cat.enabled) return;
    const btn = document.createElement("button");
    btn.className =
      "ts-category-pill" +
      (state.category === cat.id ? " active" : "");
    btn.textContent = t(cat.i18nKey, cat.id);
    btn.onclick = () => {
      state.category = cat.id;
      renderCategories();
      renderMarkets();
    };
    wrap.appendChild(btn);
  });
}

// ===============================
// Рендер: действия по ролям
// ===============================
function renderRoleActions() {
  const box = document.getElementById("ts-role-actions");
  if (!box) return;

  box.innerHTML = "";
  box.style.display = "none";

  if (!state.user) return;

  const role = (state.user.role || "user").toLowerCase();
  if (role === "creator" || role === "admin") {
    box.style.display = "flex";

    const createBtn = document.createElement("button");
    createBtn.className = "ts-role-btn";
    createBtn.textContent = t("btn_create_market", "Create market");
    createBtn.onclick = () => {
      alert("Later: open Create Market flow.");
    };
    box.appendChild(createBtn);
  }

  if (role === "admin") {
    const adminBtn = document.createElement("button");
    adminBtn.className = "ts-role-btn secondary";
    adminBtn.textContent = t("btn_admin_panel", "Admin");
    adminBtn.onclick = () => {
      alert("Later: open Admin panel.");
    };
    box.appendChild(adminBtn);
  }
}

// ===============================
// Загрузка рынков
// ===============================
async function loadMarkets() {
  state.loadingMarkets = true;
  renderMarkets();

  try {
    const res = await fetch("https://api.corsarinc.ru/markets");
    const data = await res.json();
    if (data.ok && Array.isArray(data.markets)) {
      state.markets = data.markets;
    } else {
      state.markets = [];
    }
  } catch (e) {
    state.markets = [];
    logDebug("markets_error", e);
  }

  state.loadingMarkets = false;
  renderMarkets();
}

// ===============================
// Рендер рынков + скелетоны
// ===============================
function renderMarkets() {
  const list = document.getElementById("ts-markets-list");
  if (!list) return;
  list.innerHTML = "";

  if (state.loadingMarkets) {
    renderSkeletons(list);
    return;
  }

  let markets = (state.markets || []).slice();

  // фильтр по категории
  if (state.category && state.category !== "all") {
    markets = markets.filter(
      (m) => (m.category || "other") === state.category
    );
  }

  // поиск
  if (state.search) {
    markets = markets.filter((m) =>
      (m.question || "")
        .toLowerCase()
        .includes(state.search)
    );
  }

  if (!markets.length) {
    const empty = document.createElement("div");
    empty.textContent = t(
      "no_markets",
      "No markets yet. Creator can add one."
    );
    empty.style.fontSize = "10px";
    empty.style.color = "#9ca3af";
    empty.style.padding = "8px";
    list.appendChild(empty);
    return;
  }

  markets.forEach((m) => {
    const card = document.createElement("div");
    card.className = "ts-market-card";

    const icon = document.createElement("div");
    icon.className = "ts-market-icon";
    icon.textContent = "💠";
    card.appendChild(icon);

    const question = document.createElement("div");
    question.className = "ts-market-question";
    question.textContent = m.question || "Untitled market";
    card.appendChild(question);

    const meta = document.createElement("div");
    meta.className = "ts-market-meta";
    const catLabel = m.category || "—";
    meta.textContent = catLabel;
    card.appendChild(meta);

    const vol = document.createElement("div");
    vol.className = "ts-market-vol";
    const volUsd = m.volume_usd || 0;
    vol.textContent = `$${volUsd} Vol.`;
    card.appendChild(vol);

    const actions = document.createElement("div");
    actions.className = "ts-market-actions";

    const yesBtn = document.createElement("button");
    yesBtn.className = "ts-yes-btn";
    yesBtn.textContent = "Yes";
    yesBtn.onclick = () =>
      alert("Later: BUY Yes for market #" + m.id);

    const noBtn = document.createElement("button");
    noBtn.className = "ts-no-btn";
    noBtn.textContent = "No";
    noBtn.onclick = () =>
      alert("Later: BUY No for market #" + m.id);

    const prob = document.createElement("div");
    prob.className = "ts-market-prob";
    const p =
      typeof m.prob_yes === "number" ? m.prob_yes : 50;
    prob.textContent = `${p}% Yes`;

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    actions.appendChild(prob);

    card.appendChild(actions);

    list.appendChild(card);
  });
}

// Скелетоны: 3 карточки, чтобы видно было, где события
function renderSkeletons(list) {
  for (let i = 0; i < 3; i++) {
    const card = document.createElement("div");
    card.className = "ts-market-card skeleton";

    const icon = document.createElement("div");
    icon.className = "ts-market-icon";
    card.appendChild(icon);

    const line1 = document.createElement("div");
    line1.className = "ts-skel-line";
    line1.style.width = "70%";
    card.appendChild(line1);

    const line2 = document.createElement("div");
    line2.className = "ts-skel-line";
    line2.style.width = "50%";
    card.appendChild(line2);

    const pill = document.createElement("div");
    pill.className = "ts-skel-pill";
    card.appendChild(pill);

    list.appendChild(card);
  }
}

// ===============================
// DEBUG -> только в консоль
// ===============================
function logDebug(label, payload) {
  try {
    // eslint-disable-next-line no-console
    console.log("[TS DEBUG]", label, payload);
  } catch (_) {}
}

// Старт
document.addEventListener("DOMContentLoaded", initApp);
