const STOP_WORDS = new Set(["и", "в", "на", "для", "по", "с", "от", "до", "не", "или", "а", "из", "у", "к"]);

const SYNONYM_GROUPS = [
  ["поставка", "опт", "снабжение"],
  ["упаковка", "тара"],
  ["логистика", "перевозки", "доставка"],
  ["производство", "изготовление"],
  ["оборудование", "техника"],
  ["it", "сайт", "разработка"],
  ["маркетинг", "реклама", "лидогенерация"],
  ["закупка", "снабжение"],
  ["строительство", "отделка"],
  ["холод", "рефрижератор"],
];

const synonymsByWord = new Map();

for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    const related = synonymsByWord.get(word) || new Set();
    for (const synonym of group) {
      if (synonym !== word) related.add(synonym);
    }
    synonymsByWord.set(word, related);
  }
}

const ORDER_FIELDS = [
  { key: "title", weight: 5, phraseBonus: 3 },
  { key: "tags", weight: 3.5, phraseBonus: 2 },
  { key: "category", weight: 3, phraseBonus: 2 },
  { key: "company", weight: 2 },
  { key: "summary", weight: 1.5 },
  { key: "cityMajor", weight: 1.2 },
  { key: "locationDetail", weight: 0.8 },
  { key: "description", weight: 0.7 },
  { key: "terms", weight: 0.5 },
];

const SUPPLIER_FIELDS = [
  { key: "name", weight: 5, phraseBonus: 3 },
  { key: "skills", weight: 3.5, phraseBonus: 2 },
  { key: "industry", weight: 3, phraseBonus: 2 },
  { key: "summary", weight: 2.5 },
  { key: "description", weight: 1.2 },
  { key: "city", weight: 1 },
];

export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(value) {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  return normalized
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function areSynonyms(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return false;
  return Boolean(synonymsByWord.get(a)?.has(b));
}

function damerauLevenshtein(left, right) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );

      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }

  return matrix[left.length][right.length];
}

function matchToken(queryToken, fieldToken) {
  if (queryToken === fieldToken) return 1;
  if (areSynonyms(queryToken, fieldToken)) return 0.85;
  if (fieldToken.startsWith(queryToken)) return 0.7;
  if (queryToken.startsWith(fieldToken)) return 0.65;
  if (fieldToken.includes(queryToken)) return 0.45;

  const shortest = Math.min(queryToken.length, fieldToken.length);
  if (shortest < 4) return 0;

  const distance = damerauLevenshtein(queryToken, fieldToken);
  if (distance <= 1) return 0.5;
  if (shortest >= 8 && distance <= 2) return 0.35;
  return 0;
}

function fieldText(item, key) {
  const value = item?.[key];
  return normalizeText(Array.isArray(value) ? value.join(" ") : value);
}

function searchItems(items, query, fields) {
  const queryTokens = tokenize(query);
  const normalizedQuery = normalizeText(query);
  if (!queryTokens.length || !normalizedQuery) return [];

  const results = [];

  for (const item of items) {
    if (!item) continue;

    const fieldData = fields.map((field) => {
      const text = fieldText(item, field.key);
      return {
        ...field,
        text,
        tokens: tokenize(text),
      };
    });

    const matchedTokens = new Set();
    let score = 0;
    const matchedFields = [];

    for (const field of fieldData) {
      let quality = 0;

      for (const token of field.tokens) {
        for (const queryToken of queryTokens) {
          const match = matchToken(queryToken, token);
          if (match > 0) matchedTokens.add(queryToken);
          if (match > quality) quality = match;
        }
      }

      if (quality > 0) {
        score += field.weight * quality;
        matchedFields.push(field.key);
      }
    }

    if (!matchedTokens.size) continue;

    const coverage = matchedTokens.size / queryTokens.length;
    score *= 0.6 + 0.4 * coverage;

    for (const field of fieldData) {
      if (field.phraseBonus && field.text.includes(normalizedQuery)) {
        score += field.phraseBonus;
      }
    }

    if (score > 0) {
      results.push({ item, score, matchedFields });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function searchOrders(orders, query) {
  return searchItems(Array.isArray(orders) ? orders : [], query, ORDER_FIELDS);
}

export function searchSuppliers(suppliers, query) {
  return searchItems(Array.isArray(suppliers) ? suppliers : [], query, SUPPLIER_FIELDS);
}
