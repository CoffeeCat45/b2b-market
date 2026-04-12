// Общий helper для API держит auth-заголовки, timeout и форматирование ошибок бэкенда в одном месте.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api").replace(/\/$/, "");
const API_TIMEOUT_MS = 20000;

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("auth_token");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = String(data.message || "\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u043f\u0440\u043e\u0441\u0430.");
      const details = String(data.error || "").trim();
      throw new Error(details ? `${message} ${details}` : message);
    }

    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("\u0421\u0435\u0440\u0432\u0435\u0440 \u0434\u043e\u043b\u0433\u043e \u043d\u0435 \u043e\u0442\u0432\u0435\u0447\u0430\u0435\u0442. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0447\u0435\u0440\u0435\u0437 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0441\u0435\u043a\u0443\u043d\u0434.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
