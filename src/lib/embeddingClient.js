import { getEmbeddingModel } from "../../shared/embeddings";

const QUERY_CACHE_LIMIT = 40;
const EMBEDDING_TIMEOUT_MS = 10 * 60 * 1000;
const IDLE_STATUS = Object.freeze({ stage: "idle", progress: 0, message: "" });
// transformers.js хранит скачанные файлы в Cache Storage под этим именем.
const TRANSFORMERS_CACHE_NAME = "transformers-cache";

const queryCache = new Map();
const statusByModel = new Map();
const statusListeners = new Set();
const pendingRequests = new Map();

let worker = null;
let nextRequestId = 1;

export function getEmbeddingModelStatus(modelId) {
  return statusByModel.get(modelId) || IDLE_STATUS;
}

export async function getEmbeddingModelPresence(modelId) {
  const model = getEmbeddingModel(modelId);
  if (!model) return "unknown";

  const current = getEmbeddingModelStatus(modelId);
  if (current.stage === "ready") return "ready";
  if (current.stage === "loading") return "downloading";
  if (typeof caches === "undefined") return "unknown";

  try {
    if (!(await caches.has(TRANSFORMERS_CACHE_NAME))) return "absent";

    const cache = await caches.open(TRANSFORMERS_CACHE_NAME);
    const requests = await cache.keys();
    const modelMarker = `/${model.huggingFaceId}/`;
    const cached = requests.some(
      (request) => request.url.includes(modelMarker) && request.url.endsWith(".onnx"),
    );

    return cached ? "cached" : "absent";
  } catch {
    return "unknown";
  }
}

export function subscribeEmbeddingStatus(listener) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function setStatus(modelId, patch) {
  const next = { ...getEmbeddingModelStatus(modelId), ...patch };
  statusByModel.set(modelId, next);

  for (const listener of statusListeners) {
    try {
      listener(modelId, next);
    } catch {
      // Ошибка подписчика не должна ломать загрузку модели.
    }
  }
}

function finishRequest(requestId, settle) {
  const request = pendingRequests.get(requestId);
  if (!request) return;

  pendingRequests.delete(requestId);
  window.clearTimeout(request.timeoutId);
  settle(request);
}

function rejectAll(message) {
  for (const [requestId, request] of pendingRequests.entries()) {
    pendingRequests.delete(requestId);
    window.clearTimeout(request.timeoutId);
    request.reject(new Error(message));
  }
}

function handleWorkerMessage(event) {
  const data = event.data || {};

  if (data.type === "progress") {
    setStatus(data.modelId, {
      stage: "loading",
      progress: Number.isFinite(data.progress) ? data.progress : 0,
      message: data.message || "Загружаем модель…",
    });
    return;
  }

  if (data.type === "ready") {
    setStatus(data.modelId, { stage: "ready", progress: 100, message: "Модель готова." });
    return;
  }

  if (data.type === "model-error") {
    setStatus(data.modelId, {
      stage: "error",
      progress: 0,
      message: data.message || "Не удалось загрузить нейросетевую модель.",
    });
    return;
  }

  if (data.type === "result") {
    const request = pendingRequests.get(data.requestId);
    if (!request) return;

    const model = getEmbeddingModel(request.modelId);
    if (!model || !Array.isArray(data.vector) || data.vector.length !== model.dimensions) {
      finishRequest(data.requestId, (current) => current.reject(new Error("Модель вернула вектор неверного размера.")));
      return;
    }

    queryCache.delete(request.cacheKey);
    queryCache.set(request.cacheKey, data.vector);

    if (queryCache.size > QUERY_CACHE_LIMIT) {
      const oldestKey = queryCache.keys().next().value;
      queryCache.delete(oldestKey);
    }

    setStatus(request.modelId, { stage: "ready", progress: 100, message: "Модель готова." });
    finishRequest(data.requestId, (current) => current.resolve(data.vector));
    return;
  }

  if (data.type === "passages") {
    const request = pendingRequests.get(data.requestId);
    if (!request) return;

    const model = getEmbeddingModel(request.modelId);
    const vectors = data.vectors;
    const valid = model
      && Array.isArray(vectors)
      && vectors.length === request.count
      && vectors.every((vector) => Array.isArray(vector) && vector.length === model.dimensions);

    if (!valid) {
      finishRequest(data.requestId, (current) => current.reject(new Error("Модель вернула векторы неверного размера.")));
      return;
    }

    setStatus(request.modelId, { stage: "ready", progress: 100, message: "Модель готова." });
    finishRequest(data.requestId, (current) => current.resolve(vectors));
    return;
  }

  if (data.type === "error") {
    if (data.modelId) {
      setStatus(data.modelId, {
        stage: "error",
        progress: 0,
        message: data.message || "Не удалось выполнить нейропоиск.",
      });
    }

    finishRequest(data.requestId, (current) => {
      current.reject(new Error(data.message || "Не удалось выполнить нейропоиск."));
    });
  }
}

