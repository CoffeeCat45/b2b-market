import { API_BASE } from "./apiBase";
import { reportDbWaking, reportNetworkFailure, reportSuccess } from "./connection";

// Общий helper для API держит auth-заголовки, timeout и форматирование ошибок бэкенда в одном месте.
const API_TIMEOUT_MS = 20000;
const DEFAULT_READ_RETRIES = 3;
const RETRY_DELAY_MS = 700;
const DB_WAKING_RETRY_DELAYS_MS = [2000, 3000, 5000, 8000, 10000, 10000, 10000, 10000];
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const SESSION_EXEMPT_PATHS = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/me",
  "/auth/verify-password",
  "/auth/password",
  "/auth/company",
  "/auth/profile",
]);

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function expireSession() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user_cache");
  window.dispatchEvent(new Event("auth:expired"));
}

function isReadMethod(method) {
  return method === "GET" || method === "HEAD";
}

export async function apiFetch(path, options = {}) {
  const {
    retries,
    retryOnDbWaking,
    trackConnection = true,
    skipAuth = false,
    timeoutMs = API_TIMEOUT_MS,
    dbWakingAttempt = 0,
    ...fetchOptions
  } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const readRequest = isReadMethod(method);
  const remainingRetries = retries === undefined ? (readRequest ? DEFAULT_READ_RETRIES : 0) : retries;
  // Ждать пробуждения БД имеет смысл только для чтений; мутации повторяются лишь явно.
  const shouldWaitForDb = retryOnDbWaking === undefined ? readRequest : retryOnDbWaking;
  const token = localStorage.getItem("auth_token");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers = { ...(fetchOptions.headers || {}) };
  const hasBody = fetchOptions.body !== undefined && fetchOptions.body !== null;
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === "content-type");

  if (hasBody && !hasContentType) {
    headers["Content-Type"] = "application/json";
  }

  if (token && !skipAuth) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal || controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const requestError = new Error(String(data.message || "Ошибка запроса."));
      requestError.status = response.status;
      requestError.code = data.code || null;
      requestError.data = data;
      requestError.fields = data.fields && typeof data.fields === "object" ? data.fields : null;

      if (response.status === 401 && token && !skipAuth && !SESSION_EXEMPT_PATHS.has(path.split("?")[0])) {
        expireSession();
      }

      const dbWaking = data.code === "DB_WAKING";

      if (trackConnection && dbWaking) {
        reportDbWaking();
      }

      if (dbWaking && shouldWaitForDb && dbWakingAttempt < DB_WAKING_RETRY_DELAYS_MS.length) {
        const retryAfterMs = Number(data.retryAfterMs);
        const delayMs =
          Number.isFinite(retryAfterMs) && retryAfterMs > 0
            ? Math.min(retryAfterMs, 10000)
            : DB_WAKING_RETRY_DELAYS_MS[dbWakingAttempt];
        window.clearTimeout(timeoutId);
        await wait(delayMs);
        return apiFetch(path, { ...options, dbWakingAttempt: dbWakingAttempt + 1 });
      }

      // DB_WAKING без ожидания не повторяем как обычную 503: это сигнал готовности БД, а не сбой шлюза.
      if (readRequest && !dbWaking && remainingRetries > 0 && RETRYABLE_STATUS.has(response.status)) {
        window.clearTimeout(timeoutId);
        await wait(RETRY_DELAY_MS);
        return apiFetch(path, { ...options, retries: remainingRetries - 1 });
      }

      throw requestError;
    }

    if (trackConnection) {
      reportSuccess();
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError" || error instanceof TypeError) {
      if (trackConnection) {
        reportNetworkFailure();
      }

      if (remainingRetries > 0) {
        window.clearTimeout(timeoutId);
        await wait(RETRY_DELAY_MS);
        return apiFetch(path, { ...options, retries: remainingRetries - 1 });
      }
    }

    if (error?.name === "AbortError") {
      throw new Error("Сервер долго не отвечает. Попробуйте ещё раз через несколько секунд.");
    }

    if (error instanceof TypeError) {
      throw new Error("Сервер временно недоступен или не прошёл CORS-запрос. Обновите страницу и повторите ещё раз.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
