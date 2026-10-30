import { pipeline } from "@huggingface/transformers";
import {
  EMBEDDING_MODEL_IDS,
  buildOrderEmbeddingText,
  cosineSimilarity,
  formatEmbeddingInput,
  getEmbeddingModel,
  getSemanticMatchPercent,
  validateEmbeddingVector,
} from "../shared/embeddings.js";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, value = ""] = argument.replace(/^--/, "").split("=");
    return [key, value];
  }),
);
const requestedModel = args.get("model") || "compact";

if (requestedModel !== "all" && !EMBEDDING_MODEL_IDS.includes(requestedModel)) {
  console.error(`Неизвестная модель: ${requestedModel}. Доступны: all, ${EMBEDDING_MODEL_IDS.join(", ")}.`);
  process.exit(1);
}

const modelIds = requestedModel === "all" ? [...EMBEDDING_MODEL_IDS] : [requestedModel];

const ORDERS = [
  {
    id: "cold",
    title: "Сервис промышленного холодильного оборудования",
    category: "Промышленное оборудование",
    cityMajor: "Москва",
    locationDetail: "Складской комплекс",
    city: "Москва",
    summary: "Плановое техобслуживание и аварийный ремонт холодильных камер на складах и пищевых производствах.",
    description: "Выезжаем круглосуточно, устраняем утечки хладагента, меняем компрессоры, ведём сервисные журналы.",
    terms: "Договор на годовое обслуживание, оплата по факту.",
    tags: ["холодильные камеры", "сервис", "ремонт"],
  },
  {
    id: "coffee",
    title: "Обжарка и оптовая продажа кофе",
    category: "Продукты питания",
    cityMajor: "Москва",
    locationDetail: "",
    city: "Москва",
    summary: "Поставляем арабику собственной обжарки для кофеен и ресторанов, работаем с HoReCa.",
    description: "Свежая обжарка под заказ, дегустации для команды, стабильные поставки два раза в неделю.",
    terms: "Минимальная партия 10 кг, отсрочка 14 дней.",
    tags: ["кофе", "обжарка", "HoReCa"],
  },
  {
    id: "web",
    title: "Разработка корпоративных сайтов и порталов",
    category: "IT и разработка",
    cityMajor: "Санкт-Петербург",
    locationDetail: "",
    city: "Санкт-Петербург",
    summary: "Проектируем и запускаем сайты, интернет-магазины и личные кабинеты для компаний.",
    description: "Аналитика, дизайн, вёрстка, интеграции с CRM и оплатами, поддержка после запуска.",
    terms: "Фиксированная смета, этапы с приёмкой.",
    tags: ["сайты", "порталы", "интеграции"],
  },
  {
    id: "cleaning",
    title: "Уборка офисов и производственных помещений",
    category: "Клининг",
    cityMajor: "Москва",
    locationDetail: "",
    city: "Москва",
    summary: "Ежедневный клининг, генеральная уборка и обслуживание прилегающих территорий.",
    description: "Свои расходники и техника, ночные смены, закреплённый менеджер объекта.",
    terms: "Оплата ежемесячно, договор от трёх месяцев.",
    tags: ["клининг", "офис", "уборка"],
  },
  {
    id: "logistics",
    title: "Доставка сборных грузов по России",
    category: "Логистика",
    cityMajor: "Москва",
    locationDetail: "",
    city: "Москва",
    summary: "Перевозки сборных партий, консолидация на складе и доставка до двери по всей стране.",
    description: "Отслеживание на каждом этапе, страхование груза, работа с документами.",
    terms: "Оплата по маршрутным листам.",
    tags: ["перевозки", "сборные грузы", "склад"],
  },
  {
    id: "accounting",
    title: "Бухгалтерское сопровождение бизнеса",
    category: "Финансы и учёт",
    cityMajor: "Екатеринбург",
    locationDetail: "",
    city: "Екатеринбург",
    summary: "Ведение учёта, подготовка и сдача налоговой отчётности, консультации по налогам.",
    description: "Работаем с ООО и ИП, восстанавливаем учёт, проходим проверки вместе с клиентом.",
    terms: "Абонентская плата, договор на год.",
    tags: ["бухгалтерия", "налоги", "отчётность"],
  },
];

