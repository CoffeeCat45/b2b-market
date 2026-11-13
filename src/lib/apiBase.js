import { DIRECT_API_BASE, buildApiCandidates, normalizeApiBase } from "../../shared/apiEndpoints.js";

// Выбор живёт в localStorage: у одного и того же браузера в разной сети работают разные маршруты,
// а профиль компании к такому выбору не относится.
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

export function getApiBase() {
  return API_CANDIDATES[activeIndex];
}

export function failoverApiBase() {
  if (failoversLeft <= 0) return false;

  failoversLeft -= 1;
  activeIndex = (activeIndex + 1) % API_CANDIDATES.length;

  try {
    localStorage.setItem(ACTIVE_BASE_KEY, API_CANDIDATES[activeIndex]);
  } catch {
    // Приватный режим браузера: переключение останется в силе до перезагрузки страницы.
  }

  return true;
}
