// Список категорий (можно легко выключать/добавлять)
window.TRUESTAKE_CATEGORIES = [
  { id: "all",       i18nKey: "cat_all",      enabled: true },
  { id: "politics",  i18nKey: "cat_politics", enabled: true },
  { id: "economy",   i18nKey: "cat_economy",  enabled: true },
  { id: "crypto",    i18nKey: "cat_crypto",   enabled: true },
  { id: "sports",    i18nKey: "cat_sports",   enabled: true },
  { id: "world",     i18nKey: "cat_world",    enabled: true },
  { id: "other",     i18nKey: "cat_other",    enabled: true },
];

// Если какую-то рубрику нужно выключить:
// меняем enabled: false — фронт её просто не покажет.
