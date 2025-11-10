// =====================================
// TrueStake Mini App frontend
// =====================================

// Базовый API
const API_BASE = "https://api.corsarinc.ru";

// Глобальное состояние
const state = {
  lang: "en",          // текущий язык
  dict: {},            // словарь
  token: null,         // JWT
  user: null,          // { id, username, role }
  markets: [],         // список рынков
  status: "active",    // active | pending | resolved
  category: "all",     // фильтр категорий
  search: "",          // строка поиска
  refreshTimer: null
};

// =====================================
// I18N (минимум ru/en, можно расширять)
// =====================================

const I18N = {
  en: {
    create_market_btn: "+ Create market",
    role_guest: "guest",
    role_creator: "creator",
    role_admin: "admin",
    no_markets: "No markets yet.",
    creator_hint: "Creator can add the first one.",
    connect_wallet: "Connect TON wallet"
  },
  ru: {
    create_market_btn: "+ Создать рынок",
    role_guest: "гость",
    role_creator: "креатор",
    role_admin: "админ",
    no_markets: "Пока нет рыночных событий.",
    creator_hint: "Создатель может добавить событие.",
    connect_wallet: "Подключить TON-кошелёк"
  }
};

function setLang(lang) {
  if (!I18N[lang]) lang = "en";
  state.lang = lang;
  state.dict = I18N[lang];

  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) {
    langBtn.textContent = lang.toUpperCase();
  }

  const walletBtn = document.getElementById("wallet-btn");
  if (walletBtn && state.dict.connect_wallet) {
    walletBtn.textContent = state.dict.connect_wallet;
  }

  renderMarkets(); // перерисовать надписи
}

// =====================================
// Роли / пользователь
// =====================================

function setUser(user, token) {
  state.user = user || null;
  state.token = token || null;

  const pill = document.getElementById("user-pill");
  const roleLabel = document.getElementById("user-role-label");
  const createBtn = document.getElementById("create-market-btn");

  // если каких-то элементов нет — тихо выходим, без падений
  if (!pill || !roleLabel || !createBtn) {
    return;
  }

  if (!user) {
    roleLabel.textContent = I18N[state.lang].role_guest || "guest";
    createBtn.style.display = "none";
    return;
  }

  // роль из backend (user.role), если нет — считаем user
  const rawRole = (user.role || "user").toLowerCase();
  let prettyRole = rawRole;

  if (rawRole === "admin") {
    prettyRole = I18N[state.lang].role_admin || "admin";
  } else if (rawRole === "creator") {
    prettyRole = I18N[state.lang].role_creator || "creator";
  } else if (rawRole === "user") {
    prettyRole = I18N[state.lang].role_guest || "user";
  }

  const uname = user.username
    ? "@" + user.username
    : String(user.id || "");

  roleLabel.textContent = `${uname} · ${prettyRole}`;

  // Права:
  // creator / admin — видят кнопку создания рынка
  if (rawRole === "creator" || rawRole === "admin") {
    createBtn.style.display = "inline-flex";
    createBtn.textContent =
      state.dict.create_market_btn || "+ Create market";
  } else {
    createBtn.style.display = "none";
  }
}

// =====================================
// Auth через Telegram Mini App
// =====================================

// 1) Пытаемся считать язык из Telegram, чтобы сразу выбрать ru/en
function detectLangFromTelegram() {
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      const unsafe = window.Telegram.WebApp.initDataUnsafe || {};
      const lc = (unsafe.user && unsafe.user.language_code) || "";
      if (lc.startsWith("ru")) return "ru";
      if (lc.startsWith("en")) return "en";
    }
  } catch (e) {}
  return "en";
}