const QUERIES = [
  { text: "нужно обслуживать морозильные установки на пищевом производстве", expected: "cold" },
  { text: "ищу поставщика обжаренных зёрен для кофейни", expected: "coffee" },
  { text: "хочу заказать сайт с личным кабинетом для компании", expected: "web" },
  { text: "ищу клининговую компанию для ежедневной уборки офиса", expected: "cleaning" },
  { text: "перевозка сборных партий груза между городами", expected: "logistics" },
  { text: "ведение бухгалтерии и сдача отчётности", expected: "accounting" },
];

async function embedAll(extractor, model, texts, { query = false } = {}) {
  const inputs = texts.map((text) => formatEmbeddingInput(model.id, text, { query }));
  const output = await extractor(inputs, { pooling: model.pooling, normalize: true });
  const rows = output.tolist();

  if (!Array.isArray(rows) || rows.length !== texts.length) {
    throw new Error("Модель вернула неожиданное количество векторов.");
  }

  return rows.map((row) => {
    const validation = validateEmbeddingVector(row, model.id);
    if (!validation.ok) throw new Error(validation.error);
    return validation.value;
  });
}

function formatPercent(percent) {
  return percent === null ? "  —" : `${String(percent).padStart(3)}%`;
}

async function runModel(modelId) {
  const model = getEmbeddingModel(modelId);
  console.log(`\nМодель: ${modelId} (${model.huggingFaceId}), порог ${model.semanticThreshold.toFixed(2)}`);

  const extractor = await pipeline("feature-extraction", model.huggingFaceId, {
    ...(model.modelFile ? { model_file_name: model.modelFile } : {}),
    ...(model.dtype ? { dtype: model.dtype } : {}),
  });

  let passed = 0;

  try {
    const orderVectors = await embedAll(extractor, model, ORDERS.map(buildOrderEmbeddingText));

    for (const { text, expected } of QUERIES) {
      const [queryVector] = await embedAll(extractor, model, [text], { query: true });
      const ranked = ORDERS
        .map((order, index) => ({
          id: order.id,
          title: order.title,
          score: cosineSimilarity(queryVector, orderVectors[index]),
        }))
        .sort((left, right) => right.score - left.score);

      const expectedEntry = ranked.find((entry) => entry.id === expected);
      const top = ranked[0];
      const percent = getSemanticMatchPercent(expectedEntry.score, model.semanticThreshold);
      const ok = top.id === expected && percent !== null;
      if (ok) passed += 1;

      console.log(`\nЗапрос: «${text}»`);
      for (const entry of ranked.slice(0, 3)) {
        const marker = entry.id === expected ? " ← ожидаемый заказ" : "";
        console.log(
          `  ${entry.id.padEnd(11)} ${entry.score.toFixed(4)}  ${formatPercent(
            getSemanticMatchPercent(entry.score, model.semanticThreshold),
          )}  ${entry.title}${marker}`,
        );
      }

      if (top.id !== expected) {
        console.log(`  ПРОВАЛ: первым идёт ${top.id}, ожидался ${expected}.`);
      } else if (percent === null) {
        console.log(`  ПРОВАЛ: сходство ${expectedEntry.score.toFixed(4)} ниже порога модели.`);
      } else {
        console.log(`  ОК: ожидаемый заказ на первом месте, сходство ${expectedEntry.score.toFixed(4)}.`);
      }
    }
  } finally {
    if (typeof extractor.dispose === "function") {
      await extractor.dispose();
    }
  }

  console.log(`\nИтог по модели ${modelId}: ${passed}/${QUERIES.length} проверок пройдено.`);
  return passed === QUERIES.length;
}

let allPassed = true;

for (const modelId of modelIds) {
  allPassed = (await runModel(modelId)) && allPassed;
}

if (!allPassed) process.exitCode = 1;
