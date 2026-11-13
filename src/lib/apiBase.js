import { DIRECT_API_BASE, buildApiCandidates, normalizeApiBase } from "../../shared/apiEndpoints.js";

// В localStorage пишем только подтверждённо живой маршрут (после ответа сервера).
// Догадку о запасном маршруте не сохраняем: иначе браузер мог навсегда сесть на мёртвый адрес.
const ACTIVE_BASE_KEY = "api_base_active";
const LOCAL_API_BASE = "http://localhost:3000/api";

const builtBase = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);
// Дев-сборка без .env остаётся на локальном сервере: иначе фолбэк уводил бы правки в прод.
export const API_CANDIDATES =
  import.meta.env.DEV && !builtBase ? [LOCAL_API_BASE] : buildApiCandidates(builtBase || DIRECT_API_BASE);

// Одно переключение на загрузку страницы: если не работает и второй маршрут, сеть недоступна целиком,
// и гонять запросы между адресами смысла нет.
let failoversLeft = API_CANDIDATES.length > 1 ? 1 : 0;

function readStoredIndex() {
  let stored = null;

  try {
    stored = localStorage.getItem(ACTIVE_BASE_KEY);
  } catch {
    return 0;
  }

  const index = API_CANDIDATES.indexOf(normalizeApiBase(stored));
  return index === -1 ? 0 : index;
}

let activeIndex = readStoredIndex();

function writeStoredIndex() {
  try {
    localStorage.setItem(ACTIVE_BASE_KEY, API_CANDIDATES[activeIndex]);
  } catch {
    // Приватный режим браузера: выбор останется в силе до перезагрузки страницы.
  }
}

function removeStoredIndex() {
  try {
    localStorage.removeItem(ACTIVE_BASE_KEY);
  } catch {
    // Приватный режим браузера: ничего сохранять не нужно.
  }
}

export function getApiBase() {
  return API_CANDIDATES[activeIndex];
}

// Все маршруты, начиная с текущего: по ним их перебирает health-опрос.
export function apiBasesToProbe() {
  return API_CANDIDATES.map(
    (_, offset) => API_CANDIDATES[(activeIndex + offset) % API_CANDIDATES.length],
  );
}

// Ответ сервера получен: маршрут живой, запоминаем его для следующих загрузок.
export function markApiBaseWorking() {
  writeStoredIndex();
}

export function useApiBase(base) {
  const index = API_CANDIDATES.indexOf(normalizeApiBase(base));
  if (index === -1) return false;

  activeIndex = index;
  writeStoredIndex();
  return true;
}

export function failoverApiBase() {
  if (failoversLeft <= 0) return false;

  failoversLeft -= 1;
  activeIndex = (activeIndex + 1) % API_CANDIDATES.length;
  // Сохранённый выбор больше не подтверждён — следующий старт начнётся с основного маршрута.
  removeStoredIndex();

  return true;
}
