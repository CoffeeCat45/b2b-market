import test from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS,
  dataUrlBytes,
  validateArchivePayload,
  validateAttachments,
  validateAvatar,
  validateMessagePayload,
  validateOrderPayload,
  validatePassword,
  validateReviewPayload,
} from "./validation.js";
import { formatDisplayDate, matchesDateFilter, parseDateValue } from "./dates.js";

const PDF_DATA_URL = "data:application/pdf;base64,JVBERi0xLjQ=";
const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

const orderPayload = {
  title: "Поставка упаковки",
  category: "Оптовые поставки",
  cityMajor: "Екатеринбург",
  summary: "Нужна регулярная поставка упаковки.",
  description: "Ищем поставщика упаковки для сети кофеен с регулярными поставками.",
  terms: "Образцы и коммерческое предложение.",
  tags: ["B2B", "Поставка"],
  budgetFrom: "250000",
  budgetTo: "450000",
};

test("заказ с корректным бюджетом проходит", () => {
  const result = validateOrderPayload(orderPayload);

  assert.equal(result.ok, true);
  assert.equal(result.value.budgetFrom, 250000);
  assert.equal(result.value.budgetTo, 450000);
  assert.match(result.value.budgetLabel, /250/);
});

test("оба пустых бюджета превращаются в «По договорённости»", () => {
  const result = validateOrderPayload({ ...orderPayload, budgetFrom: "", budgetTo: "" });

  assert.equal(result.ok, true);
  assert.equal(result.value.budgetFrom, 0);
  assert.equal(result.value.budgetTo, 0);
  assert.equal(result.value.budgetLabel, "По договорённости");
});

test("один пустой бюджет — ошибка", () => {
  const result = validateOrderPayload({ ...orderPayload, budgetTo: "" });

  assert.equal(result.ok, false);
  assert.ok(result.fields.budgetTo);
});

test("перевёрнутый бюджет — ошибка", () => {
  const result = validateOrderPayload({ ...orderPayload, budgetFrom: "500000", budgetTo: "100000" });

  assert.equal(result.ok, false);
  assert.ok(result.fields.budgetTo);
});

test("отрицательный бюджет — ошибка", () => {
  const result = validateOrderPayload({ ...orderPayload, budgetFrom: "-1" });

  assert.equal(result.ok, false);
  assert.ok(result.fields.budgetFrom);
});

test("слишком много тегов — ошибка", () => {
  const result = validateOrderPayload({
    ...orderPayload,
    tags: Array.from({ length: LIMITS.order.tagsMax + 1 }, (_, index) => `Тег ${index}`),
  });

  assert.equal(result.ok, false);
  assert.ok(result.fields.tags);
});

test("пароль короче 8 байт не принимается", () => {
  assert.equal(validatePassword("short").ok, false);
  assert.equal(validatePassword("12345678").ok, true);
});

test("data URL считается по base64 без заглушек", () => {
  assert.equal(dataUrlBytes("data:application/pdf;base64,AA=="), 1);
  assert.equal(dataUrlBytes("data:application/pdf;base64,AAAA"), 3);
  assert.equal(dataUrlBytes("not-a-data-url"), null);
});

test("вложения ограничены по количеству", () => {
  const items = Array.from({ length: LIMITS.files.maxAttachments + 1 }, (_, index) => ({
    name: `file-${index}.pdf`,
    type: "application/pdf",
    dataUrl: PDF_DATA_URL,
  }));
  const result = validateAttachments(items);

  assert.equal(result.ok, false);
  assert.match(result.error, /не более/);
});

test("тип вложения должен совпадать с data URL", () => {
  const result = validateAttachments([{
    name: "document.pdf",
    type: "application/pdf",
    dataUrl: "data:image/png;base64,AA==",
  }]);

  assert.equal(result.ok, false);
});

test("вложение с корректной подписью PDF проходит", () => {
  const result = validateAttachments([{
    name: "document.pdf",
    type: "application/pdf",
    dataUrl: PDF_DATA_URL,
  }]);

  assert.equal(result.ok, true);
});

test("подпись файла должна соответствовать заявленному типу", () => {
  const result = validateAttachments([{
    name: "document.pdf",
    type: "application/pdf",
    dataUrl: "data:application/pdf;base64,iVBORw0KGgo=",
  }]);

  assert.equal(result.ok, false);
  assert.match(result.error, /не похоже/);
});

test("аватар принимает PNG и отвергает посторонний тип", () => {
  assert.equal(validateAvatar(PNG_DATA_URL).ok, true);
  assert.equal(validateAvatar("data:text/plain;base64,AA==").ok, false);
});

test("аватар с подписью другого формата отвергается", () => {
  assert.equal(validateAvatar("data:image/png;base64,JVBERi0xLjQ=").ok, false);
});

test("пустое сообщение без вложений не отправляется", () => {
  const empty = validateMessagePayload({ text: "   ", attachments: [] });
  const withText = validateMessagePayload({ text: "Здравствуйте" });

  assert.equal(empty.ok, false);
  assert.equal(withText.ok, true);
});

test("отзыв требует оценку 1–5", () => {
  assert.equal(validateReviewPayload({ text: "Хорошая компания", rating: 0 }).ok, false);
  assert.equal(validateReviewPayload({ text: "Хорошая компания", rating: 5 }).ok, true);
});

test("архивация принимает только boolean", () => {
  assert.equal(validateArchivePayload({ isArchived: "false" }).ok, false);
  assert.equal(validateArchivePayload({ isArchived: false }).ok, true);
});

test("даты читаются в ISO и старых форматах", () => {
  const iso = parseDateValue("2026-03-29T09:00:00.000Z");
  const long = parseDateValue("29 марта 2026");
  const dotted = parseDateValue("29.03.2026 10:30");

  assert.ok(iso);
  assert.equal(long.getFullYear(), 2026);
  assert.equal(long.getMonth(), 2);
  assert.equal(long.getDate(), 29);
  assert.equal(dotted.getHours(), 10);
  assert.equal(dotted.getMinutes(), 30);
  assert.equal(formatDisplayDate("2026-03-29"), "29 марта 2026");
  assert.equal(matchesDateFilter(new Date().toISOString(), "1d"), true);
});
