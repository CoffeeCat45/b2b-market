import {
  formatEmbeddingInput,
  getEmbeddingModel,
  validateEmbeddingVector,
} from "../../shared/embeddings.js";

let transformers = null;
let activeModel = null;
let loadingModel = null;
let queue = Promise.resolve();

function post(message) {
  self.postMessage(message);
}

async function getTransformers() {
  if (!transformers) {
    const module = await import("@huggingface/transformers");
    module.env.allowLocalModels = false;
    module.env.allowRemoteModels = true;
    module.env.useBrowserCache = true;

    if (module.env.backends?.onnx?.wasm) {
      module.env.backends.onnx.wasm.numThreads = 1;
    }

    transformers = module;
  }

  return transformers;
}

async function getExtractor(modelId) {
  const model = getEmbeddingModel(modelId);
  if (!model) throw new Error("Неизвестная модель эмбеддингов.");

  if (activeModel?.modelId === modelId) return activeModel.extractor;
  if (loadingModel?.modelId === modelId) return loadingModel.promise;

  if (activeModel) {
    const previous = activeModel;
    activeModel = null;
    try {
      await previous.extractor.dispose?.();
    } catch {
      // Старую модель всё равно выгружаем из памяти.
    }
  }

  let lastProgress = -1;

  const promise = (async () => {
    const { pipeline } = await getTransformers();
    post({ type: "progress", modelId, stage: "loading", progress: 0, message: "Загружаем модель…" });

    const options = {
      device: "wasm",
      progress_callback(info) {
        if (!String(info?.file || "").endsWith(".onnx")) return;

        if (info.status === "done") {
          post({ type: "progress", modelId, stage: "loading", progress: 100, message: "Модель загружена." });
          return;
        }

        if (info.status !== "progress" || !Number.isFinite(info.progress)) return;

        const progress = Math.round(info.progress);
        if (progress === lastProgress) return;
        lastProgress = progress;
        post({ type: "progress", modelId, stage: "loading", progress, message: "Скачиваем модель…" });
      },
    };

    if (model.modelFile) options.model_file_name = model.modelFile;
    if (model.dtype) options.dtype = model.dtype;

    const extractor = await pipeline("feature-extraction", model.huggingFaceId, options);
    activeModel = { modelId, extractor };
    post({ type: "ready", modelId });
    return extractor;
  })();

  loadingModel = { modelId, promise };

  try {
    return await promise;
  } catch (error) {
    activeModel = null;
    post({
      type: "model-error",
      modelId,
      message: error?.message || "Не удалось загрузить нейросетевую модель.",
    });
    throw error;
  } finally {
    if (loadingModel?.promise === promise) loadingModel = null;
  }
}

async function handleEmbed({ requestId, modelId, text }) {
  try {
    const model = getEmbeddingModel(modelId);
    if (!model) throw new Error("Неизвестная модель эмбеддингов.");

    const input = formatEmbeddingInput(modelId, text, { query: true });
    if (!input) throw new Error("Пустой поисковый запрос.");

    const extractor = await getExtractor(modelId);
    const output = await extractor(input, { pooling: model.pooling, normalize: true });
    const rows = output.tolist();
    const vector = Array.isArray(rows?.[0]) ? rows[0] : rows;
    const validation = validateEmbeddingVector(vector, modelId);

    if (!validation.ok) throw new Error(validation.error);
    post({ type: "result", requestId, modelId, vector: validation.value });
  } catch (error) {
    post({
      type: "error",
      requestId,
      modelId,
      message: error?.message || "Не удалось выполнить нейропоиск.",
    });
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "embed") return;

  queue = queue.then(() => handleEmbed(data)).catch((error) => {
    post({
      type: "error",
      requestId: data.requestId,
      modelId: data.modelId,
      message: error?.message || "Не удалось выполнить нейропоиск.",
    });
  });
});
