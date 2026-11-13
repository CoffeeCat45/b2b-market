import { useSyncExternalStore } from "react";
import { failoverApiBase, getApiBase } from "./apiBase";

const HEALTH_POLL_INTERVAL_MS = 3000;
const HEALTH_TIMEOUT_MS = 5000;
const DB_WAKE_WAIT_MS = 90000;
export const CONNECTION_RESTORED_EVENT = "connection:restored";

const listeners = new Set();
const onlineWaiters = new Set();
let state = typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online";
let pollTimer = null;
let pollInFlight = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function syncPolling() {
  if (state !== "waking" && state !== "reconnecting") {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    return;
  }

  if (!pollTimer) {
    pollTimer = window.setInterval(() => {
      void checkHealth();
    }, HEALTH_POLL_INTERVAL_MS);
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

async function checkHealth() {
  if (pollInFlight) return;
  pollInFlight = true;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBase()}/health`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    if (data?.ready) setState("online");
  } catch (error) {
    // Запрос не дошёл — возможно, маршрут API в этой сети не работает, пробуем запасной.
    if (error instanceof TypeError) failoverApiBase();
  } finally {
    window.clearTimeout(timeoutId);
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
  window.addEventListener("online", () => {
    setState("reconnecting");
    void checkHealth();
  });

  window.addEventListener("offline", () => {
    setState("offline");
  });
}
