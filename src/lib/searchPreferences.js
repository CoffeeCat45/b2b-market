export const SEARCH_PREFERENCES_KEY = "b2b.searchPreferences.v1";
export const SEARCH_PREFERENCES_EVENT = "search-preferences:changed";

export const SEARCH_MODES = [
  {
    value: "smart",
    label: "Умный поиск без модели",
    hint: "Синонимы, опечатки и сортировка по релевантности. Ничего не скачивается.",
  },
  {
    value: "neural",
    label: "Нейросетевой поиск (локально)",
    hint: "Модель работает в браузере. Первый запуск скачает её и сохранит в кэше устройства.",
  },
];

export const SEARCH_MODELS = [
  {
    value: "compact",
    label: "Компактная — быстрее",
    hint: "ruBERT-tiny2, около 30 МБ. Лучше для телефона и слабого интернета.",
  },
  {
    value: "powerful",
    label: "Мощная — точнее",
    hint: "multilingual-e5-small, около 120 МБ. Точнее, но первый запуск дольше.",
  },
];

export const DEFAULT_SEARCH_PREFERENCES = {
  mode: "smart",
  model: "compact",
};

const MODE_VALUES = new Set(SEARCH_MODES.map((option) => option.value));
const MODEL_VALUES = new Set(SEARCH_MODELS.map((option) => option.value));

export function normalizeSearchPreferences(value) {
  return {
    mode: MODE_VALUES.has(value?.mode) ? value.mode : DEFAULT_SEARCH_PREFERENCES.mode,
    model: MODEL_VALUES.has(value?.model) ? value.model : DEFAULT_SEARCH_PREFERENCES.model,
  };
}

export function getSearchPreferences() {
  try {
    const raw = localStorage.getItem(SEARCH_PREFERENCES_KEY);
    if (!raw) return DEFAULT_SEARCH_PREFERENCES;
    return normalizeSearchPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_SEARCH_PREFERENCES;
  }
}

export function saveSearchPreferences(value) {
  const preferences = normalizeSearchPreferences(value);

  try {
    localStorage.setItem(SEARCH_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Браузер может запретить запись, тогда настройка останется только в памяти вкладки.
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SEARCH_PREFERENCES_EVENT, { detail: preferences }));
  }

  return preferences;
}
