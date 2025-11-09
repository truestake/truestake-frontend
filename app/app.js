// ===============================
// Глобальное состояние
// ===============================
const state = {
  lang: "en",          // язык интерфейса
  dict: {},            // ссылки на текущий словарь
  token: null,         // JWT
  user: null,          // { id, username, role }
  markets: [],         // список рынков
  category: "all",     // активная категория
  search: "",          // строка поиска
  wallet: {
    connected: false,
    address: null,
    balance: null,     // сюда позже подтянем с бэка/TON
  },
};

// ===============================
// I18N helpers
// ===============================
function initLang() {
  const i18n = window.TRUESTAKE_I18N;
  state.lang = i18n.getLangCode();
  state.dict = i18n.getDict(state.lang);
}

function t(key) {
  return state.dict[key] || key;
}

function applyTranslationsStatic() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.placeholder = t(key);
    });
}

// ===============================
// Категории
// ===============================
function renderCategories() {
  const bar = document.getElementById("categories");
  if (!bar || !window.TRUESTAKE_CATEGORIES) return;

  bar.innerHTML = "";

  window.TRUESTAKE_CATEGORIES
    .filter((c) => c.enabled)
    .forEach((c, idx) => {
      const span = document.createElement("span");
      span.className = "cat-pill";
      span.dataset.cat = c.id;
      span.textContent = t(c.i18nKey);
      if (idx === 0) {
        span.classList.add("active");
        state.category = c.id;
      }
      span.addEventListener("click", () => {
        document
          .querySelectorAll(".cat-pill")
          .forEach((el) => el.classList.remove("active"));
        span.classList.add("active");
        state.category = c.id;
        renderMarkets();
      });
      bar.appendChild(span);
    });
}

// ===============================
// Пользователь и роль
// ===============================
function setUserInfo() {
  const el = document.getElementById("user-label");
  const roleEl = document.getElementById("role-badge");
  const createBtn = document.getElementById("create-btn");

  if (!el) return;

  if (!state.user) {
    el.textContent = "guest";
    if (roleEl) roleEl.style.display = "none";
    if (createBtn) createBtn.style.display = "none";
    return;
  }

  el.textContent = state.user.username
    ? "@" + state.user.username
    : String(state.user.id || "user");

  const role = state.user.role || "user";

  if (role === "admin" || role === "creator") {
    if (roleEl) {
      roleEl.textContent = role.toUpperCase();
      roleEl.style.display = "inline-block";
    }
    if (createBtn) createBtn.style.display = "inline-block";
  } else {
    if (roleEl) roleEl.style.display = "none";
    if (createBtn) createBtn.style.display = "none";
  }
}

// ===============================
// Кошелёк (UI-заглушка, логика TON будет позже)
// ===============================
function renderWallet() {
  const box = document.getElementById("wallet-box");
  if (!box) return;

  box.innerHTML = "";

  const title = document.createElement("div");
  title.className = "wallet-title";
  title.textContent = "TON / USDT";

  const status = document.createElement("div");
  status.className = "wallet-status";

  if (!state.wallet.connected) {
    status.textContent = t("wallet_connect");
  } else {
    status.textContent =
      t("wallet_connected") +
      (state.wallet.address ? ` (${state.wallet.address.slice(0, 8)}...)` : "");
  }

  const btn = document.createElement("button");
  btn.className = "wallet-btn";
  btn.textContent = state.wallet.connected
    ? t("wallet_balance")
    : t("wallet_connect");

  btn.addEventListener("click", () => {
    // Здесь позже интегрируем TonConnect SDK.
    // Пока заглушка.
    const tg = window.Telegram && window.Telegram.WebApp;
    const msg =
      state.lang === "ru"
        ? "Подключение TON-кошелька будет реализовано через TonConnect."
        : "TON wallet connection will be implemented via TonConnect.";
    if (tg?.showAlert) tg.showAlert(msg);
    else alert(msg);
  });

  box.appendChild(title);
  box.appendChild(status);
  box.appendChild(btn);
}

// ===============================
// Рендер маркетов
// ===============================
function renderMarkets() {
  const list = document.getElementById("markets-list");
  if (!list) return;

  list.innerHTML = "";

  let items = state.markets || [];

  if (state.category && state.category !== "all") {
    items = items.filter((m) => (m.category || "") === state.category);
  }

  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter((m) =>
      (m.question || "").toLowerCase().includes(q)
    );
  }

  if (!items.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = t("no_markets");
    list.appendChild(div);
    return;
  }

  items.forEach((m) => {
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
      dt.textContent = m.resolution_ts.slice(0, 10);
      meta.appendChild(dt);
    }

    const st = document.createElement("span");
    st.className = "status-badge";
    const status = (m.status || "active").toLowerCase();
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
    const p = m.prob_yes ?? m.probability_yes ?? 50;
    yesVal.textContent = p.toFixed(0) + "%";
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
// Загрузка рынков с API
// ===============================
async function loadMarkets() {
  try {
    const res = await fetch("https://api.corsarinc.ru/markets?status=active");
    const data = await res.json();
    if (data.ok && Array.isArray(data.markets)) {
      state.markets = data.markets;
      renderMarkets();
    }
  } catch (e) {
    console.log("loadMarkets error", e);
  }
}

// ===============================
// Авторизация через Telegram WebApp
// ===============================
async function authTelegram() {
  const tg = window.Telegram?.WebApp;

  if (!tg || !tg.initData) {
    // Открыто в браузере — без авторизации
    state.user = null;
    setUserInfo();
    return;
  }

  try {
    const res = await fetch("https://api.corsarinc.ru/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: tg.initData }),
    });
    const data = await res.json();

    if (data.ok && data.token && data.user) {
      state.token = data.token;
      state.user = data.user;

      // Дотягиваем роль
      try {
        const meRes = await fetch("https://api.corsarinc.ru/auth/me", {
          headers: { Authorization: "Bearer " + state.token },
        });
        const me = await meRes.json();
        if (me.ok && me.user) state.user = me.user;
      } catch (e) {
        console.log("auth/me error", e);
      }
    }
  } catch (e) {
    console.log("authTelegram error", e);
  }

  setUserInfo();
}

// ===============================
// UI события
// ===============================
function setupUI() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      renderMarkets();
    });
  }

  const createBtn = document.getElementById("create-btn");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      const tg = window.Telegram?.WebApp;
      const msg =
        state.lang === "ru"
          ? "Здесь будет интерфейс создания события для креаторов."
          : "Creator event creation UI will appear here.";
      if (tg?.showAlert) tg.showAlert(msg);
      else alert(msg);
    });
  }
}

// ===============================
// Entry point
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand();
      tg.setBackgroundColor("#050816");
      tg.setHeaderColor("#050816");
    }
  } catch (e) {}

  initLang();
  applyTranslationsStatic();
  renderCategories();
  setupUI();
  renderWallet();

  await authTelegram();
  await loadMarkets();
});
