/**
 * TrueStake Mini App frontend
 * Вариант: ванильный JS, без сборщиков.
 */

const API_BASE = "https://api.corsarinc.ru";
const POLL_INTERVAL_MS = 15000;

// Глобальный стейт
const state = {
  lang: "en",
  dict: window.I18N_EN || {},
  token: null,
  user: null, // { id, username, role }
  role: "guest", // guest | user | creator | admin
  tab: "active",
  category: "all",
  search: "",
  markets: [],
  loading: false,
  pollId: null,
};

// Кеш DOM-элементов
const els = {};

// Логгер
function tsLog(...args) {
  console.log("[TrueStake]", ...args);
}

// ===============================
// DOM refs
// ===============================
function initDom() {
  els.root = document.getElementById("root");
  els.langCurrent = document.getElementById("ts-lang-current");
  els.langMenu = document.getElementById("ts-lang-menu");
  els.walletBtn = document.getElementById("ts-wallet-connect");
  els.userLabel = document.getElementById("ts-user-label");
  els.roleLabel = document.getElementById("ts-role-label");

  els.searchInput = document.getElementById("ts-search-input");
  els.filterBtn = document.getElementById("ts-filter-btn");
  els.favBtn = document.getElementById("ts-fav-btn");

  els.categories = document.getElementById("ts-categories");

  els.filterChips = document.querySelectorAll(".ts-filter-chip");

  els.rateValue = document.getElementById("ts-rate-value");

  els.roleActions = document.getElementById("ts-role-actions");

  els.marketsList = document.getElementById("ts-markets-list");

  els.bottomNavButtons = document.querySelectorAll(".ts-bottom-nav-btn");

  els.debug = document.getElementById("ts-debug");
}

// ===============================
// i18n
// ===============================

function t(key, fallback) {
  const dict = state.dict || {};
  if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key];
  }
  return fallback !== undefined ? fallback : key;
}

function detectInitialLang() {
  // 1. Из Telegram WebApp
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    const lc = tg?.initDataUnsafe?.user?.language_code;
    if (lc) {
      if (lc.startsWith("ru")) return "ru";
      if (lc.startsWith("en")) return "en";
    }
  } catch (e) {
    // noop
  }

  // 2. Из браузера
  const navLang = (navigator.language || "en").toLowerCase();
  if (navLang.startsWith("ru")) return "ru";
  return "en";
}

function setLang(lang) {
  if (lang !== "ru" && lang !== "en") lang = "en";

  state.lang = lang;
  state.dict = lang === "ru" ? window.I18N_RU || {} : window.I18N_EN || {};

  if (els.langCurrent) {
    els.langCurrent.textContent = lang === "ru" ? "🇷🇺" : "🇺🇸";
  }

  // Плейсхолдер поиска
  if (els.searchInput) {
    els.searchInput.placeholder = t(
      "SEARCH_PLACEHOLDER",
      lang === "ru" ? "Поиск событий..." : "Search events..."
    );
  }

  // Обновим категории и рынки под язык
  renderCategories();
  renderMarkets();
}

// ===============================
// Работа с токеном
// ===============================
function saveToken(token) {
  if (!token) return;
  state.token = token;
  try {
    localStorage.setItem("ts_token", token);
  } catch (e) {
    tsLog("localStorage set error", e);
  }
}

function loadToken() {
  try {
    const tkn = localStorage.getItem("ts_token");
    if (tkn) {
      state.token = tkn;
      return tkn;
    }
  } catch (e) {
    tsLog("localStorage get error", e);
  }
  return null;
}

function clearToken() {
  state.token = null;
  try {
    localStorage.removeItem("ts_token");
  } catch (e) {
    // ignore
  }
}

// ===============================
// Пользователь и роли
// ===============================
function setUser(user, tokenFromResponse) {
  if (tokenFromResponse) {
    saveToken(tokenFromResponse);
  }

  if (!user) {
    state.user = null;
    state.role = "guest";
  } else {
    const role = (user.role || "user").toLowerCase();
    state.user = {
      id: user.id,
      username: user.username || "guest",
      role,
    };
    state.role = role;
  }

  renderHeader();
  renderRoleActions();
}

function isAdmin() {
  return state.role === "admin";
}

function isCreator() {
  return state.role === "creator" || state.role === "admin";
}

// ===============================
// Авторизация
// ===============================

