import { useEffect, useState } from "react";
import { cosineSimilarity, getEmbeddingModel } from "../../shared/embeddings";
import { embedQuery, getEmbeddingModelStatus, subscribeEmbeddingStatus } from "../lib/embeddingClient";
import { loadEmbeddingIndex } from "../lib/embeddingIndex";

const QUERY_DEBOUNCE_MS = 350;
const EMPTY_SCORES = new Map();

export function useSemanticSearch({ enabled, modelId, entityType, items, query }) {
  const [scores, setScores] = useState(EMPTY_SCORES);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [modelStatus, setModelStatus] = useState(() => getEmbeddingModelStatus(modelId));
  const [index, setIndex] = useState(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const queryText = String(query ?? "").trim();

  useEffect(() => {
    if (!enabled) {
      setDebouncedQuery("");
      return undefined;
    }

    const timer = window.setTimeout(() => setDebouncedQuery(queryText), QUERY_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, queryText]);

  useEffect(() => {
    setModelStatus(getEmbeddingModelStatus(modelId));
    if (!enabled) return undefined;

    return subscribeEmbeddingStatus((changedModelId, nextStatus) => {
      if (changedModelId === modelId) setModelStatus(nextStatus);
    });
  }, [enabled, modelId]);

  useEffect(() => {
    if (!enabled) {
      setIndex(null);
      setScores(EMPTY_SCORES);
      setStatus("idle");
      setError("");
      return undefined;
    }

    let active = true;
    setIndex(null);
    setScores(EMPTY_SCORES);
    setStatus("loading-index");
    setError("");

    loadEmbeddingIndex(modelId)
      .then((data) => {
        if (!active) return;
        setIndex(data);
        setStatus((data.byType[entityType]?.size ?? 0) ? "index-ready" : "empty");
      })
      .catch((loadError) => {
        if (!active) return;
        setStatus("error");
        setError(loadError.message || "Не удалось загрузить нейроиндекс.");
      });

    return () => {
      active = false;
    };
  }, [enabled, modelId, entityType]);

  useEffect(() => {
    if (!enabled || !index || !debouncedQuery) return undefined;

    const vectors = index.byType[entityType];
    if (!vectors?.size) return undefined;

    let active = true;
    setStatus("embedding");
    setError("");

    embedQuery(modelId, debouncedQuery)
      .then((queryVector) => {
        if (!active) return;
        if (!queryVector) {
          setScores(EMPTY_SCORES);
          setStatus("no-matches");
          return;
        }

        const nextScores = new Map();
        for (const item of Array.isArray(items) ? items : []) {
          const vector = vectors.get(item.id);
          if (vector) nextScores.set(item.id, cosineSimilarity(queryVector, vector));
        }

        const threshold = getEmbeddingModel(modelId)?.semanticThreshold ?? 0;
        const matched = [...nextScores.values()].filter((score) => score >= threshold).length;

        setScores(nextScores);
        setStatus(matched ? "ready" : "no-matches");
      })
      .catch((embedError) => {
        if (!active) return;
        setScores(EMPTY_SCORES);
        setStatus("error");
        setError(embedError.message || "Не удалось выполнить нейропоиск.");
      });

    return () => {
      active = false;
    };
  }, [enabled, index, debouncedQuery, modelId, entityType, items]);

  return { scores, status, error, modelStatus };
}
