// ===============================
// TrueStake Mini App frontend
// ===============================

// Базовый URL бэкенда
const API_BASE = "https://api.corsarinc.ru";

// Глобальное состояние приложения
const state = {
  lang: "ru",              // текущий язык
  dict: window.I18N_RU,    // активный словарь
  token: null,             // JWT токен
  user: null,              // { id, username, role }
  role: "guest",           // guest | user | creator | admin
  tab: "active",           // active | pending | resolved
  category: "all",         // фильтр категорий
  search: "",              // строка поиска
  markets: [],             // список рынков
  loading: false,          // флаг загрузки рынков
  marketsTimerId: null,    // id setInterval
};

// Утилита логов (чтобы видеть, что происходит)
function tsLog(...args) {
  console.log("[TrueStake]", ...args);
}

// ===============================
// DOM-элементы (один раз)
// ===============================
const els = {};

function initDomRefs() {
  els.username = document.getElementById("ts-username");
  els.rolePill = document.getElementById("ts-role-pill");
  els.langToggle = document.getElementById("ts-lang-toggle");
  els.connectWallet = document.getElementById("ts-connect-wallet");

  els.tabActive = document.getElementById("ts-tab-active");
  els.tabPending = document.getElementById("ts-tab-pending");
  els.tabResolved = document.getElementById("ts-tab-resolved");

  els.categories = document.querySelectorAll("[data-ts-category]");
  els.searchInput = document.getElementById("ts-search-input");

  els.marketsList = document.getElementById("ts-markets-list");
  els.marketsError = document.getElementById("ts-markets-error");

  els.btnCreateMarket = document.getElementById("ts-btn-create-market");
  els.btnAdminPanel = document.getElementById("ts-btn-admin-panel");
}

// ===============================
// i18n
// ===============================

function applyLang(lang) {
  if (lang !== "ru" && lang !== "en") lang = "en";

  state.lang = lang;
  state.dict = lang === "ru" ? window.I18N_RU : window.I18N_EN;

  if (els.langToggle) {
    els.langToggle.textContent = lang === "ru" ? "RU" : "EN";
  }

  // Переводы простых текстов здесь при необходимости.
  renderHeader();
  renderMarkets();
}

// ===============================
// Авторизация
// ===============================

// Сохранить токен локально
function saveToken(token) {
  if (!token) return;
  state.token = token;
  try {
    localStorage.setItem("ts_token", token);
  } catch (e) {
    tsLog("localStorage error", e);
  }
}

// Прочитать токен из localStorage
function loadTokenFromStorage() {
  try {
    const t = localStorage.getItem("ts_token");
    if (t) {
      state.token = t;
      return t;
    }
  } catch (e) {
    tsLog("localStorage read error", e);
  }
  return null;
}

// Установить пользователя в стейт
function setUser(user, tokenFromResponse) {
  if (tokenFromResponse) {
    saveToken(tokenFromResponse);
  }

  if (!user) {
    state.user = null;
    state.role = "guest";
  } else {
    state.user = {
      id: user.id,
      username: user.username || "guest",
      role: (user.role || "user").toLowerCase(),
    };
    state.role = state.user.role;
  }

  renderHeader();
  renderRoleControls();
}

// Авторизация через Telegram WebApp (/auth/telegram)
async function tryTelegramAuth() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) {
    tsLog("No Telegram WebApp initData, skip /auth/telegram");
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        init_data: tg.initData,
        origin: window.location.origin,
        platform: tg.platform || "webapp",
      }),
    });

    const data = await res.json().catch(() => ({}));
    tsLog("/auth/telegram response", data);

    if (data && data.ok && data.token && data.user) {
      setUser(data.user, data.token);
      return true;
    }
  } catch (e) {
    tsLog("/auth/telegram error", e);
  }

  return false;
}

// Авторизация по уже сохранённому токену (/auth/me)
async function tryAuthMe() {
  const token = loadTokenFromStorage();
  if (!token) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json().catch(() => ({}));
    tsLog("/auth/me response", data);

    if (data && data.ok && data.user) {
      setUser(data.user, token);
      return true;
    }
  } catch (e) {
    tsLog("/auth/me error", e);
  }

  // Токен невалиден — очищаем
  try {
    localStorage.removeItem("ts_token");
  } catch (e) {}

  state.token = null;
  setUser(null, null);
  return false;
}

// Инициализация авторизации: сначала Telegram, потом /auth/me
async function initAuth() {
  // 1. Пробуем Telegram WebApp
  const okTelegram = await tryTelegramAuth();
  if (okTelegram) return;

  // 2. Пробуем существующий токен
  const okMe = await tryAuthMe();
  if (okMe) return;

  // 3. Гость
  tsLog("No auth, guest mode");
  setUser(null, null);
}

// ===============================
// Загрузка рынков
// ===============================

function buildMarketsQuery() {
  const params = new URLSearchParams();
  params.set("status", state.tab || "active");

  if (state.category && state.category !== "all") {
    params.set("category", state.category);
  }

  if (state.search && state.search.trim().length > 0) {
    params.set("search", state.search.trim());
  }

  return params.toString();
}

function renderSkeleton() {
  if (!els.marketsList) return;
  els.marketsError && (els.marketsError.textContent = "");

  const skeleton = [];
  for (let i = 0; i < 3; i++) {
    skeleton.push(`
      <div class="market-card skeleton">
        <div class="market-card-left">
          <div class="market-logo skeleton-box"></div>
          <div class="market-text">
            <div class="skeleton-line w-70"></div>
            <div class="skeleton-line w-40"></div>
          </div>
        </div>
        <div class="market-card-right">
          <div class="skeleton-pill"></div>
          <div class="skeleton-pill"></div>
        </div>
      </div>
    `);
  }

  els.marketsList.innerHTML = skeleton.join("");
}

