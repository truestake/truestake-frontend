// ======================================================
// TrueStake Mini App — фронтовая логика
// Все ключевые части прокомментированы на русском.
// ======================================================

// ----------------------
// Глобальное состояние
// ----------------------
const state = {
  lang: "en",          // текущий язык интерфейса
  dict: I18N_EN,       // активный словарь
  token: null,         // JWT от backend
  user: null,          // { id, username, role }
  markets: [],         // список рынков
  category: "all",     // выбранная категория
  tab: "markets",      // активная вкладка
};

// ----------------------
// Утилита: выбрать язык
// Берём из Telegram WebApp user.language_code,
// если ru -> ru, иначе -> en.
// ----------------------
function detectLang(tgUser) {
  const code =
    (tgUser && tgUser.language_code) ||
    (window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code) ||
    "en";

  if (code.startsWith("ru")) return "ru";
  return "en";
}

// ----------------------
// Применить словарь к DOM
// ----------------------
function applyI18n() {
  const dict = state.dict;

  // Текстовые ноды
  document
    .querySelectorAll("[data-i18n]")
    .forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key]) el.textContent = dict[key];
    });

  // Плейсхолдеры для input
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (dict[key]) el.placeholder = dict[key];
    });
}

// ----------------------
// Рендер информации о юзере и роли
// ----------------------
function renderUserInfo() {
  const userEl = document.getElementById("ts-user-label");
  const roleEl = document.getElementById("ts-role-label");

  if (!state.user) {
    userEl.textContent = "guest";
    roleEl.textContent = "";
    roleEl.style.display = "none";
    return;
  }

  userEl.textContent = `@${state.user.username || state.user.id}`;

  const role = state.user.role || "user";
  if (role === "admin") {
    roleEl.textContent = "admin";
    roleEl.style.display = "inline-flex";
  } else if (role === "creator") {
    roleEl.textContent = "creator";
    roleEl.style.display = "inline-flex";
  } else {
    roleEl.textContent = "";
    roleEl.style.display = "none";
  }
}

// ----------------------
// Рендер категорий из config/categories.js
// ----------------------
function renderCategories() {
  const wrap = document.getElementById("ts-categories");
  wrap.innerHTML = "";

  (window.TRUESTAKE_CATEGORIES || []).forEach((cat) => {
    if (!cat.enabled) return;
    const span = document.createElement("button");
    span.className =
      "ts-chip" + (state.category === cat.id ? " ts-chip-active" : "");
    span.textContent = state.dict[cat.i18nKey] || cat.id;
    span.onclick = () => {
      state.category = cat.id;
      renderCategories();
      renderMarkets();
    };
    wrap.appendChild(span);
  });
}

// ----------------------
// Рендер кнопок для creator / admin
// ----------------------
function renderActions() {
  const box = document.getElementById("ts-actions");
  box.innerHTML = "";

  if (!state.user) return;

  const role = state.user.role || "user";

  // Кнопка для creator + admin
  if (role === "creator" || role === "admin") {
    const btnCreate = document.createElement("button");
    btnCreate.className = "ts-btn ts-btn-primary";
    btnCreate.textContent =
      role === "admin"
        ? (state.dict.btn_create_market_admin || "Create market")
        : (state.dict.btn_create_market || "Create market");
    btnCreate.onclick = () => {
      alert("Форма создания рынка появится тут (MVP next step).");
    };
    box.appendChild(btnCreate);
  }

  // Доп. кнопка только для admin
  if (role === "admin") {
    const btnMod = document.createElement("button");
    btnMod.className = "ts-btn ts-btn-outline";
    btnMod.textContent = state.dict.btn_admin_panel || "Admin";
    btnMod.onclick = () => {
      alert("Админ-модерация рынков (activate/resolve) будет здесь.");
    };
    box.appendChild(btnMod);
  }
}

