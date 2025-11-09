// ===============================
// Базовый URL API бекенда
// ===============================
const API_BASE = "https://api.corsarinc.ru";

// ===============================
// Словари переводов (en / ru)
// Ключи используем через функцию t(key)
// ===============================
const i18n = {
  en: {
    brand_name: "TrueStake",
    brand_tagline: "on TON · Telegram Mini App",

    cat_all: "All",
    cat_politics: "Politics",
    cat_economy: "Economy",
    cat_crypto: "Crypto",
    cat_sports: "Sports",
    cat_world: "World",
    cat_other: "Other",

    search_placeholder: "Search markets...",
    nav_markets: "Markets",
    nav_portfolio: "Portfolio",
    btn_create: "+ Create",

    no_markets: "No markets yet. Creators/Admins can add events.",

    status_pending: "pending",
    status_active: "active",
    status_resolved: "resolved",

    vol_prefix: "Vol: $",
    yes_label: "YES"
  },
  ru: {
    brand_name: "TrueStake",
    brand_tagline: "на TON · Telegram Mini App",

    cat_all: "Все",
    cat_politics: "Политика",
    cat_economy: "Экономика",
    cat_crypto: "Крипто",
    cat_sports: "Спорт",
    cat_world: "Мир",
    cat_other: "Другое",

    search_placeholder: "Поиск событий...",
    nav_markets: "Рынки",
    nav_portfolio: "Портфель",
    btn_create: "+ Создать",

    no_markets: "Пока нет рынков. Создатель может добавить событие.",

    status_pending: "модерация",
    status_active: "активен",
    status_resolved: "завершен",

    vol_prefix: "Объём: $",
    yes_label: "ДА"
  }
};

// ===============================
// Глобальное состояние Mini App
// ===============================
const state = {
  token: null,         // JWT от бекенда (после /auth/telegram)
  user: null,          // объект пользователя { id, username, role? }
  markets: [],         // список маркетов из /markets
  category: "all",     // выбранная категория (all/politics/...)
  search: "",          // строка поиска
  lang: "en"           // текущий язык интерфейса
};

// ===============================
// Определяем язык пользователя
// Приоритет:
// 1) Telegram WebApp: initDataUnsafe.user.language_code
// 2) navigator.language (если открыто просто в браузере)
// Если не ru — всегда en.
// ===============================
function detectLang() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;

    // 1. Пытаемся вытащить язык из Mini App
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) {
      const lc = String(tg.initDataUnsafe.user.language_code).toLowerCase();
      if (lc.startsWith("ru")) return "ru";
      return "en";
    }

    // 2. Если не Mini App — fallback на язык браузера
    const nav = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    if (nav.startsWith("ru")) return "ru";
    return "en";
  } catch (e) {
    // Любая ошибка → по умолчанию английский
    return "en";
  }
}

// ===============================
// Функция получения строки перевода
// t("cat_all") → "Все"/"All"
// ===============================
function t(key) {
  const dict = i18n[state.lang] || i18n.en;
  return dict[key] || i18n.en[key] || key;
}

// ===============================
// Применяем переводы к элементам:
//  - data-i18n="key" → innerText
//  - data-i18n-placeholder="key" → placeholder
// ===============================
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = t(key);
  });
}

// ===============================
// Отображение информации о пользователе в шапке
// - username или id
// - роль (ADMIN / CREATOR)
// - показываем кнопку "Create" только для creator/admin
// ===============================
function setUserInfo(user, role) {
  const label = document.getElementById("user-label");
  const roleBadge = document.getElementById("role-badge");
  const createBtn = document.getElementById("create-btn");

  if (!user) {
    // Гость (если Mini App открыт в браузере без Telegram)
    label.textContent = "guest";
    if (roleBadge) roleBadge.style.display = "none";
    if (createBtn) createBtn.style.display = "none";
    return;
  }

  // Имя пользователя
  if (user.username) {
    label.textContent = "@" + user.username;
  } else if (user.id) {
    label.textContent = String(user.id);
  } else {
    label.textContent = "user";
  }

  // Роль: admin/creator → показываем
  if (role === "admin" || role === "creator") {
    if (roleBadge) {
      roleBadge.textContent = role.toUpperCase();
      roleBadge.style.display = "inline-block";
    }
    if (createBtn) {
      createBtn.style.display = "inline-block";
    }
  } else {
    if (roleBadge) roleBadge.style.display = "none";
    if (createBtn) createBtn.style.display = "none";
  }
}

