const API_BASE = "https://api.corsarinc.ru";

const i18n = {
  en: {
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

const state = {
  token: null,
  user: null,
  markets: [],
  category: "all",
  search: "",
  lang: "en"
};

function detectLang() {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    const lc =
      (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) ||
      navigator.language ||
      "en";
    if (lc.toLowerCase().startsWith("ru")) return "ru";
    return "en";
  } catch (e) {
    return "en";
  }
}

function t(key) {
  const dict = i18n[state.lang] || i18n.en;
  return dict[key] || i18n.en[key] || key;
}

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    el.placeholder = t(key);
  });
}

function setUserInfo(user, role) {
  const label = document.getElementById("user-label");
  const roleBadge = document.getElementById("role-badge");
  const createBtn = document.getElementById("create-btn");

  if (!user) {
    label.textContent = "guest";
    roleBadge.style.display = "none";
    createBtn.style.display = "none";
    return;
  }

  label.textContent = user.username ? "@" + user.username : (user.id || "user");

  if (role === "admin" || role === "creator") {
    roleBadge.textContent = role.toUpperCase();
    roleBadge.style.display = "inline-block";
    createBtn.style.display = "inline-block";
  } else {
    roleBadge.style.display = "none";
    createBtn.style.display = "none";
  }
}

function renderMarkets() {
  const list = document.getElementById("markets-list");
  list.innerHTML = "";

  let items = state.markets || [];

  if (state.category && state.category !== "all") {
    items = items.filter(
      m => (m.category || "").toLowerCase() === state.category
    );
  }

  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter(m => (m.question || "").toLowerCase().includes(q));
  }

  if (!items.length) {
    const div = document.createElement("div");
    div.style.padding = "8px";
    div.style.fontSize = "9px";
    div.style.color = "#6b7280";
    div.textContent = t("no_markets");
    list.appendChild(div);
    return;
  }

  items.forEach(m => {
    const card = document.createElement("div");
    card.className = "market-card";

    const left = document.createElement("div");
    left.className = "market-main";

    const q = document.createElement("div");
    q.className = "market-question";
    q.textContent = m.question || "";
    left.appendChild(q);

    const meta = document.createElement("div");
    meta.className = "market-meta";

    const cat = document.createElement("span");
    cat.className = "meta-pill";
    cat.textContent = (m.category || "global").toUpperCase();
    meta.appendChild(cat);

    if (m.resolution_ts) {
      const dt = document.createElement("span");
      dt.textContent = "End: " + m.resolution_ts.slice(0, 10);
      meta.appendChild(dt);
    }

    const status = (m.status || "active").toLowerCase();
    const st = document.createElement("span");
    st.className = "status-badge";
    if (status === "pending") st.classList.add("status-pending");

    if (status === "pending") st.textContent = t("status_pending");
    else if (status === "resolved") st.textContent = t("status_resolved");
    else st.textContent = t("status_active");

    meta.appendChild(st);
    left.appendChild(meta);

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

async function loadMarkets() {
  try {
    const r = await fetch(API_BASE + "/markets?status=active");
    const data = await r.json();
    if (data && data.ok) {
      state.markets = data.markets || [];
      renderMarkets();
    } else {
      console.log("markets error", data);
    }
  } catch (e) {
    console.log("markets fetch failed", e);
  }
}

async function authViaTelegram() {
  const tg = window.Telegram && window.Telegram.WebApp;

  // определяем язык до запросов
  state.lang = detectLang();
  applyTranslations();

  if (!tg || !tg.initData) {
    // открыто в браузере, без Mini App
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

      // Тянем роль из /auth/me, если backend её уже отдаёт
      try {
        const meRes = await fetch(API_BASE + "/auth/me", {
          headers: { Authorization: "Bearer " + state.token }
        });
        const me = await meRes.json();
        if (me.ok && me.user) {
          state.user = me.user;
        }
      } catch (e) {
        console.log("auth/me failed", e);
      }

      const role = state.user.role || null;
      setUserInfo(state.user, role);
    } else {
      setUserInfo(null, null);
    }
  } catch (e) {
    console.log("auth error", e);
    setUserInfo(null, null);
  }

  await loadMarkets();
}

function setupUI() {
  const cats = document.querySelectorAll(".cat-pill");
  cats.forEach(el => {
    el.addEventListener("click", () => {
      cats.forEach(c => c.classList.remove("active"));
      el.classList.add("active");
      state.category = el.dataset.cat || "all";
      renderMarkets();
    });
  });

  const searchInput = document.getElementById("search-input");
  searchInput.addEventListener("input", e => {
    state.search = e.target.value.trim();
    renderMarkets();
  });

  const filterBtn = document.getElementById("filter-btn");
  filterBtn.addEventListener("click", () => {
    const tg = window.Telegram && window.Telegram.WebApp;
    const text_en = "Filters: by date, volume, category — will be added.";
    const text_ru = "Фильтры (дата, объём, категория) появятся позже.";
    const msg = state.lang === "ru" ? text_ru : text_en;
    if (tg && tg.showAlert) tg.showAlert(msg);
    else console.log(msg);
  });

  const createBtn = document.getElementById("create-btn");
  createBtn.addEventListener("click", () => {
    const tg = window.Telegram && window.Telegram.WebApp;
    const msg_en = "Creator panel for adding events will be here.";
    const msg_ru = "Здесь будет форма создания событий для создателей.";
    const msg = state.lang === "ru" ? msg_ru : msg_en;
    if (tg && tg.showAlert) tg.showAlert(msg);
    else console.log(msg);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg) {
      tg.expand();
      tg.setBackgroundColor("#050816");
      tg.setHeaderColor("#050816");
    }
  } catch (e) {}
  setupUI();
  authViaTelegram();
});
