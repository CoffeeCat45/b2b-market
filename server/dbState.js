// Отдельный модуль без импорта db.js: состояние читают и pool-обработчики, и маршруты.
const startedAt = new Date().toISOString();

let phase = "starting";
let schemaReady = false;
let lastErrorAt = null;

export function markWaking() {
  phase = "waking";
}

export function markReady() {
  phase = "ready";
}

export function markDegraded() {
  phase = "degraded";
  lastErrorAt = new Date().toISOString();
}

export function markSchemaReady(value = true) {
  schemaReady = Boolean(value);
}

export function isReady() {
  return phase === "ready";
}

export function getSnapshot() {
  return {
    phase,
    ready: phase === "ready",
    schemaReady,
    startedAt,
    lastErrorAt,
  };
}
