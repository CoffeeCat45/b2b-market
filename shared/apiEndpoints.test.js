import test from "node:test";
import assert from "node:assert/strict";
import { DIRECT_API_BASE, buildApiCandidates, normalizeApiBase } from "./apiEndpoints.js";

test("normalizeApiBase убирает завершающие слеши", () => {
  assert.equal(normalizeApiBase("https://api.example.com/api///"), "https://api.example.com/api");
  assert.equal(normalizeApiBase(null), "");
});

test("buildApiCandidates ставит основной адрес первым и не дублирует прямой", () => {
  assert.deepEqual(buildApiCandidates("https://proxy.workers.dev/api/"), [
    "https://proxy.workers.dev/api",
    DIRECT_API_BASE,
  ]);
  assert.deepEqual(buildApiCandidates(DIRECT_API_BASE), [DIRECT_API_BASE]);
});

test("buildApiCandidates отдаёт только прямой адрес, если основной не задан", () => {
  assert.deepEqual(buildApiCandidates(""), [DIRECT_API_BASE]);
  assert.deepEqual(buildApiCandidates(undefined), [DIRECT_API_BASE]);
});
