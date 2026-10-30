import {
  buildCompanyEmbeddingText,
  buildOrderEmbeddingText,
  getEmbeddingModel,
  getEmbeddingSourceHash,
  isEmbeddingEntityType,
} from "../../shared/embeddings";
import { apiFetch } from "./api";
import { embedPassages } from "./embeddingClient";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_LOCAL_ENTITIES = 200;
const serverCache = new Map();
const serverInflight = new Map();
const localVectors = new Map();

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

function fetchServerIndex(modelId, model) {
  const cached = serverCache.get(modelId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  if (serverInflight.has(modelId)) return serverInflight.get(modelId);

  const promise = apiFetch(`/embeddings?model=${encodeURIComponent(modelId)}`, { skipAuth: true })
    .then((payload) => {
      const data = buildIndex(payload, model);
      serverCache.set(modelId, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => {
      serverInflight.delete(modelId);
    });

  serverInflight.set(modelId, promise);
  return promise;
}

function buildEntityText(entityType, item) {
  if (entityType === "order") return buildOrderEmbeddingText(item);

  const source = item?.summary !== undefined && item?.skills !== undefined
    ? { ...item, description: item.summary, about: item.description, specializations: item.skills }
    : item;

  return buildCompanyEmbeddingText(source);
}

function getLocalMap(modelId) {
  if (!localVectors.has(modelId)) localVectors.set(modelId, new Map());
  return localVectors.get(modelId);
}

async function fillLocalVectors(modelId, model, entityType, items, serverVectors) {
  const local = getLocalMap(modelId);
  const missing = [];
  const seen = new Set();

  for (const item of items) {
    const id = String(item?.id ?? "");
    if (!id || seen.has(id) || serverVectors.has(id)) continue;
    seen.add(id);
    if (missing.length >= MAX_LOCAL_ENTITIES) break;

    const text = buildEntityText(entityType, item);
    if (!text) continue;

    const hash = getEmbeddingSourceHash(modelId, text);
    const cached = local.get(`${entityType}:${id}`);
    if (cached?.hash === hash) continue;

    missing.push({ id, hash, text });
  }

  if (missing.length) {
    const vectors = await embedPassages(modelId, missing.map((entry) => entry.text));
    if (vectors.length !== missing.length) {
      throw new Error("Модель вернула неверное число векторов.");
    }

    missing.forEach((entry, index) => {
      if (vectors[index]?.length !== model.dimensions) {
        throw new Error("Модель вернула вектор неверного размера.");
      }
      local.set(`${entityType}:${entry.id}`, { hash: entry.hash, vector: vectors[index] });
    });
  }

  const merged = new Map(serverVectors);
  for (const item of items) {
    const id = String(item?.id ?? "");
    if (!id || merged.has(id)) continue;
    const cached = local.get(`${entityType}:${id}`);
    if (cached) merged.set(id, cached.vector);
  }

  return merged;
}

export async function loadEmbeddingIndex(modelId, { entityType, items } = {}) {
  const model = getEmbeddingModel(modelId);
  if (!model) throw new Error("Неизвестная модель эмбеддингов.");

  const serverData = await fetchServerIndex(modelId, model);
  if (!entityType || !isEmbeddingEntityType(entityType) || !Array.isArray(items) || !items.length) {
    return serverData;
  }

  try {
    const merged = await fillLocalVectors(modelId, model, entityType, items, serverData.byType[entityType]);
    return { byType: { ...serverData.byType, [entityType]: merged }, updatedAt: Date.now() };
  } catch (error) {
    if (!serverData.byType[entityType].size) throw error;
    return serverData;
  }
}