// Рендер рынков
function renderMarkets() {
  if (!els.marketsList) return;

  els.marketsError && (els.marketsError.textContent = "");

  if (state.loading) {
    renderSkeleton();
    return;
  }

  if (!state.markets || state.markets.length === 0) {
    els.marketsList.innerHTML =
      `<div class="markets-empty">${state.dict.no_markets || "Пока нет рынков."}</div>`;
    return;
  }

  const cards = state.markets.map((m) => {
    const prob = typeof m.prob_yes === "number" ? m.prob_yes : 50;
    const vol = typeof m.volume_usd === "number" ? m.volume_usd : 0;
    const volStr = `$${vol.toLocaleString("en-US")} Vol.`;
    const cat = m.category || "";

    return `
      <div class="market-card">
        <div class="market-card-left">
          <div class="market-logo">
            <img src="${m.logo_url || "./assets/logo.png"}" alt="">
          </div>
          <div class="market-text">
            <div class="market-question">${m.question}</div>
            <div class="market-meta">
              <span class="market-volume">${volStr}</span>
              ${cat ? `<span class="market-category">${cat}</span>` : ""}
            </div>
          </div>
        </div>
        <div class="market-card-right">
          <div class="market-buttons">
            <button class="btn-yes">Yes</button>
            <button class="btn-no">No</button>
          </div>
          <div class="market-prob">
            ${prob}% Yes
          </div>
        </div>
      </div>
    `;
  });

  els.marketsList.innerHTML = cards.join("");
}

// Запрос рынков
async function loadMarkets() {
  state.loading = true;
  renderMarkets();

  const qs = buildMarketsQuery();
  const url = `${API_BASE}/markets?${qs}`;

  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    tsLog("GET /markets", url, data);

    if (!data || !data.ok || !Array.isArray(data.markets)) {
      throw new Error("bad_markets_response");
    }

    state.markets = data.markets;
    state.loading = false;
    renderMarkets();
  } catch (e) {
    tsLog("loadMarkets error", e);
    state.loading = false;
    state.markets = [];
    renderMarkets();
    if (els.marketsError) {
      els.marketsError.textContent = "[markets_error]";
    }
  }
}

// ===============================
// Роли и кнопки
// ===============================

function renderHeader() {
  if (els.username) {
    els.username.textContent =
      state.user && state.user.username
        ? `@${state.user.username}`
        : "guest";
  }

  if (els.rolePill) {
    let text = "guest";
    if (state.role === "admin") text = "admin";
    else if (state.role === "creator") text = "creator";
    else if (state.role === "user") text = "user";

    els.rolePill.textContent = text;
    els.rolePill.style.display = text === "guest" ? "none" : "inline-flex";
  }
}

function renderRoleControls() {
  // creator/admin: показываем кнопку создания рынка
  if (els.btnCreateMarket) {
    els.btnCreateMarket.style.display =
      state.role === "creator" || state.role === "admin"
        ? "inline-flex"
        : "none";
  }

  // admin: показываем "админку" (пока заглушка)
  if (els.btnAdminPanel) {
    els.btnAdminPanel.style.display =
      state.role === "admin" ? "inline-flex" : "none";
  }
}

// ===============================
// Обработчики UI
// ===============================

function bindEvents() {
  if (els.langToggle) {
    els.langToggle.addEventListener("click", () => {
      applyLang(state.lang === "ru" ? "en" : "ru");
      loadMarkets();
    });
  }

  if (els.searchInput) {
    els.searchInput.addEventListener("input", (e) => {
      state.search = e.target.value || "";
      // лёгкий debounce тут не обязателен, просто сразу:
      loadMarkets();
    });
  }

  if (els.tabActive) {
    els.tabActive.addEventListener("click", () => {
      state.tab = "active";
      setActiveTabButton("active");
      loadMarkets();
    });
  }
  if (els.tabPending) {
    els.tabPending.addEventListener("click", () => {
      state.tab = "pending";
      setActiveTabButton("pending");
      loadMarkets();
    });
  }
  if (els.tabResolved) {
    els.tabResolved.addEventListener("click", () => {
      state.tab = "resolved";
      setActiveTabButton("resolved");
      loadMarkets();
    });
  }

  if (els.categories && els.categories.length) {
    els.categories.forEach((btn) => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-ts-category") || "all";
        state.category = cat;
        els.categories.forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        loadMarkets();
      });
    });
  }

  if (els.btnCreateMarket) {
    els.btnCreateMarket.addEventListener("click", () => {
      alert("Create Market: здесь будет форма для креатора.");
    });
  }

  if (els.btnAdminPanel) {
    els.btnAdminPanel.addEventListener("click", () => {
      alert("Admin Panel: здесь будут инструменты админа.");
    });
  }
}

// Подсветка активного таба
function setActiveTabButton(tab) {
  if (!els.tabActive || !els.tabPending || !els.tabResolved) return;
  els.tabActive.classList.toggle("active", tab === "active");
  els.tabPending.classList.toggle("active", tab === "pending");
  els.tabResolved.classList.toggle("active", tab === "resolved");
}

// ===============================
// Инициализация
// ===============================

async function initApp() {
  initDomRefs();
  bindEvents();
  applyLang("ru"); // дефолт — RU, дальше юзер переключит

  setActiveTabButton("active");

  await initAuth();   // определяем guest/creator/admin
  await loadMarkets();

  // Пуллим рынки каждые 15 секунд (живое обновление)
  if (state.marketsTimerId) clearInterval(state.marketsTimerId);
  state.marketsTimerId = setInterval(loadMarkets, 15000);
}

// Запуск
document.addEventListener("DOMContentLoaded", initApp);
