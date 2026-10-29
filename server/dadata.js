const DADATA_PARTY_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party";
const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const cache = new Map();
const inFlight = new Map();

function readTimeoutMs() {
  const value = Number.parseInt(process.env.DADATA_TIMEOUT_MS || "5000", 10);
  return Number.isFinite(value) && value >= 1000 && value <= 15000 ? value : 5000;
}

function getApiKey() {
  return String(process.env.DADATA_API_KEY || "").trim();
}

function readString(value, maxLength) {
  return value === undefined || value === null ? "" : String(value).trim().slice(0, maxLength);
}

function readDate(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function sanitizeParty(suggestion) {
  const data = suggestion?.data || {};
  const name = data.name || {};
  const address = data.address || {};
  const state = data.state || {};

  const party = {
    inn: readString(data.inn, 12),
    ogrn: readString(data.ogrn, 15),
    kpp: readString(data.kpp, 9),
    nameShort: readString(name.short_with_opf, 500),
    nameFull: readString(name.full_with_opf, 500),
    legalAddress: readString(address.unrestricted_value, 500),
    status: readString(state.status, 40),
    type: readString(data.type, 40),
    registrationDate: readDate(state.registration_date),
  };

  return party.inn ? party : null;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeCache(key, value, ttlMs) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function isDadataConfigured() {
  return Boolean(getApiKey());
}

export async function lookupPartyByInn(inn) {
  const apiKey = getApiKey();
  if (!apiKey) return { available: false, reason: "not_configured" };

  const cached = readCache(inn);
  if (cached) return cached;

  if (inFlight.has(inn)) return inFlight.get(inn);

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), readTimeoutMs());

    try {
      const response = await fetch(DADATA_PARTY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Token ${apiKey}`,
        },
        body: JSON.stringify({ query: inn, branch_type: "MAIN" }),
        signal: controller.signal,
      });

      if (response.status === 429) return { available: false, reason: "rate_limited" };
      if (!response.ok) return { available: false, reason: "error" };

      const payload = await response.json();
      const suggestion = Array.isArray(payload?.suggestions) ? payload.suggestions[0] : null;
      const party = suggestion ? sanitizeParty(suggestion) : null;

      if (!party) {
        const result = { available: false, reason: "not_found" };
        writeCache(inn, result, NOT_FOUND_TTL_MS);
        return result;
      }

      const result = { available: true, party };
      writeCache(inn, result, FOUND_TTL_MS);
      return result;
    } catch (error) {
      if (error?.name === "AbortError") return { available: false, reason: "timeout" };
      return { available: false, reason: "error" };
    } finally {
      clearTimeout(timeout);
      inFlight.delete(inn);
    }
  })();

  inFlight.set(inn, request);
  return request;
}
