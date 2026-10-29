import { useSyncExternalStore } from "react";
import { API_BASE } from "./apiBase";

const HEALTH_POLL_INTERVAL_MS = 3000;
const HEALTH_TIMEOUT_MS = 5000;
export const CONNECTION_RESTORED_EVENT = "connection:restored";

const listeners = new Set();
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

function setState(nextState) {
  if (state === nextState) return;
  const previousState = state;
  state = nextState;
  emit();
  syncPolling();

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
    const response = await fetch(`${API_BASE}/health`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) return;
    const data = await response.json().catch(() => null);
    if (data?.ready) setState("online");
  } catch {
    // Состояние не меняем: следующий тик опроса повторит проверку.
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

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    setState("reconnecting");
    void checkHealth();
  });

  window.addEventListener("offline", () => {
    setState("offline");
  });
}
