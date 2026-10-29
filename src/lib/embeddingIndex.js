import { getEmbeddingModel, isEmbeddingEntityType } from "../../shared/embeddings";
import { apiFetch } from "./api";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

function buildIndex(payload, model) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("Сервер вернул некорректный нейроиндекс.");
  }

  const byType = { order: new Map(), company: new Map() };

  for (const item of payload.items) {
    if (!isEmbeddingEntityType(item?.entityType)) continue;
    if (!Array.isArray(item.vector) || item.vector.length !== model.dimensions) continue;
    byType[item.entityType].set(String(item.entityId), item.vector);
  }

  return { byType, updatedAt: Date.now() };
}

export function loadEmbeddingIndex(modelId) {
  const model = getEmbeddingModel(modelId);
  if (!model) return Promise.reject(new Error("Неизвестная модель эмбеддингов."));

  const cached = cache.get(modelId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  if (inflight.has(modelId)) return inflight.get(modelId);

  const promise = apiFetch(`/embeddings?model=${encodeURIComponent(modelId)}`, { skipAuth: true })
    .then((payload) => {
      const data = buildIndex(payload, model);
      cache.set(modelId, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => {
      inflight.delete(modelId);
    });

  inflight.set(modelId, promise);
  return promise;
}
