// ===============================
// Глобальное состояние
// ===============================
const state = {
  lang: "en",          // текущий язык
  dict: {},            // активный словарь
  token: null,         // JWT от backend
  user: null,          // { id, username, role }
  markets: [],         // список рынков
  category: "all",     // активная категория
  filterStatus: "active",
  search: ""
};

// ===============================
// Вспомогательные функции
// ===============================

// Определить язык по Telegram.WebApp.initDataUnsafe.user.language_code
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

// Установить словарь по коду языка
function setLang(lang) {
  state.lang = lang;
  state.dict =
    lang === "ru"
      ? (window.I18N_RU || window.I18N_EN)
      : (window.I18N_EN || window.I18N_RU);

  // Обновляем статический текст
  document.getElementById("ts-brand-name").textContent =
    state.dict.brand_name || "TrueStake";
  document.getElementById("ts-brand-tagline").textContent =
    state.dict.brand_tagline || "on TON · Telegram Mini App";

  const searchInput = document.getElementById("ts-search-input");
  if (searchInput) {
    searchInput.placeholder =
      state.dict.search_placeholder || "Search events...";
  }

  renderCategories();
  renderMarkets();
  renderRoleActions();
}

// Взять строку локализации
function t(key, fallback = "") {
  return (state.dict && state.dict[key]) || fallback || key;
}

// ===============================
// INIT: Telegram + Auth
// ===============================
function initApp() {
  const tg = window.Telegram?.WebApp;

  // Если открыто как Mini App в Telegram
  if (tg && tg.initData) {
    tg.ready();
    const initData = tg.initData;

    // отправляем на backend /auth/telegram
    fetchAuth(initData)
      .then(() => {
        // после авторизации подгружаем рынки
        return loadMarkets();
      })
      .catch((err) => {
        logDebug("auth_error", err);
      });
  } else {
    // Открыто в браузере (без Telegram) — гость
    state.user = null;
    state.token = null;
    loadMarkets().catch(() => {});
  }

  // Язык — по Telegram, иначе en
  const lang = detectLang(tg);
  setLang(lang);

  // Обработчики UI
  setupUI();
}

// Авторизация через /auth/telegram
async function fetchAuth(initData) {
  const res = await fetch("https://api.corsarinc.ru/auth/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: initData })
  });

  const data = await res.json().catch(() => ({}));
  if (!data.ok || !data.token) {
    throw new Error("auth_failed");
  }

  state.token = data.token;
  state.user = data.user || null;

  // Пытаемся подтянуть полную инфу (включая role) через /auth/me
  try {
    const meRes = await fetch("https://api.corsarinc.ru/auth/me", {
      headers: { Authorization: "Bearer " + state.token }
    });
    const me = await meRes.json();
    if (me.ok && me.user) {
      state.user = me.user;
    }
  } catch (_) {
    // если не получилось — остаёмся с тем, что есть
  }

  renderUserHeader();
  renderRoleActions();
}

// ===============================
// UI: обработчики
// ===============================
function setupUI() {
  // Переключение языка
  const langBtn = document.getElementById("ts-lang-toggle");
  if (langBtn) {
    langBtn.textContent = state.lang.toUpperCase();
    langBtn.onclick = () => {
      const next = state.lang === "en" ? "ru" : "en";
      langBtn.textContent = next.toUpperCase();
      setLang(next);
    };
  }

  // Поиск
  const searchInput = document.getElementById("ts-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.search = e.target.value.trim().toLowerCase();
      renderMarkets();
    });
  }

  // Фильтры статуса
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
}

