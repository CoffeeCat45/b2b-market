import { useSyncExternalStore } from "react";
import { API_CANDIDATES, apiBasesToProbe, getApiBase, useApiBase } from "./apiBase";

const HEALTH_POLL_INTERVAL_MS = 3000;
const HEALTH_TIMEOUT_MS = 5000;
const DB_WAKE_WAIT_MS = 90000;
const KEEPALIVE_INTERVAL_MS = 45000;
export const CONNECTION_RESTORED_EVENT = "connection:restored";

const listeners = new Set();
const onlineWaiters = new Set();
let state = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online";
let pollTimer = null;
let pollInFlight = false;
let keepaliveTimer = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function syncPolling() {
  if (state !== "waking" && state !== "reconnecting") {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  } else if (!pollTimer) {
    pollTimer = window.setInterval(() => {
      void checkHealth();
    }, HEALTH_POLL_INTERVAL_MS);
  }

  // Пока вкладка открыта, редкий health-запрос не даёт Render уснуть и держит соединение с прокси тёплым.
  if (state === "online") {
    if (!keepaliveTimer) {
      keepaliveTimer = window.setInterval(() => {
        void probeHealth(getApiBase());
      }, KEEPALIVE_INTERVAL_MS);
    }
  } else if (keepaliveTimer) {
    window.clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

function resolveOnlineWaiters() {
  for (const waiter of onlineWaiters) {
    window.clearTimeout(waiter.timer);
    waiter.resolve(true);
  }
  onlineWaiters.clear();
}

function setState(nextState) {
  if (state === nextState) return;
  const previousState = state;
  state = nextState;
  emit();
  syncPolling();

  if (nextState === "online") {
    resolveOnlineWaiters();
  }

  if (nextState === "online" && previousState !== "online") {
    window.dispatchEvent(new Event(CONNECTION_RESTORED_EVENT));
  }
}

async function probeHealth(base) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/health`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && typeof data === "object" ? data : null;
  } catch {
    // Запрос не дошёл: этот маршрут в данной сети не работает, пробуем следующий.
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// Опрос перебирает все маршруты API, начиная с текущего, и делает рабочим тот, что ответил.
// Иначе заблокированный провайдером адрес (Render напрямую) оставал бы рабочим до бесконечности:
// такой запрос не отбивается ошибкой сети, а висит до таймаута.
async function checkHealth() {
  if (pollInFlight) return;
  pollInFlight = true;

  try {
    let aliveBase = null;

    for (const base of apiBasesToProbe()) {
      const data = await probeHealth(base);
      if (!data) continue;

      aliveBase = aliveBase || base;

      if (data.ready) {
        useApiBase(base);
        setState("online");
        return;
      }
    }

    if (aliveBase) useApiBase(aliveBase);
  } finally {
    pollInFlight = false;
  }
}

export function getConnectionSnapshot() {
  return state;
}

export function subscribeConnection(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConnectionState() {
  return useSyncExternalStore(subscribeConnection, getConnectionSnapshot, getConnectionSnapshot);
}

export function reportDbWaking() {
  if (state === "offline") return;
  setState("waking");
}

export function reportNetworkFailure() {
  setState(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "reconnecting");
}

export function reportSuccess() {
  setState("online");
}

// Все запросы одного пробуждения ждут один health-опрос вместо собственных цепочек повторов.
export function waitForOnline(timeoutMs = DB_WAKE_WAIT_MS) {
  if (state === "online") return Promise.resolve(true);

  return new Promise((resolve) => {
    const waiter = {
      resolve,
      timer: window.setTimeout(() => {
        onlineWaiters.delete(waiter);
        resolve(false);
      }, timeoutMs),
    };

    onlineWaiters.add(waiter);
    syncPolling();
  });
}

if (typeof window !== "undefined") {
  syncPolling();
  // Сохранённый в прошлом запасной маршрут мог устареть вместе с сетью: проверяем его сразу,
  // иначе первая загрузка платит полным таймаутом запроса, прежде чем опрос вообще начнётся.
  if (getApiBase() !== API_CANDIDATES[0]) {
    setState("reconnecting");
    void checkHealth();
  }

  window.addEventListener("online", () => {
    setState("reconnecting");
    void checkHealth();
  });

  window.addEventListener("offline", () => {
    setState("offline");
  });
}
