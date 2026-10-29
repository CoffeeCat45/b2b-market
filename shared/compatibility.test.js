import test from "node:test";
import assert from "node:assert/strict";
import { getOrderCompatibility, getSupplierCompatibility } from "./compatibility.js";

const order = {
  id: "ord-1",
  companyId: "cmp-other",
  category: "Упаковка",
  cityMajor: "Москва",
  tags: ["гофрокороб", "картон", "упаковка"],
};

test("полное совпадение отрасли, города и тегов даёт 100", () => {
  const result = getOrderCompatibility(
    {
      id: "cmp-own",
      industry: "Упаковка",
      city: "Москва",
      specializations: ["Гофрокороб", "Картон", "Упаковка"],
    },
    order,
  );

  assert.equal(result.score, 100);
  assert.deepEqual(result.reasons, [
    "Совпадает отрасль",
    "Совпадает город",
    "Совпадают теги: Гофрокороб, Картон, Упаковка",
  ]);
});

test("синоним отрасли даёт частичный счёт", () => {
  const result = getOrderCompatibility(
    {
      id: "cmp-own",
      industry: "Логистика",
      city: "Казань",
      specializations: ["Складские услуги"],
    },
    { ...order, category: "Доставка" },
  );

  assert.equal(result.score, 25);
  assert.deepEqual(result.reasons, ["Совпадает отрасль"]);
});

test("совпадение отрасли, города и одного тега складывается", () => {
  const result = getOrderCompatibility(
    {
      id: "cmp-own",
      industry: "Упаковка",
      city: "Москва",
      specializations: ["Гофрокороб"],
    },
    { ...order, tags: ["гофрокороб"] },
  );

  assert.equal(result.score, 77);
  assert.equal(result.reasons.length, 3);
});

test("аноним и своя компания не получают совместимость", () => {
  assert.equal(getOrderCompatibility(null, order), null);
  assert.equal(
    getOrderCompatibility(
      { id: "cmp-other", industry: "Упаковка", city: "Москва", specializations: [] },
      order,
    ),
    null,
  );
});

test("пустой профиль компании не даёт совместимость", () => {
  assert.equal(
    getOrderCompatibility({ id: "cmp-own", industry: "", city: "", specializations: [] }, order),
    null,
  );
});

test("совместимость заказа с поставщиком считается по профилю поставщика", () => {
  const result = getSupplierCompatibility(order, {
    companyId: "cmp-supplier",
    industry: "Упаковка",
    city: "Москва",
    skills: ["Гофрокороб", "Картон", "Упаковка"],
  });

  assert.equal(result.score, 100);
  assert.deepEqual(result.reasons, [
    "Совпадают услуги: Гофрокороб, Картон, Упаковка",
    "Совпадает отрасль",
    "Совпадает город",
  ]);
});

test("услуги поставщика важнее совпадения города", () => {
  const packagingSupplier = getSupplierCompatibility(order, {
    companyId: "cmp-pack",
    industry: "Производство",
    city: "Казань",
    skills: ["Упаковка"],
  });
  const cityOnlySupplier = getSupplierCompatibility(order, {
    companyId: "cmp-city",
    industry: "IT",
    city: "Москва",
    skills: ["Разработка"],
  });

  assert.equal(packagingSupplier.score, 35);
  assert.equal(cityOnlySupplier.score, 10);
  assert.deepEqual(packagingSupplier.reasons, ["Совпадают услуги: Упаковка"]);
  assert.deepEqual(cityOnlySupplier.reasons, ["Совпадает город"]);
});

test("своя компания и пустой профиль поставщика не дают совместимость", () => {
  assert.equal(
    getSupplierCompatibility(order, {
      companyId: "cmp-other",
      industry: "Упаковка",
      city: "Москва",
      skills: ["Гофрокороб"],
    }),
    null,
  );
  assert.equal(
    getSupplierCompatibility(order, { companyId: "cmp-supplier", industry: "", city: "", skills: [] }),
    null,
  );
});