// ===============================
// Рендер: шапка пользователя
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
    btn.className = "ts-category-pill" + (state.category === cat.id ? " active" : "");
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

  // Кнопки только для creator/admin
  if (role === "creator" || role === "admin") {
    box.style.display = "flex";

    // Кнопка создания рынка (простая заглушка)
    const createBtn = document.createElement("button");
    createBtn.className = "ts-role-btn";
    createBtn.textContent = t("btn_create_market", "Create market");
    createBtn.onclick = () => {
      alert("Later: open Create Market flow in Mini App.");
    };
    box.appendChild(createBtn);
  }

  // Доп. кнопки только для admin
  if (role === "admin") {
    const adminBtn = document.createElement("button");
    adminBtn.className = "ts-role-btn secondary";
    adminBtn.textContent = t("btn_admin_panel", "Admin");
    adminBtn.onclick = () => {
      alert("Later: open Admin panel (markets moderation, etc).");
    };
    box.appendChild(adminBtn);
  }
}

// ===============================
// Загрузка рынков с backend
// ===============================
async function loadMarkets() {
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

  renderMarkets();
}

// ===============================
// Рендер: карточки рынков
// ===============================
function renderMarkets() {
  const list = document.getElementById("ts-markets-list");
  if (!list) return;

  const markets = (state.markets || []).filter((m) => {
    // фильтр по статусу (если backend вернёт status)
    if (state.filterStatus && m.status && m.status !== state.filterStatus) {
      if (!(state.filterStatus === "active" && m.status === "active")) {
        // упрощённо: показываем только точное совпадение, потом доработаем
      }
    }

    // фильтр по категории
    if (state.category && state.category !== "all") {
      if ((m.category || "other") !== state.category) {
        return false;
      }
    }

    // поиск по вопросу
    if (state.search) {
      const q = (m.question || "").toLowerCase();
      if (!q.includes(state.search)) return false;
    }

    return true;
  });

  list.innerHTML = "";

  if (!markets.length) {
    const empty = document.createElement("div");
    empty.textContent = t("no_markets", "No markets yet.");
    empty.style.fontSize = "10px";
    empty.style.color = "#9ca3af";
    empty.style.padding = "8px";
    list.appendChild(empty);
    return;
  }

  markets.forEach((m) => {
    const card = document.createElement("div");
    card.className = "ts-market-card";

    // Иконка / флаг (пока просто 💠)
    const icon = document.createElement("div");
    icon.className = "ts-market-icon";
    icon.textContent = "💠";
    card.appendChild(icon);

    // Вопрос
    const question = document.createElement("div");
    question.className = "ts-market-question";
    question.textContent = m.question || "Untitled market";
    card.appendChild(question);

    // Мета-инфо (категория, срок)
    const meta = document.createElement("div");
    meta.className = "ts-market-meta";
    const catLabel = m.category || "—";
    meta.textContent = catLabel;
    card.appendChild(meta);

    // Объём
    const vol = document.createElement("div");
    vol.className = "ts-market-vol";
    const volUsd = m.volume_usd || 0;
    vol.textContent = `$${volUsd} Vol.`;
    card.appendChild(vol);

    // Блок YES/NO + вероятность
    const actions = document.createElement("div");
    actions.className = "ts-market-actions";

    const yesBtn = document.createElement("button");
    yesBtn.className = "ts-yes-btn";
    yesBtn.textContent = "Yes";
    yesBtn.onclick = () => alert("Later: BUY Yes for market #" + m.id);

    const noBtn = document.createElement("button");
    noBtn.className = "ts-no-btn";
    noBtn.textContent = "No";
    noBtn.onclick = () => alert("Later: BUY No for market #" + m.id);

    const prob = document.createElement("div");
    prob.className = "ts-market-prob";
    const p = typeof m.prob_yes === "number" ? m.prob_yes : 50;
    prob.textContent = `${p}% Yes`;

    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    actions.appendChild(prob);

    card.appendChild(actions);

    list.appendChild(card);
  });
}

// ===============================
// DEBUG
// ===============================
function logDebug(label, payload) {
  const box = document.getElementById("ts-debug");
  if (!box) return;
  box.style.display = "block";
  const data = typeof payload === "string" ? payload : JSON.stringify(payload);
  box.textContent = `[${label}] ${data}`;
}

// Старт
document.addEventListener("DOMContentLoaded", initApp);