// ----------------------
// Рендер списка рынков
// ----------------------
function renderMarkets() {
  const root = document.getElementById("ts-markets");
  root.innerHTML = "";

  const q = document.getElementById("ts-search").value.trim().toLowerCase();
  const cat = state.category;

  let items = state.markets || [];

  if (cat && cat !== "all") {
    items = items.filter((m) => (m.category || "other") === cat);
  }

  if (q) {
    items = items.filter((m) =>
      (m.question || "").toLowerCase().includes(q)
    );
  }

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "ts-empty";
    empty.textContent =
      state.dict.no_markets || "No markets yet. Creators will add markets soon.";
    root.appendChild(empty);
    return;
  }

  items.forEach((m) => {
    const card = document.createElement("div");
    card.className = "ts-card";

    // Вопрос
    const title = document.createElement("div");
    title.className = "ts-card-title";
    title.textContent = m.question;
    card.appendChild(title);

    // Блок YES / probability / NO
    const stats = document.createElement("div");
    stats.className = "ts-card-stats";

    const btnYes = document.createElement("button");
    btnYes.className = "ts-yes";
    btnYes.textContent = "YES";
    btnYes.onclick = () => {
      alert("MVP: buy YES (логика покупки будет позже).");
    };

    const prob = document.createElement("div");
    prob.className = "ts-prob";
    const p = Math.round((m.prob_yes ?? 50) || 50);
    prob.textContent = p + "%";

    const btnNo = document.createElement("button");
    btnNo.className = "ts-no";
    btnNo.textContent = "NO";
    btnNo.onclick = () => {
      alert("MVP: buy NO (логика покупки будет позже).");
    };

    stats.appendChild(btnYes);
    stats.appendChild(prob);
    stats.appendChild(btnNo);

    card.appendChild(stats);

    // Метрика снизу: объем + статус
    const meta = document.createElement("div");
    meta.className = "ts-card-meta";

    const vol = document.createElement("div");
    const v = m.volume_usd || 0;
    vol.textContent = `$${v.toLocaleString("en-US")} Vol.`;

    const status = document.createElement("div");
    status.textContent = m.status || "pending";

    meta.appendChild(vol);
    meta.appendChild(status);
    card.appendChild(meta);

    root.appendChild(card);
  });
}

// ----------------------
// Переключение табов
// ----------------------
function setupTabs() {
  const tabMarkets = document.getElementById("ts-tab-markets");
  const tabPortfolio = document.getElementById("ts-tab-portfolio");
  const tabMore = document.getElementById("ts-tab-more");

  const sectionMarkets = document.getElementById("ts-markets");
  const sectionPortfolio = document.getElementById("ts-portfolio");

  function setTab(name) {
    state.tab = name;

    tabMarkets.classList.toggle("ts-tab-active", name === "markets");
    tabPortfolio.classList.toggle("ts-tab-active", name === "portfolio");

    if (name === "markets") {
      sectionMarkets.classList.remove("ts-hidden");
      sectionPortfolio.classList.add("ts-hidden");
    } else {
      sectionMarkets.classList.add("ts-hidden");
      sectionPortfolio.classList.remove("ts-hidden");
    }
  }

  tabMarkets.onclick = () => setTab("markets");
  tabPortfolio.onclick = () => setTab("portfolio");
  tabMore.onclick = () => {
    alert("More / Settings / Docs — добавим позже.");
  };

  setTab("markets");
}

// ----------------------
// Загрузка рынков с backend
// ----------------------
async function loadMarkets() {
  try {
    const res = await fetch("https://api.corsarinc.ru/markets", {
      method: "GET",
      credentials: "omit",
    });
    const data = await res.json();
    if (data && data.ok) {
      state.markets = data.markets || [];
      renderMarkets();
    } else {
      console.warn("markets load fail", data);
    }
  } catch (e) {
    console.error("markets error", e);
  }
}

// ----------------------
// Авторизация через Telegram WebApp
// 1. Берём initData
// 2. Отправляем на /auth/telegram
// 3. Сохраняем token + user (+role)
// ----------------------
async function initAuth() {
  const tg = window.Telegram?.WebApp;

  const initData = tg?.initData || "";
  const isInTelegram = !!tg && !!initData;

  // Если не в Telegram (открыли в браузере)
  if (!isInTelegram) {
    state.user = null;
    state.token = null;
    state.lang = "en";
    state.dict = I18N_EN;
    applyI18n();
    renderUserInfo();
    renderActions();
    return;
  }

  try {
    const res = await fetch("https://api.corsarinc.ru/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: initData }),
    });

    const data = await res.json();

    if (!data.ok) {
      console.warn("auth failed", data);
      state.user = null;
      state.token = null;
      state.lang = "en";
      state.dict = I18N_EN;
    } else {
      state.user = data.user || null;
      state.token = data.token || null;

      // язык по Telegram
      const lang = detectLang(state.user);
      state.lang = lang;
      state.dict = lang === "ru" ? I18N_RU : I18N_EN;
    }
  } catch (e) {
    console.error("auth error", e);
    state.user = null;
    state.token = null;
    state.lang = "en";
    state.dict = I18N_EN;
  }

  applyI18n();
  renderUserInfo();
  renderActions();
}

// ----------------------
// Инициализация
// ----------------------
window.addEventListener("DOMContentLoaded", async () => {
  // Подписываем обработчик поиска
  const searchInput = document.getElementById("ts-search");
  searchInput.addEventListener("input", () => renderMarkets());

  await initAuth();      // авторизация + язык + роли
  renderCategories();    // категории
  setupTabs();           // табы
  await loadMarkets();   // рынки
});
