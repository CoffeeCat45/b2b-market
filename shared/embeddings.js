export const EMBEDDING_MODEL_IDS = Object.freeze(["compact", "powerful"]);

export const EMBEDDING_MODELS = Object.freeze({
  compact: Object.freeze({
    id: "compact",
    huggingFaceId: "TrendHD/rubert-tiny2-int8",
    modelFile: "rubert-tiny2-int8",
    dimensions: 312,
    pooling: "mean",
    queryPrefix: "",
    passagePrefix: "",
    // В репозитории модели единственный ONNX-файл без dtype-суффикса.
    dtype: "fp32",
    approximateSizeMb: 29,
    semanticThreshold: 0.5,
  }),
  powerful: Object.freeze({
    id: "powerful",
    huggingFaceId: "Xenova/multilingual-e5-small",
    modelFile: null,
    dimensions: 384,
    pooling: "mean",
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
    dtype: "q8",
    approximateSizeMb: 118,
    semanticThreshold: 0.82,
  }),
});

export const EMBEDDING_ENTITY_TYPES = Object.freeze(["order", "company"]);
export const MAX_EMBEDDING_COMPONENT = 100;
export const MAX_EMBEDDING_TEXT_LENGTH = 4000;

const ENTITY_TYPES = new Set(EMBEDDING_ENTITY_TYPES);
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

export function getEmbeddingModel(modelId) {
  const key = String(modelId ?? "");
  return Object.prototype.hasOwnProperty.call(EMBEDDING_MODELS, key) ? EMBEDDING_MODELS[key] : null;
}

export function isEmbeddingModelId(modelId) {
  return Boolean(getEmbeddingModel(modelId));
}

export function isEmbeddingEntityType(value) {
  return ENTITY_TYPES.has(String(value ?? ""));
}

function cleanText(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).join(", ");
  }

  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function joinText(parts) {
  return parts
    .map(cleanText)
    .filter(Boolean)
    .join(". ")
    .slice(0, MAX_EMBEDDING_TEXT_LENGTH);
}

export function buildOrderEmbeddingText(order = {}) {
  const locations = [...new Set([order.cityMajor, order.locationDetail, order.city].map(cleanText).filter(Boolean))];

  return joinText([
    order.title,
    order.category,
    locations.join(", "),
    order.summary,
    order.description,
    order.terms,
    order.tags,
  ]);
}

export function buildCompanyEmbeddingText(company = {}) {
  return joinText([
    company.name,
    company.industry,
    company.city,
    company.description,
    company.about,
    company.specializations,
  ]);
}

export function formatEmbeddingInput(modelId, value, { query = false } = {}) {
  const model = getEmbeddingModel(modelId);
  const body = String(value ?? "").trim();
  if (!body) return "";

  const prefix = query ? model?.queryPrefix : model?.passagePrefix;
  return `${prefix || ""}${body}`;
}

export function hashEmbeddingText(value) {
  const input = String(value ?? "");
  let hash = FNV_OFFSET;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }

  return hash.toString(16).padStart(16, "0");
}

export function getEmbeddingSourceHash(modelId, value) {
  return hashEmbeddingText(formatEmbeddingInput(modelId, value));
}

export function validateEmbeddingVector(vector, modelId) {
  const model = getEmbeddingModel(modelId);
  if (!model) return { ok: false, error: "Неизвестная модель эмбеддингов." };
  if (!Array.isArray(vector)) return { ok: false, error: "Вектор должен быть массивом чисел." };
  if (vector.length !== model.dimensions) {
    return { ok: false, error: `Ожидается вектор из ${model.dimensions} чисел.` };
  }

  const value = new Array(vector.length);
  let squaredNorm = 0;

  for (let index = 0; index < vector.length; index += 1) {
    const number = vector[index];

    if (typeof number !== "number" || !Number.isFinite(number) || Math.abs(number) > MAX_EMBEDDING_COMPONENT) {
      return { ok: false, error: "Вектор содержит недопустимые значения." };
    }

    const rounded = Math.round(number * 1e6) / 1e6;
    value[index] = rounded;
    squaredNorm += rounded * rounded;
  }

  if (squaredNorm < 1e-12) return { ok: false, error: "Вектор не может быть нулевым." };

  return { ok: true, value, norm: Math.sqrt(squaredNorm) };
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || !left.length || left.length !== right.length) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }

  if (leftNorm <= 0 || rightNorm <= 0) return 0;
  const score = dot / Math.sqrt(leftNorm * rightNorm);
  return Math.max(-1, Math.min(1, score));
}

