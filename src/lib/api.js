// Общий helper для API держит auth-заголовки, timeout и форматирование ошибок бэкенда в одном месте.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api").replace(/\/$/, "");
const API_TIMEOUT_MS = 20000;
const RETRY_DELAY_MS = 700;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function apiFetch(path, options = {}) {
  const { retries = 0, skipAuth = false, timeoutMs = API_TIMEOUT_MS, ...fetchOptions } = options;
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
      const message = String(data.message || "Ошибка запроса.");
      const details = String(data.error || "").trim();
      const requestError = new Error(details ? `${message} ${details}` : message);
      requestError.status = response.status;
      requestError.data = data;
      throw requestError;
    }

    return data;
  } catch (error) {
    if (retries > 0 && (error?.name === "AbortError" || error instanceof TypeError)) {
      window.clearTimeout(timeoutId);
      await wait(RETRY_DELAY_MS);
      return apiFetch(path, { ...fetchOptions, skipAuth, timeoutMs, retries: retries - 1 });
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

export function apiPlainPost(path, payload, options = {}) {
  const token = localStorage.getItem("auth_token");

  return apiFetch(path, {
    method: "POST",
    skipAuth: true,
    retries: options.retries || 0,
    timeoutMs: options.timeoutMs || API_TIMEOUT_MS,
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ ...payload, authToken: token }),
  });
}