async function authByTelegram() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.initData) {
    tsLog("No Telegram initData");
    return false;
  }

  try {
    const body = {
      init_data: tg.initData,
      origin: window.location.origin,
      platform: tg.platform || "webapp",
    };

    const res = await fetch(`${API_BASE}/auth/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    tsLog("/auth/telegram", data);

    if (data && data.ok && data.token && data.user) {
      setUser(data.user, data.token);
      return true;
    }
  } catch (e) {
    tsLog("authByTelegram error", e);
  }

  return false;
}

async function authByToken() {
  const token = loadToken();
  if (!token) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json().catch(() => ({}));
    tsLog("/auth/me", data);

    if (data && data.ok && data.user) {
      setUser(data.user, token);
      return true;
    }
  } catch (e) {
    tsLog("authByToken error", e);
  }

  clearToken();
  setUser(null, null);
  return false;
}

async function initAuth() {
  // 1. Telegram
  const okTg = await authByTelegram();
  if (okTg) return;

  // 2. Уже сохранённый токен
  const okToken = await authByToken();
  if (okToken) return;

  // 3. Гость
  setUser(null, null);
}

// ===============================
// Запрос рынков
// ===============================
function buildMarketsQuery() {
  const params = new URLSearchParams();
  params.set("status", state.tab || "active");

  if (state.category && state.category !== "all") {
    params.set("category", state.category);
  }

  const s = (state.search || "").trim();
  if (s.length > 0) {
    params.set("search", s);
  }

  return params.toString();
}

function renderSkeleton() {
  if (!els.marketsList) return;

  const items = [];
  for (let i = 0; i < 3; i++) {
    items.push(`
      <article class="market-card skeleton">
        <div class="market-card-left">
          <div class="market-logo skeleton-box"></div>
          <div class="market-text">
            <div class="skeleton-line w-80"></div>
            <div class="skeleton-line w-40"></div>
          </div>
        </div>
        <div class="market-card-right">
          <div class="skeleton-pill"></div>
          <div class="skeleton-pill"></div>
        </div>
      </article>
    `);
  }

  els.marketsList.innerHTML = items.join("");
}

function formatDate(dtStr) {
  if (!dtStr) return "";
  const d = new Date(dtStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(state.lang === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function renderMarkets() {
  if (!els.marketsList) return;

  if (state.loading) {
    renderSkeleton();
    return;
  }

  const markets = state.markets || [];

  if (!markets.length) {
    els.marketsList.innerHTML = `
      <div class="ts-empty">
        <div class="ts-empty-title">
          ${state.tab === "active"
            ? t("NO_ACTIVE_MARKETS", "No active markets yet")
            : state.tab === "pending"
            ? t("NO_PENDING_MARKETS", "No pending markets")
            : t("NO_RESOLVED_MARKETS", "No resolved markets yet")}
        </div>
        <div class="ts-empty-sub">
          ${t(
            "EMPTY_HINT",
            "Please check again later or try another filter."
          )}
        </div>
      </div>
    `;
    return;
  }

  const html = markets
    .map((m) => {
      const probYes =
        typeof m.prob_yes === "number"
          ? Math.round(m.prob_yes)
          : m.probability_yes
          ? Math.round(m.probability_yes)
          : 50;
      const volume = m.volume_usd || 0;
      const logoUrl =
        m.logo_url || "./assets/logo.png";
      const status = (m.status || "active").toLowerCase();
      const isPending = status === "pending";
      const isResolved = status === "resolved";

      let statusLabel = "";
      if (status === "active") {
        statusLabel = t("STATUS_ACTIVE", "Active");
      } else if (isPending) {
        statusLabel = t("STATUS_PENDING", "Pending");
      } else if (isResolved) {
        statusLabel = t("STATUS_RESOLVED", "Resolved");
      }

      const createdFor = formatDate(m.resolution_ts);
      const category =
        m.category ||
        t("CATEGORY_OTHER", "other");

      const showActivateButton =
        isPending && isAdmin();

      return `
        <article class="market-card" data-market-id="${m.id}">
          <div class="market-card-left">
            <div class="market-logo-wrap">
              <img src="${logoUrl}" alt="" class="market-logo" onerror="this.src='./assets/logo.png'">
              <div class="market-status-pill market-status-${status}">
                ${statusLabel}
              </div>
            </div>
            <div class="market-text">
              <h2 class="market-question">
                ${m.question || ""}
              </h2>
              <div class="market-meta-line">
                <span class="market-category">
                  ${category}
                </span>
                <span class="market-dot">•</span>
                <span class="market-volume">
                  $${volume} Vol.
                </span>
              </div>
              ${
                createdFor
                  ? `<div class="market-deadline">
                      ${t(
                        "RESOLUTION_BY",
                        state.lang === "ru"
                          ? "Результат к"
                          : "Resolution by"
                      )}: ${createdFor}
                    </div>`
                  : ""
              }
              ${
                m.resolution_source
                  ? `<a href="${m.resolution_source}" class="market-source" target="_blank" rel="noopener noreferrer">
                      ${t(
                        "SOURCE",
                        state.lang === "ru"
                          ? "Источник"
                          : "Source"
                      )}
                    </a>`
                  : ""
              }
            </div>
          </div>
          <div class="market-card-right">
            <div class="market-buttons">
              <button class="market-btn market-btn-yes" type="button" disabled>
                ${t("YES", "Yes")}
              </button>
              <button class="market-btn market-btn-no" type="button" disabled>
                ${t("NO", "No")}
              </button>
            </div>
            <div class="market-prob">
              ${probYes}% ${t("YES_LABEL", "Yes")}
            </div>
            ${
              showActivateButton
                ? `<button 
                     type="button" 
                     class="market-admin-activate" 
                     data-action="activate" 
                     data-id="${m.id}">
                     ${t(
                       "ACTIVATE_MARKET",
                       state.lang === "ru"
                         ? "Активировать"
                         : "Activate"
                     )}
                   </button>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");

  els.marketsList.innerHTML = html;
}

// Загрузка рынков с бэка
async function loadMarkets() {
  state.loading = true;
  renderMarkets();

  const query = buildMarketsQuery();
  const url = `${API_BASE}/markets?${query}`;

  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    tsLog("GET /markets", data);

    if (data && data.ok && Array.isArray(data.markets)) {
      state.markets = data.markets;
    } else {
      state.markets = [];
    }
  } catch (e) {
    tsLog("loadMarkets error", e);
    state.markets = [];
  }

  state.loading = false;
  renderMarkets();
}

// ===============================
// Header / роли
// ===============================
function renderHeader() {
  if (!els.userLabel || !els.roleLabel) return;

  if (!state.user) {
    els.userLabel.textContent = "guest";
    els.roleLabel.textContent = "";
    els.roleLabel.className = "ts-role-label";
    return;
  }

  els.userLabel.textContent = state.user.username || "guest";

  const role = state.role;
  let labelText = role;

  if (role === "user") {
    labelText = state.lang === "ru" ? "пользователь" : "user";
  } else if (role === "creator") {
    labelText = state.lang === "ru" ? "creator" : "creator";
  } else if (role === "admin") {
    labelText = state.lang === "ru" ? "admin" : "admin";
  }

  els.roleLabel.textContent = labelText;
  els.roleLabel.className = "ts-role-label";

  if (role === "creator") {
    els.roleLabel.classList.add("creator");
  } else if (role === "admin") {
    els.roleLabel.classList.add("admin");
  }
}

function renderRoleActions() {
  if (!els.roleActions) return;

  if (!isCreator() && !isAdmin()) {
    els.roleActions.style.display = "none";
    els.roleActions.innerHTML = "";
    return;
  }

  let html = "";

  if (isCreator()) {
    html += `
      <button 
        type="button" 
        class="ts-role-btn" 
        id="ts-btn-create-market">
        ${state.lang === "ru" ? "Создать рынок" : "Create market"}
      </button>
    `;
  }

  if (isAdmin()) {
    html += `
      <button 
        type="button" 
        class="ts-role-btn ts-role-btn-secondary" 
        id="ts-btn-admin-pending">
        ${state.lang === "ru" ? "Pending рынки" : "Pending markets"}
      </button>
    `;
  }

  els.roleActions.innerHTML = html;
  els.roleActions.style.display = "flex";

  // Навесим обработчики
  const createBtn = document.getElementById("ts-btn-create-market");
  const pendingBtn = document.getElementById("ts-btn-admin-pending");

  if (createBtn) {
    createBtn.addEventListener("click", () => {
      // TODO: нормальная форма создания рынка
      alert(
        state.lang === "ru"
          ? "Форма создания рынка ещё не реализована."
          : "Market creation form is not implemented yet."
      );
    });
  }

  if (pendingBtn) {
    pendingBtn.addEventListener("click", () => {
      state.tab = "pending";
      syncFilterChips();
      loadMarkets();
    });
  }
}

// ===============================
// Категории
// ===============================
function getCategoriesList() {
  const raw = window.TS_CATEGORIES;
  let list = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    list = Object.values(raw);
  }

  // Добавим "all" как первую
  const allItem = {
    key: "all",
    label_en: "All",
    label_ru: "Все",
  };

  return [allItem, ...list];
}

function getCategoryKey(cat) {
  return (
    cat.key ||
    cat.id ||
    cat.code ||
    cat.slug ||
    cat.value ||
    "all"
  );
}

function getCategoryLabel(cat) {
  if (state.lang === "ru") {
    return (
      cat.label_ru ||
      cat.name_ru ||
      cat.title_ru ||
      cat.ru ||
      cat.label ||
      cat.name ||
      "Все"
    );
  }
  return (
    cat.label_en ||
    cat.name_en ||
    cat.title_en ||
    cat.en ||
    cat.label ||
    cat.name ||
    "All"
  );
}

function renderCategories() {
  if (!els.categories) return;

  const cats = getCategoriesList();

  const html = cats
    .map((cat) => {
      const key = getCategoryKey(cat);
      const label = getCategoryLabel(cat);
      const active = key === state.category;
      return `
        <button 
          type="button" 
          class="ts-category-pill ${active ? "active" : ""}" 
          data-category="${key}">
          ${label}
        </button>
      `;
    })
    .join("");

  els.categories.innerHTML = html;
}

// ===============================
// Обработчики UI
// ===============================
function syncFilterChips() {
  if (!els.filterChips) return;
  els.filterChips.forEach((chip) => {
    const value = chip.dataset.filter;
    if (value === state.tab) {
      chip.classList.add("ts-filter-chip-active");
    } else {
      chip.classList.remove("ts-filter-chip-active");
    }
  });
}

function setupEvents() {
  // Языковое меню
  if (els.langCurrent && els.langMenu) {
    els.langCurrent.addEventListener("click", () => {
      const isOpen = els.langMenu.style.display === "block";
      els.langMenu.style.display = isOpen ? "none" : "block";
    });

    els.langMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-lang]");
      if (!item) return;
      const lang = item.dataset.lang;
      setLang(lang);
      els.langMenu.style.display = "none";
    });

    // Клик вне меню — закрыть
    document.addEventListener("click", (e) => {
      const withinMenu = e.target.closest(".ts-lang-wrap");
      if (!withinMenu && els.langMenu) {
        els.langMenu.style.display = "none";
      }
    });
  }

  // Кнопка кошелька
  if (els.walletBtn) {
    els.walletBtn.addEventListener("click", () => {
      alert(
        state.lang === "ru"
          ? "Подключение TON-кошелька будет реализовано позже."
          : "TON wallet connection will be implemented later."
      );
    });
  }

  // Поиск
  if (els.searchInput) {
    let timeoutId = null;
    els.searchInput.addEventListener("input", (e) => {
      const value = e.target.value || "";
      state.search = value;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        loadMarkets();
      }, 400);
    });
  }

  // Таб Active/Pending/Resolved
  if (els.filterChips && els.filterChips.length) {
    els.filterChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const filter = chip.dataset.filter;
        if (!filter) return;
        state.tab = filter;
        syncFilterChips();
        loadMarkets();
      });
    });
  }

  // Категории (делегирование)
  if (els.categories) {
    els.categories.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-category]");
      if (!btn) return;
      const key = btn.dataset.category || "all";
      state.category = key;
      renderCategories();
      loadMarkets();
    });
  }

  // Клик по рынкам (админ-активация)
  if (els.marketsList) {
    els.marketsList.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const marketId = btn.dataset.id;
      if (!action || !marketId) return;

      if (action === "activate") {
        if (!isAdmin()) return;
        await activateMarket(marketId);
      }
    });
  }

  // Нижняя навигация (пока просто визуал)
  if (els.bottomNavButtons && els.bottomNavButtons.length) {
    els.bottomNavButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        els.bottomNavButtons.forEach((b) =>
          b.classList.remove("ts-bottom-nav-btn-active")
        );
        btn.classList.add("ts-bottom-nav-btn-active");
      });
    });
  }
}

// ===============================
// Админ: активация рынка
// ===============================
async function activateMarket(marketId) {
  if (!state.token) {
    alert(
      state.lang === "ru"
        ? "Нужна авторизация админа."
        : "Admin authorization required."
    );
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/markets/activate/${marketId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${state.token}`,
        },
      }
    );

    const data = await res.json().catch(() => ({}));
    tsLog("POST /markets/activate", data);

    if (data && data.ok) {
      await loadMarkets();
      alert(
        state.lang === "ru"
          ? "Рынок активирован."
          : "Market activated."
      );
    } else {
      alert(
        state.lang === "ru"
          ? "Не удалось активировать рынок."
          : "Failed to activate market."
      );
    }
  } catch (e) {
    tsLog("activateMarket error", e);
    alert(
      state.lang === "ru"
        ? "Ошибка при запросе к API."
        : "Error while calling API."
    );
  }
}

// ===============================
// Пуллинг рынков
// ===============================
function startPolling() {
  if (state.pollId) {
    clearInterval(state.pollId);
  }
  state.pollId = setInterval(() => {
    loadMarkets();
  }, POLL_INTERVAL_MS);
}

// ===============================
// Инициализация
// ===============================
async function initApp() {
  initDom();

  const lang = detectInitialLang();
  setLang(lang);

  setupEvents();

  await initAuth();

  syncFilterChips();
  renderCategories();

  await loadMarkets();
  startPolling();

  tsLog("App initialized");
}

// Запуск
document.addEventListener("DOMContentLoaded", () => {
  try {
    initApp();
  } catch (e) {
    console.error("Init error", e);
  }
});