// 2) Получаем токен по initData
async function authFromTelegram() {
  try {
    if (!(window.Telegram && window.Telegram.WebApp)) {
      // не в Telegram — остаёмся гостем
      return;
    }

    const tg = window.Telegram.WebApp;
    tg.ready();

    const initData = tg.initData || "";
    if (!initData) {
      // нет initData — остаёмся гостем
      return;
    }

    const res = await fetch(`${API_BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData })
    });

    const data = await res.json();
    if (!data.ok || !data.token) {
      return;
    }

    // Есть токен — дотягиваем роль через /auth/me
    await authWithToken(data.token);
  } catch (e) {
    console.log("[authFromTelegram][error]", e);
  }
}

// 3) По токену тянем /auth/me, чтобы получить role
async function authWithToken(token) {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    const data = await res.json();
    if (!data.ok || !data.user) {
      return;
    }

    setUser(data.user, token);
  } catch (e) {
    console.log("[authWithToken][error]", e);
  }
}

// =====================================
// Markets: загрузка и рендер
// =====================================

async function fetchMarkets(showSkeleton = false) {
  const listEl = document.getElementById("markets-list");
  if (!listEl) return;

  try {
    if (showSkeleton) {
      listEl.innerHTML = `
        <div class="ts-market-skeleton"></div>
        <div class="ts-market-skeleton"></div>
        <div class="ts-market-skeleton"></div>
      `;
    }

    const params = new URLSearchParams();
    params.set("status", state.status || "active");

    if (state.category && state.category !== "all") {
      params.set("category", state.category);
    }

    if (state.search && state.search.trim().length > 1) {
      params.set("search", state.search.trim());
    }

    const res = await fetch(`${API_BASE}/markets?${params.toString()}`);
    const data = await res.json();

    if (!data.ok) {
      listEl.innerHTML =
        `<div class="ts-empty">[markets_error] ${data.error || ""}</div>`;
      return;
    }

    state.markets = data.markets || [];
    renderMarkets();
  } catch (e) {
    listEl.innerHTML =
      `<div class="ts-empty">[markets_error] ${String(e)}</div>`;
  }
}

function renderMarkets() {
  const listEl = document.getElementById("markets-list");
  if (!listEl) return;

  if (!state.markets.length) {
    const t = (state.dict.no_markets || "No markets yet.") +
      " " +
      (state.dict.creator_hint || "");
    listEl.innerHTML = `<div class="ts-empty">${t}</div>`;
    return;
  }

  listEl.innerHTML = state.markets.map(renderMarketCard).join("");
}

function renderMarketCard(m) {
  const prob = typeof m.prob_yes === "number" ? m.prob_yes : 50;
  const yes = Math.round(prob);
  const no = 100 - yes;
  const logo = m.logo_url || "/assets/logo.png";
  const cat = m.category || "—";

  return `
    <div class="ts-market-card">
      <div class="ts-market-left">
        <div class="ts-market-logo-wrap">
          <img src="${logo}" class="ts-market-logo" alt="">
        </div>
      </div>
      <div class="ts-market-main">
        <div class="ts-market-title">${escapeHtml(m.question || "")}</div>
        <div class="ts-market-meta">
          <span class="ts-market-label">${cat}</span>
          <span class="ts-market-label">$${(m.volume_usd || 0).toLocaleString()} Vol.</span>
        </div>
        <div class="ts-market-actions">
          <div class="ts-pill-yes">Yes <span>${yes}%</span></div>
          <div class="ts-pill-no">No <span>${no}%</span></div>
        </div>
      </div>
      <div class="ts-market-right">
        <button class="ts-icon-btn" title="Share">↗</button>
        <button class="ts-icon-btn" title="Watchlist">☆</button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// =====================================
// Create Market (UI пока на потом)
// (кнопка уже прячется/показывается по роли)
// =====================================

function openCreateModal() {
  const modal = document.getElementById("create-market-modal");
  if (modal) modal.classList.remove("hidden");
}

function closeCreateModal() {
  const modal = document.getElementById("create-market-modal");
  if (modal) modal.classList.add("hidden");
}

async function submitCreateMarket() {
  // форму мы доделаем следующим шагом
}

// =====================================
// Init
// =====================================

async function init() {
  // Язык: сначала из Telegram, иначе en
  const lang = detectLangFromTelegram();
  setLang(lang);

  // обработчик переключения языка (RU/EN)
  const langBtn = document.getElementById("lang-toggle");
  if (langBtn) {
    langBtn.addEventListener("click", () => {
      setLang(state.lang === "ru" ? "en" : "ru");
      // перерисовка роли в новом языке
      setUser(state.user, state.token);
    });
  }

  // кнопка создания рынка
  const createBtn = document.getElementById("create-market-btn");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      if (!state.user) return;
      openCreateModal();
    });
  }

  const cmClose = document.getElementById("create-market-close");
  const cmCancel = document.getElementById("cm-cancel");
  const cmSubmit = document.getElementById("cm-submit");

  if (cmClose) cmClose.addEventListener("click", closeCreateModal);
  if (cmCancel) cmCancel.addEventListener("click", closeCreateModal);
  if (cmSubmit) cmSubmit.addEventListener("click", submitCreateMarket);

  // Категории (если в index.html расставлены data-category)
  document.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.category = btn.getAttribute("data-category") || "all";
      fetchMarkets(true);
    });
  });

  // Табы статуса (Active/Pending/Resolved)
  document.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.status = btn.getAttribute("data-status") || "active";
      fetchMarkets(true);
    });
  });

  // Поиск
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.search = e.target.value || "";
      // не ддосим: лёгкая задержка могла бы быть, но пока просто дергаем
      fetchMarkets(true);
    });
  }

  // 1) Авторизация через Telegram (если есть)
  await authFromTelegram();

  // 2) Первый запрос рынков
  await fetchMarkets(true);

  // 3) Периодическое обновление каждые 20 секунд
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(fetchMarkets, 20000);
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch (e) {
    console.error("[init][fatal]", e);
  }
});
