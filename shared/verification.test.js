import test from "node:test";
import assert from "node:assert/strict";
import {
  isIndividualInn,
  isValidInn,
  isValidOgrn,
  normalizeInn,
  validateCompanyLegalFields,
  validateVerificationDecision,
  validateVerificationPayload,
} from "./verification.js";

test("normalizeInn убирает пробелы", () => {
  assert.equal(normalizeInn(" 770 708 38 93 "), "7707083893");
  assert.equal(normalizeInn(null), "");
});

test("isValidInn принимает известные ИНН юрлиц", () => {
  for (const inn of ["7707083893", "7736050003", "7736207543", "7708503727", "7736015739"]) {
    assert.equal(isValidInn(inn), true, inn);
  }
});

test("isValidInn принимает синтетические ИНН для демо", () => {
  for (const inn of ["7700000009", "7800000002", "500100732259"]) {
    assert.equal(isValidInn(inn), true, inn);
  }
});

test("isValidInn отклоняет неверные контрольные суммы", () => {
  assert.equal(isValidInn("7707083894"), false);
  assert.equal(isValidInn("7707083890"), false);
  assert.equal(isValidInn("500100732251"), false);
  assert.equal(isValidInn("500100732255"), false);
});

test("isValidInn отклоняет неверную длину и нецифровые значения", () => {
  assert.equal(isValidInn(""), false);
  assert.equal(isValidInn("770708389"), false);
  assert.equal(isValidInn("77070838931"), false);
  assert.equal(isValidInn("77070838AA"), false);
  assert.equal(isValidInn("7707083893x"), false);
  assert.equal(isValidInn(undefined), false);
});

test("isIndividualInn распознаёт 12-значный ИНН", () => {
  assert.equal(isIndividualInn("500100732259"), true);
  assert.equal(isIndividualInn("7707083893"), false);
});

test("isValidOgrn принимает корректные ОГРН и ОГРНИП", () => {
  assert.equal(isValidOgrn("1027700132195"), true);
  assert.equal(isValidOgrn("304500116000157"), true);
});

test("isValidOgrn отклоняет неверные значения", () => {
  assert.equal(isValidOgrn("1027700132196"), false);
  assert.equal(isValidOgrn("304500116000158"), false);
  assert.equal(isValidOgrn("102770013219"), false);
  assert.equal(isValidOgrn("102770013219500"), false);
  assert.equal(isValidOgrn(""), false);
});

test("validateVerificationPayload требует ИНН и наименование для юрлица", () => {
  const empty = validateVerificationPayload({});
  assert.equal(empty.ok, false);
  assert.equal(empty.fields.inn, "Укажите ИНН.");

  const missingName = validateVerificationPayload({ inn: "7707083893" });
  assert.equal(missingName.ok, false);
  assert.match(missingName.fields.legalName, /наименование/i);

  const valid = validateVerificationPayload({
    inn: "770 708 38 93",
    legalName: 'ПАО "Сбербанк"',
    ogrn: "1027700132195",
    legalAddress: "Москва",
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.inn, "7707083893");
  assert.equal(valid.value.ogrn, "1027700132195");
});

test("validateVerificationPayload не требует наименование у ИП", () => {
  const result = validateVerificationPayload({ inn: "500100732259" });
  assert.equal(result.ok, true);
  assert.equal(result.value.legalName, "");
  assert.equal(isIndividualInn(result.value.inn), true);
});

test("validateVerificationPayload проверяет ОГРН и адрес", () => {
  const badOgrn = validateVerificationPayload({
    inn: "7707083893",
    legalName: "ООО Тест",
    ogrn: "1027700132196",
  });
  assert.equal(badOgrn.ok, false);
  assert.match(badOgrn.fields.ogrn, /ОГРН/);

  const longAddress = validateVerificationPayload({
    inn: "7707083893",
    legalName: "ООО Тест",
    legalAddress: "а".repeat(301),
  });
  assert.equal(longAddress.ok, false);
  assert.match(longAddress.fields.legalAddress, /адрес/i);
});

test("validateCompanyLegalFields допускает пустые поля и проверяет заполненные", () => {
  const empty = validateCompanyLegalFields({});
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.value, { inn: "", legalName: "", ogrn: "", legalAddress: "" });

  const invalid = validateCompanyLegalFields({ inn: "7707083894" });
  assert.equal(invalid.ok, false);
  assert.match(invalid.fields.inn, /ИНН/);

  const valid = validateCompanyLegalFields({ inn: "7707083893", legalName: "ООО Тест" });
  assert.equal(valid.ok, true);
});

test("validateVerificationDecision требует причину при отклонении", () => {
  const approved = validateVerificationDecision({ decision: "approved" });
  assert.equal(approved.ok, true);
  assert.equal(approved.value.reason, "");

  const missingReason = validateVerificationDecision({ decision: "rejected" });
  assert.equal(missingReason.ok, false);
  assert.equal(missingReason.fields.reason, "Укажите причину отклонения.");

  const shortReason = validateVerificationDecision({ decision: "rejected", reason: "их" });
  assert.equal(shortReason.ok, false);
  assert.match(shortReason.fields.reason, /минимум/);

  const rejected = validateVerificationDecision({ decision: "rejected", reason: "ИНН не совпадает с ЕГРЮЛ" });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.value.reason, "ИНН не совпадает с ЕГРЮЛ");

  const invalidDecision = validateVerificationDecision({ decision: "maybe" });
  assert.equal(invalidDecision.ok, false);
  assert.match(invalidDecision.fields.decision, /approved/);
});
