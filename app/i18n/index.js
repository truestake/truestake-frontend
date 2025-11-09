// Централизованный доступ к словарям

window.TRUESTAKE_I18N = {
  getLangCode() {
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg?.initDataUnsafe?.user?.language_code) {
        const lc = String(tg.initDataUnsafe.user.language_code).toLowerCase();
        if (lc.startsWith("ru")) return "ru";
      }
      const nav = (navigator.language || "en").toLowerCase();
      if (nav.startsWith("ru")) return "ru";
    } catch (e) {}
    return "en";
  },

  getDict(lang) {
    if (lang === "ru" && window.I18N_RU) return window.I18N_RU;
    return window.I18N_EN || {};
  },
};