// Порог модели считаем «пограничным совпадением» (50%), 1.0 — полным (100%).
export function getSemanticMatchPercent(similarity, threshold = 0) {
  if (!Number.isFinite(similarity)) return null;

  const min = Number.isFinite(threshold) ? Math.min(Math.max(threshold, 0), 0.99) : 0;
  if (similarity < min) return null;

  const floor = min > 0 ? 50 : 0;
  const ratio = (Math.min(similarity, 1) - min) / (1 - min);
  return Math.round(floor + ratio * (100 - floor));
}

export function normalizeScoreMap(scores) {
  const normalized = new Map();
  let min = Infinity;
  let max = -Infinity;

  for (const value of scores.values()) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return normalized;

  const span = max - min;
  for (const [key, value] of scores.entries()) {
    if (!Number.isFinite(value)) continue;
    normalized.set(key, span > 0 ? (value - min) / span : 0.5);
  }

  return normalized;
}

function normalizeByMax(scores) {
  const normalized = new Map();
  let max = 0;

  for (const value of scores.values()) {
    if (Number.isFinite(value) && value > max) max = value;
  }

  if (max <= 0) return normalized;

  for (const [key, value] of scores.entries()) {
    if (Number.isFinite(value) && value > 0) normalized.set(key, value / max);
  }

  return normalized;
}

export function rankHybridResults(
  items,
  {
    lexicalScores = new Map(),
    semanticScores = new Map(),
    semanticThreshold = 0,
    lexicalWeight = 0.45,
    semanticWeight = 0.55,
  } = {},
) {
  const candidates = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.id) continue;

    const lexicalValue = lexicalScores.get(item.id);
    const lexicalScore = Number.isFinite(lexicalValue) && lexicalValue > 0 ? lexicalValue : 0;
    const semanticValue = semanticScores.get(item.id);
    const semanticScore = Number.isFinite(semanticValue) && semanticValue >= semanticThreshold ? semanticValue : null;

    if (lexicalScore > 0 || semanticScore !== null) {
      candidates.set(item.id, { item, lexicalScore, semanticScore });
    }
  }

  const lexicalMap = new Map([...candidates].map(([id, candidate]) => [id, candidate.lexicalScore]));
  const semanticMap = new Map(
    [...candidates]
      .filter(([, candidate]) => candidate.semanticScore !== null)
      .map(([id, candidate]) => [id, candidate.semanticScore]),
  );
  const normalizedLexical = normalizeByMax(lexicalMap);
  const normalizedSemantic = normalizeScoreMap(semanticMap);

  return [...candidates.values()]
    .map((candidate) => {
      const lexical = normalizedLexical.get(candidate.item.id) ?? 0;
      const semantic = normalizedSemantic.get(candidate.item.id);
      const effectiveSemantic = semantic ?? lexical;
      const source = candidate.lexicalScore > 0 && candidate.semanticScore !== null
        ? "hybrid"
        : candidate.semanticScore !== null
          ? "semantic"
          : "lexical";

      return {
        item: candidate.item,
        score: lexicalWeight * lexical + semanticWeight * effectiveSemantic,
        lexicalScore: candidate.lexicalScore,
        semanticScore: candidate.semanticScore,
        source,
      };
    })
    .sort((left, right) => (
      right.score - left.score
      || right.lexicalScore - left.lexicalScore
      || String(left.item.id).localeCompare(String(right.item.id), "ru")
    ));
}