function ensureWorker() {
  if (worker) return worker;
  if (typeof Worker === "undefined") throw new Error("Браузер не поддерживает фоновые вычисления.");

  worker = new Worker(new URL("../workers/embeddingWorker.js", import.meta.url), { type: "module" });
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (event) => {
    event.preventDefault?.();
    for (const request of pendingRequests.values()) {
      setStatus(request.modelId, {
        stage: "error",
        progress: 0,
        message: "Не удалось запустить нейросетевую модель.",
      });
    }
    worker?.terminate();
    worker = null;
    rejectAll("Не удалось запустить нейросетевую модель.");
  };

  return worker;
}

export function preloadEmbeddingModel(modelId) {
  const model = getEmbeddingModel(modelId);
  if (!model) return Promise.reject(new Error("Неизвестная модель эмбеддингов."));
  if (getEmbeddingModelStatus(modelId).stage === "ready") return Promise.resolve();

  let activeWorker;
  try {
    activeWorker = ensureWorker();
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    let timeoutId;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };

    const unsubscribe = subscribeEmbeddingStatus((changedModelId, status) => {
      if (changedModelId !== modelId) return;

      if (status.stage === "ready") {
        cleanup();
        resolve();
      } else if (status.stage === "error") {
        cleanup();
        reject(new Error(status.message || "Не удалось загрузить нейросетевую модель."));
      }
    });

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Модель не успела загрузиться. Попробуйте ещё раз."));
    }, EMBEDDING_TIMEOUT_MS);

    setStatus(modelId, { stage: "loading", progress: 0, message: "Загружаем модель…" });
    activeWorker.postMessage({ type: "load", modelId });
  });
}

export function embedQuery(modelId, text) {
  const model = getEmbeddingModel(modelId);
  if (!model) return Promise.reject(new Error("Неизвестная модель эмбеддингов."));

  const normalized = String(text ?? "").trim();
  if (!normalized) return Promise.resolve(null);

  const cacheKey = `${modelId}\n${normalized}`;
  if (queryCache.has(cacheKey)) {
    const cached = queryCache.get(cacheKey);
    queryCache.delete(cacheKey);
    queryCache.set(cacheKey, cached);
    return Promise.resolve(cached);
  }

  let activeWorker;
  try {
    activeWorker = ensureWorker();
  } catch (error) {
    return Promise.reject(error);
  }

  const requestId = `embed-${nextRequestId}`;
  nextRequestId += 1;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      finishRequest(requestId, (current) => {
        current.reject(new Error("Модель не успела загрузиться. Попробуйте ещё раз."));
      });
    }, EMBEDDING_TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, reject, modelId, cacheKey, timeoutId });

    const currentStatus = getEmbeddingModelStatus(modelId);
    if (currentStatus.stage !== "ready") {
      setStatus(modelId, { stage: "loading", progress: currentStatus.progress || 0, message: "Готовим модель…" });
    }

    activeWorker.postMessage({ type: "embed", requestId, modelId, text: normalized });
  });
}

export function embedPassages(modelId, texts) {
  const model = getEmbeddingModel(modelId);
  if (!model) return Promise.reject(new Error("Неизвестная модель эмбеддингов."));

  const normalized = (Array.isArray(texts) ? texts : []).map((text) => String(text ?? "").trim());
  if (!normalized.length) return Promise.resolve([]);
  if (normalized.some((text) => !text)) {
    return Promise.reject(new Error("Пустой текст для эмбеддинга."));
  }

  let activeWorker;
  try {
    activeWorker = ensureWorker();
  } catch (error) {
    return Promise.reject(error);
  }

  const requestId = `passages-${nextRequestId}`;
  nextRequestId += 1;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      finishRequest(requestId, (current) => {
        current.reject(new Error("Модель не успела обработать тексты. Попробуйте ещё раз."));
      });
    }, EMBEDDING_TIMEOUT_MS);

    pendingRequests.set(requestId, {
      resolve,
      reject,
      modelId,
      cacheKey: null,
      count: normalized.length,
      timeoutId,
    });

    const currentStatus = getEmbeddingModelStatus(modelId);
    if (currentStatus.stage !== "ready") {
      setStatus(modelId, { stage: "loading", progress: currentStatus.progress || 0, message: "Готовим модель…" });
    }

    activeWorker.postMessage({ type: "embedPassages", requestId, modelId, texts: normalized });
  });
}
