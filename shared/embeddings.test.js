import test from "node:test";
import assert from "node:assert/strict";
import {
  EMBEDDING_MODELS,
  buildCompanyEmbeddingText,
  buildOrderEmbeddingText,
  cosineSimilarity,
  formatEmbeddingInput,
  getEmbeddingModel,
  getEmbeddingSourceHash,
  getSemanticMatchPercent,
  isEmbeddingEntityType,
  normalizeScoreMap,
  rankHybridResults,
  validateEmbeddingVector,
} from "./embeddings.js";

function vectorOf(value, modelId) {
  const model = getEmbeddingModel(modelId);
  return Array.from({ length: model.dimensions }, () => value);
}

test("реестр содержит две модели с согласованными размерами", () => {
  assert.equal(EMBEDDING_MODELS.compact.dimensions, 312);
  assert.equal(EMBEDDING_MODELS.compact.pooling, "mean");
  assert.equal(EMBEDDING_MODELS.powerful.dimensions, 384);
  assert.equal(EMBEDDING_MODELS.powerful.queryPrefix, "query: ");
  assert.equal(EMBEDDING_MODELS.powerful.passagePrefix, "passage: ");
  assert.equal(getEmbeddingModel("compact")?.huggingFaceId, "TrendHD/rubert-tiny2-int8");
  assert.equal(getEmbeddingModel("unknown"), null);
  assert.equal(getEmbeddingModel("toString"), null);
});

test("типы сущностей ограничены заказами и компаниями", () => {
  assert.equal(isEmbeddingEntityType("order"), true);
  assert.equal(isEmbeddingEntityType("company"), true);
  assert.equal(isEmbeddingEntityType("user"), false);
  assert.equal(isEmbeddingEntityType(""), false);
});

test("текст заказа собирает значимые поля без пустых значений", () => {
  const text = buildOrderEmbeddingText({
    title: "Курьерская доставка",
    category: "Логистика",
    cityMajor: "Москва",
    locationDetail: "",
    city: "Москва",
    summary: "Нужна доставка заказов",
    description: "Ежедневно 50 адресов",
    terms: "По договору",
    tags: ["доставка", "курьер"],
  });

  assert.match(text, /Курьерская доставка/);
  assert.match(text, /Логистика/);
  assert.match(text, /Москва/);
  assert.doesNotMatch(text, /Москва, Москва/);
  assert.match(text, /доставка, курьер/);
});

test("текст компании собирает описание и специализации", () => {
  const text = buildCompanyEmbeddingText({
    name: "Северный склад",
    industry: "Логистика",
    city: "Санкт-Петербург",
    description: "Ответственное хранение",
    about: "Работаем с 2015 года",
    specializations: ["фулфилмент", "упаковка"],
  });

  assert.match(text, /Северный склад/);
  assert.match(text, /Ответственное хранение/);
  assert.match(text, /фулфилмент, упаковка/);
});

test("префиксы моделей применяются только к нужному типу запроса", () => {
  assert.equal(formatEmbeddingInput("compact", "доставка"), "доставка");
  assert.equal(formatEmbeddingInput("compact", "доставка", { query: true }), "доставка");
  assert.equal(formatEmbeddingInput("powerful", "доставка"), "passage: доставка");
  assert.equal(formatEmbeddingInput("powerful", "доставка", { query: true }), "query: доставка");
  assert.equal(formatEmbeddingInput("powerful", "   "), "");
});

test("хеш источника стабилен и зависит от модели и текста", () => {
  const first = getEmbeddingSourceHash("compact", "доставка заказов");
  const second = getEmbeddingSourceHash("compact", "доставка заказов");

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{16}$/);
  assert.notEqual(first, getEmbeddingSourceHash("compact", "доставка посылок"));
  assert.notEqual(first, getEmbeddingSourceHash("powerful", "доставка заказов"));
});