// ===============================
// Рендер списка маркетов на основе state.markets
// С учётом фильтра по категории и поиску
// ===============================
function renderMarkets() {
  const list = document.getElementById("markets-list");
  if (!list) return;

  list.innerHTML = "";

  let items = state.markets || [];

  // Фильтр по категории
  if (state.category && state.category !== "all") {
    items = items.filter((m) => {
      const cat = (m.category || "").toLowerCase();
      return cat === state.category;
    });
  }

  // Фильтр по поиску
  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter((m) =>
      (m.question || "").toLowerCase().includes(q)
    );
  }

  // Если нет маркетов — текст-заглушка
  if (!items.length) {
    const div = document.createElement("div");
    div.style.padding = "8px";
    div.style.fontSize = "9px";
    div.style.color = "#6b7280";
    div.textContent = t("no_markets");
    list.appendChild(div);
    return;
  }

  // Рендер карточек
  items.forEach((m) => {
    const card = document.createElement("div");
    card.className = "market-card";

    // Левая часть: вопрос + мета
    const left = document.createElement("div");
    left.className = "market-main";

    const q = document.createElement("div");
    q.className = "market-question";
    q.textContent = m.question || "";
    left.appendChild(q);

    const meta = document.createElement("div");
    meta.className = "market-meta";

    // Категория
    const cat = document.createElement("span");
    cat.className = "meta-pill";
    cat.textContent = (m.category || "global").toUpperCase();
    meta.appendChild(cat);

    // Дата окончания, если есть
    if (m.resolution_ts) {
      const dt = document.createElement("span");
      dt.textContent = "End: " + m.resolution_ts.slice(0, 10);
      meta.appendChild(dt);
    }

    // Статус
    const status = (m.status || "active").toLowerCase();
    const st = document.createElement("span");
    st.className = "status-badge";

    if (status === "pending") {
      st.classList.add("status-pending");
      st.textContent = t("status_pending");
    } else if (status === "resolved") {
      st.textContent = t("status_resolved");
    } else {
      st.textContent = t("status_active");
    }

    meta.appendChild(st);
    left.appendChild(meta);

    // Правая часть: вероятность YES + объём
    const right = document.createElement("div");
    right.className = "market-right";

    const yesLabel = document.createElement("div");
    yesLabel.className = "yes-label";
    yesLabel.textContent = t("yes_label");
    right.appendChild(yesLabel);

    const yesVal = document.createElement("div");
    yesVal.className = "yes-value";
    const p = typeof m.prob_yes === "number" ? m.prob_yes : m.probability_yes;
    yesVal.textContent = (p != null ? p : 50).toFixed(0) + "%";
    right.appendChild(yesVal);

    const vol = document.createElement("div");
    vol.className = "vol";
    vol.textContent = t("vol_prefix") + (m.volume_usd || 0).toFixed(0);
    right.appendChild(vol);

    card.appendChild(left);
    card.appendChild(right);

    list.appendChild(card);
  });
}

// ===============================
// Загрузка маркетов с бекенда
// ===============================
async function loadMarkets() {
  try {
    const res = await fetch(API_BASE + "/markets?status=active");
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.markets)) {
      state.markets = data.markets;
      renderMarkets();
    } else {
      console.log("markets error", data);
    }
  } catch (e) {
    console.log("markets fetch failed", e);
  }
}

// ===============================
// Авторизация через Telegram WebApp
// 1) Берём initData из Telegram.WebApp
// 2) Шлём на /auth/telegram
// 3) Сохраняем token + user
// 4) Дотягиваем роль через /auth/me (если бекенд уже отдаёт)
// ===============================
async function authViaTelegram() {
  const tg = window.Telegram && window.Telegram.WebApp;

  // Определяем язык до запросов
  state.lang = detectLang();
  applyTranslations();

  // Если не Mini App (открыли ссылку в браузере) — без авторизации
  if (!tg || !tg.initData) {
    setUserInfo(null, null);
    await loadMarkets();
    return;
  }

  try {
    const res = await fetch(API_BASE + "/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: tg.initData })
    });

    const data = await res.json();

    if (data.ok && data.token && data.user) {
      state.token = data.token;
      state.user = data.user;

      // Дополнительно дергаем /auth/me, чтобы получить роль
      try {
        const meRes = await fetch(API_BASE + "/auth/me", {
          headers: { Authorization: "Bearer " + state.token }
        });
        const me = await meRes.json();
        if (me.ok && me.user) {
          state.user = me.user; // ожидаем, что тут уже есть role
        }
      } catch (e) {
        console.log("auth/me failed", e);
      }

      const role = state.user.role || null;
      setUserInfo(state.user, role);
    } else {
      // initData невалидный или ошибка — считаем гостем
      console.log("auth failed", data);
      setUserInfo(null, null);
    }
  } catch (e) {
    console.log("auth error", e);
    setUserInfo(null, null);
  }

  await loadMarkets();
}

// ===============================
// Настройка UI: клики по категориям, поиск,
// кнопка фильтра, кнопка создания события
// ===============================
function setupUI() {
  // Переключение категорий
  const cats = document.querySelectorAll(".cat-pill");
  cats.forEach((el) => {
    el.addEventListener("click", () => {
      cats.forEach((c) => c.classList.remove("active"));
      el.classList.add("active");
      state.category = el.dataset.cat || "all";
      renderMarkets();
    });
  });

  // Поиск по рынкам
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      renderMarkets();
    });
  }

  // Кнопка фильтров (пока просто заглушка)
  const filterBtn = document.getElementById("filter-btn");
  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      const tg = window.Telegram && window.Telegram.WebApp;
      const msg_en = "Filters (date, volume, category) will be added.";
      const msg_ru = "Фильтры по дате, объёму и категории появятся позже.";
      const msg = state.lang === "ru" ? msg_ru : msg_en;
      if (tg && tg.showAlert) tg.showAlert(msg);
      else console.log(msg);
    });
  }

  // Кнопка создания события (видна только creator/admin)
  const createBtn = document.getElementById("create-btn");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      const tg = window.Telegram && window.Telegram.WebApp;
      const msg_en = "Creator panel for adding events will be here.";
      const msg_ru = "Здесь будет панель создания событий для креаторов.";
      const msg = state.lang === "ru" ? msg_ru : msg_en;
      if (tg && tg.showAlert) tg.showAlert(msg);
      else console.log(msg);
    });
  }
}

// ===============================
// Точка входа Mini App
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  // Настройки Telegram UI (темная тема, фуллскрин)
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      tg.expand();
      tg.setBackgroundColor("#050816");
      tg.setHeaderColor("#050816");
    }
  } catch (e) {
    // игнорируем, если не в Telegram
  }

  setupUI();
  authViaTelegram();
});
