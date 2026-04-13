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
  const headers = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers || {}),
  };

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
      const message = String(data.message || "\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0440\u043e\u0441\u0430.");
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
      throw new Error("\u0421\u0435\u0440\u0432\u0435\u0440 \u0434\u043e\u043b\u0433\u043e \u043d\u0435 \u043e\u0442\u0432\u0435\u0447\u0430\u0435\u0442. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0447\u0435\u0440\u0435\u0437 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0441\u0435\u043a\u0443\u043d\u0434.");
    }

    if (error instanceof TypeError) {
      throw new Error("\u0421\u0435\u0440\u0432\u0435\u0440 \u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0438\u043b\u0438 \u043d\u0435 \u043f\u0440\u043e\u0448\u0451\u043b CORS-\u0437\u0430\u043f\u0440\u043e\u0441. \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0443 \u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.");
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
