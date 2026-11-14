// Адрес API, к которому обращается браузер. Прямой адрес Render известен заранее и остаётся
// значением по умолчанию для сборок без прокси.
export const DIRECT_API_BASE = "https://b2b-market-api.onrender.com/api";

export function normalizeApiBase(value) {
  return String(value || "").replace(/\/+$/, "");
}

// Один маршрут на сборку. Запасной адрес напрямую к Render добавлять нельзя: провайдеры в России
// не отбивают такой запрос ошибкой сети, а глушат соединение, и оно висит полный таймаут.
// Этот маршрут превращался в ловушку: попав на него, сайт «не грузил», хотя прокси отвечал за полсекунды.
export function buildApiCandidates(primaryBase) {
  const primary = normalizeApiBase(primaryBase) || DIRECT_API_BASE;
  return [primary];
}