test("валидация вектора проверяет размер, числа и нулевое значение", () => {
  const valid = validateEmbeddingVector(vectorOf(0.01, "compact"), "compact");
  assert.equal(valid.ok, true);
  assert.equal(valid.value.length, 312);

  assert.equal(validateEmbeddingVector([1, 2, 3], "compact").ok, false);
  assert.equal(validateEmbeddingVector("vector", "compact").ok, false);
  assert.equal(validateEmbeddingVector(Array(312).fill(Number.NaN), "compact").ok, false);
  assert.equal(validateEmbeddingVector(Array(312).fill(0), "compact").ok, false);
  assert.equal(validateEmbeddingVector(vectorOf(0.01, "compact"), "missing").ok, false);
});

test("косинусная близость считает одинаковые и противоположные векторы", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.equal(cosineSimilarity([1, 0], [1]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test("процент смыслового совпадения калибруется по порогу модели", () => {
  assert.equal(getSemanticMatchPercent(0.5, 0.5), 50);
  assert.equal(getSemanticMatchPercent(0.75, 0.5), 75);
  assert.equal(getSemanticMatchPercent(1, 0.5), 100);
  assert.equal(getSemanticMatchPercent(0.82, 0.82), 50);
  assert.equal(getSemanticMatchPercent(0.91, 0.82), 75);
  assert.equal(getSemanticMatchPercent(0.5, 0.82), null);
  assert.equal(getSemanticMatchPercent(0, 0), 0);
  assert.equal(getSemanticMatchPercent(0.5, 0), 50);
  assert.equal(getSemanticMatchPercent(Number.NaN, 0.5), null);
  assert.equal(getSemanticMatchPercent(1.2, 0.5), 100);
});

test("слабая шкала показывает совпадения ниже порога", () => {
  assert.equal(getSemanticMatchPercent(0.5, 0.82, { weak: true }), 30);
  assert.equal(getSemanticMatchPercent(0.41, 0.82, { weak: true }), 25);
  assert.equal(getSemanticMatchPercent(0.25, 0.5, { weak: true }), 25);
  assert.equal(getSemanticMatchPercent(0, 0.82, { weak: true }), 0);
  assert.equal(getSemanticMatchPercent(-0.2, 0.82, { weak: true }), 0);
  assert.equal(getSemanticMatchPercent(0.91, 0.82, { weak: true }), 75);
  assert.equal(getSemanticMatchPercent(Number.NaN, 0.82, { weak: true }), null);
});

test("нормализация оценок приводит значения к диапазону 0..1", () => {
  const normalized = normalizeScoreMap(new Map([["a", 2], ["b", 4], ["c", 6]]));
  assert.equal(normalized.get("a"), 0);
  assert.equal(normalized.get("b"), 0.5);
  assert.equal(normalized.get("c"), 1);

  const equal = normalizeScoreMap(new Map([["a", 5], ["b", 5]]));
  assert.equal(equal.get("a"), 0.5);
});

test("гибридный ранжировщик объединяет лексические и смысловые совпадения", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const results = rankHybridResults(items, {
    lexicalScores: new Map([["a", 10], ["b", 5]]),
    semanticScores: new Map([["a", 0.9], ["b", 0.65], ["c", 0.95], ["d", 0.2]]),
    semanticThreshold: 0.6,
  });

  assert.deepEqual(results.map((entry) => entry.item.id), ["a", "c", "b"]);
  assert.equal(results.find((entry) => entry.item.id === "a").source, "hybrid");
  assert.equal(results.find((entry) => entry.item.id === "b").source, "hybrid");
  assert.equal(results.find((entry) => entry.item.id === "c").source, "semantic");
  assert.equal(results.some((entry) => entry.item.id === "d"), false);
});

test("лексические совпадения без смысловых не теряются", () => {
  const results = rankHybridResults([{ id: "a" }, { id: "b" }], {
    lexicalScores: new Map([["a", 10], ["b", 5]]),
    semanticScores: new Map([["a", 0.2]]),
    semanticThreshold: 0.6,
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].item.id, "a");
  assert.equal(results[0].source, "lexical");
  assert.equal(results[1].item.id, "b");
});

test("без сигналов ранжировщик возвращает пустой список", () => {
  const results = rankHybridResults([{ id: "a" }], {
    lexicalScores: new Map(),
    semanticScores: new Map([["a", 0.1]]),
    semanticThreshold: 0.6,
  });

  assert.deepEqual(results, []);
});
