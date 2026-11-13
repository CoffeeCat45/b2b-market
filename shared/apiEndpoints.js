// Прямой адрес API известен заранее: на него клиент переключается, когда основной маршрут
// не проходит в сети пользователя (провайдер режет прокси — или, наоборот, локальный туннель).
export const DIRECT_API_BASE = "https://b2b-market-api.onrender.com/api";

export function normalizeApiBase(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function buildApiCandidates(primaryBase) {
  const candidates = [normalizeApiBase(primaryBase), normalizeApiBase(DIRECT_API_BASE)];
  return candidates.filter((base, index) => base && candidates.indexOf(base) === index);
}
