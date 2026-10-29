import { pipeline } from "@huggingface/transformers";
import { pool } from "../server/db.js";
import {
  EMBEDDING_MODEL_IDS,
  buildCompanyEmbeddingText,
  buildOrderEmbeddingText,
  formatEmbeddingInput,
  getEmbeddingModel,
  getEmbeddingSourceHash,
  validateEmbeddingVector,
} from "../shared/embeddings.js";

const BATCH_SIZE = 16;
const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, value = ""] = argument.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const requestedModel = args.get("model") || "all";
const dryRun = args.has("dry-run");

if (requestedModel !== "all" && !EMBEDDING_MODEL_IDS.includes(requestedModel)) {
  console.error(`Неизвестная модель: ${requestedModel}. Доступны: all, ${EMBEDDING_MODEL_IDS.join(", ")}.`);
  process.exit(1);
}

const modelIds = requestedModel === "all" ? [...EMBEDDING_MODEL_IDS] : [requestedModel];

async function loadRecords() {
  const [ordersResult, companiesResult] = await Promise.all([
    pool.query(
      `SELECT id, title, category, city_major AS "cityMajor", location_detail AS "locationDetail",
              city, summary, description, terms, tags
       FROM orders
       ORDER BY id ASC`,
    ),
    pool.query(
      `SELECT id, name, city, industry, description, about, specializations
       FROM companies
       ORDER BY id ASC`,
    ),
  ]);

  return [
    ...ordersResult.rows
      .map((order) => ({
        entityType: "order",
        entityId: order.id,
        text: buildOrderEmbeddingText(order),
      }))
      .filter((record) => record.text),
    ...companiesResult.rows
      .map((company) => ({
        entityType: "company",
        entityId: company.id,
        text: buildCompanyEmbeddingText(company),
      }))
      .filter((record) => record.text),
  ];
}

async function loadExistingHashes(modelId, entityType) {
  const result = await pool.query(
    `SELECT entity_id AS "entityId", source_hash AS "sourceHash"
     FROM content_embeddings
     WHERE model = $1 AND entity_type = $2`,
    [modelId, entityType],
  );
  return new Map(result.rows.map((row) => [row.entityId, row.sourceHash]));
}

async function saveVector(modelId, model, record, vector) {
  await pool.query(
    `INSERT INTO content_embeddings (entity_type, entity_id, model, dimensions, embedding, source_hash, updated_at)
     VALUES ($1, $2, $3, $4, $5::extensions.vector, $6, NOW())
     ON CONFLICT (entity_type, entity_id, model)
     DO UPDATE SET dimensions = EXCLUDED.dimensions,
                   embedding = EXCLUDED.embedding,
                   source_hash = EXCLUDED.source_hash,
                   updated_at = NOW()`,
    [
      record.entityType,
      record.entityId,
      modelId,
      model.dimensions,
      `[${vector.join(",")}]`,
      getEmbeddingSourceHash(modelId, record.text),
    ],
  );
}

async function processModel(modelId, records) {
  const model = getEmbeddingModel(modelId);
  const orderHashes = await loadExistingHashes(modelId, "order");
  const companyHashes = await loadExistingHashes(modelId, "company");
  const pending = records.filter((record) => {
    const hashes = record.entityType === "order" ? orderHashes : companyHashes;
    return hashes.get(record.entityId) !== getEmbeddingSourceHash(modelId, record.text);
  });

  console.log(`[${modelId}] записей: ${records.length}, требуют обновления: ${pending.length}.`);

  if (!pending.length) return 0;
  if (dryRun) return pending.length;

  console.log(`[${modelId}] загружаем модель ${model.huggingFaceId}…`);
  const extractor = await pipeline("feature-extraction", model.huggingFaceId, {
    ...(model.modelFile ? { model_file_name: model.modelFile } : {}),
    ...(model.dtype ? { dtype: model.dtype } : {}),
  });

  let processed = 0;

  try {
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
      const batch = pending.slice(offset, offset + BATCH_SIZE);
      const inputs = batch.map((record) => formatEmbeddingInput(modelId, record.text));
      const output = await extractor(inputs, { pooling: model.pooling, normalize: true });
      const rows = output.tolist();

      if (!Array.isArray(rows) || rows.length !== batch.length) {
        throw new Error("Модель вернула неожиданное количество векторов.");
      }

      for (let index = 0; index < batch.length; index += 1) {
        const validation = validateEmbeddingVector(rows[index], modelId);
        if (!validation.ok) {
          throw new Error(`Некорректный вектор для ${batch[index].entityType}:${batch[index].entityId}: ${validation.error}`);
        }
        await saveVector(modelId, model, batch[index], validation.value);
      }

      processed += batch.length;
      console.log(`[${modelId}] обработано ${processed} из ${pending.length}.`);
    }
  } finally {
    if (typeof extractor.dispose === "function") {
      await extractor.dispose();
    }
  }

  return processed;
}

async function main() {
  const records = await loadRecords();
  console.log(`Всего записей: ${records.length}. Режим: ${dryRun ? "проверка" : "запись"}.`);

  for (const modelId of modelIds) {
    await processModel(modelId, records);
  }

  console.log(dryRun ? "Проверка завершена." : "Готово.");
}

main()
  .catch((error) => {
    console.error("Не удалось обновить нейроиндекс:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
