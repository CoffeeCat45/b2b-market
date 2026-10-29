import test from "node:test";
import assert from "node:assert/strict";
import { searchOrders, searchSuppliers } from "./search.js";

function order(overrides) {
  return {
    id: "ord-1",
    companyId: "cmp-1",
    company: "ООО Ромашка",
    title: "Нужен подрядчик",
    category: "Упаковка",
    cityMajor: "Москва",
    locationDetail: "",
    summary: "Краткое описание заказа.",
    description: "Полное описание заказа.",
    terms: "Условия сотрудничества.",
    tags: [],
    ...overrides,
  };
}

test("точное совпадение в заголовке важнее описания", () => {
  const orders = [
    order({ id: "title", title: "Упаковка гофрокоробов", description: "Без подробностей." }),
    order({ id: "description", title: "Нужен подрядчик", description: "Требуется упаковка для склада." }),
  ];

  const results = searchOrders(orders, "упаковка");

  assert.equal(results[0].item.id, "title");
  assert.ok(results[0].score > results[1].score);
});

test("запись находится по тегу без совпадения в заголовке", () => {
  const orders = [order({ title: "Нужен подрядчик", tags: ["логистика"] })];

  const results = searchOrders(orders, "логистика");

  assert.equal(results.length, 1);
  assert.equal(results[0].item.id, "ord-1");
});

test("синоним находит запись", () => {
  const orders = [order({ title: "Нужен подрядчик", tags: ["логистика"] })];

  const results = searchOrders(orders, "доставка");

  assert.equal(results.length, 1);
});

test("опечатка находит запись", () => {
  const orders = [
    order({ id: "typo", title: "Упаковка гофрокоробов" }),
    order({ id: "other", title: "Мебель для офиса", category: "Мебель" }),
  ];

  const results = searchOrders(orders, "упковка");

  assert.equal(results.length, 1);
  assert.equal(results[0].item.id, "typo");
});

test("фраза в заголовке даёт преимущество", () => {
  const orders = [
    order({ id: "phrase", title: "Поставка упаковки" }),
    order({ id: "split", title: "Упаковка и поставка" }),
  ];

  const results = searchOrders(orders, "поставка упаковки");

  assert.equal(results[0].item.id, "phrase");
  assert.ok(results[0].score > results[1].score);
});

test("стоп-слова не мешают поиску", () => {
  const orders = [order({ title: "Упаковка гофрокоробов" })];

  const results = searchOrders(orders, "для упаковки");

  assert.equal(results.length, 1);
});

test("регистр и ё нормализуются", () => {
  const orders = [order({ id: "yo", title: "Ёлочные игрушки" })];

  const results = searchOrders(orders, "ЕЛОЧНЫЕ");

  assert.equal(results.length, 1);
  assert.equal(results[0].item.id, "yo");
});

test("пустой запрос ничего не возвращает", () => {
  const orders = [order({})];

  assert.deepEqual(searchOrders(orders, "   "), []);
});

test("нерелевантный запрос отбрасывается", () => {
  const orders = [order({})];

  assert.deepEqual(searchOrders(orders, "абракадабра"), []);
});

test("поиск поставщиков находит по навыку", () => {
  const suppliers = [
    {
      id: "cmp-1",
      companyId: "cmp-1",
      name: "ООО Ромашка",
      industry: "Производство",
      city: "Москва",
      summary: "Краткое описание.",
      description: "Полное описание.",
      skills: ["Упаковка", "Картон"],
    },
  ];

  const results = searchSuppliers(suppliers, "упаковка");

  assert.equal(results.length, 1);
  assert.equal(results[0].item.companyId, "cmp-1");
});

test("поиск поставщиков находит по ИНН", () => {
  const suppliers = [
    {
      id: "cmp-1",
      companyId: "cmp-1",
      name: "ООО Ромашка",
      industry: "Производство",
      city: "Москва",
      inn: "7707083893",
      summary: "Краткое описание.",
      description: "Полное описание.",
      skills: ["Упаковка"],
    },
    {
      id: "cmp-2",
      companyId: "cmp-2",
      name: "ООО Лютик",
      industry: "Логистика",
      city: "Казань",
      inn: "7736050003",
      summary: "Краткое описание.",
      description: "Полное описание.",
      skills: ["Перевозки"],
    },
  ];

  const results = searchSuppliers(suppliers, "7707083893");

  assert.equal(results.length, 1);
  assert.equal(results[0].item.companyId, "cmp-1");
  assert.ok(results[0].matchedFields.includes("inn"));
});
