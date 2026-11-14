import test from "node:test";
import assert from "node:assert/strict";
import { DIRECT_API_BASE, buildApiCandidates, normalizeApiBase } from "./apiEndpoints.js";

test("normalizeApiBase убирает завершающие слеши", () => {
  assert.equal(normalizeApiBase("https://api.example.com/api///"), "https://api.example.com/api");
  assert.equal(normalizeApiBase(null), "");
});

test("buildApiCandidates отдаёт один маршрут: основной адрес без запасного прямого", () => {
  assert.deepEqual(buildApiCandidates("https://proxy.workers.dev/api/"), ["https://proxy.workers.dev/api"]);
  assert.deepEqual(buildApiCandidates(DIRECT_API_BASE), [DIRECT_API_BASE]);
});

test("buildApiCandidates берёт прямой адрес, если основной не задан", () => {
  assert.deepEqual(buildApiCandidates(""), [DIRECT_API_BASE]);
  assert.deepEqual(buildApiCandidates(undefined), [DIRECT_API_BASE]);
});
