import { useEffect, useState } from "react";
import { getEmbeddingModelPresence, subscribeEmbeddingStatus } from "../lib/embeddingClient";

const CHECKING = Object.freeze({ state: "checking", progress: 0 });
const UNKNOWN = Object.freeze({ state: "unknown", progress: 0 });

export function useEmbeddingModelPresence(modelId, enabled = true) {
  const [presence, setPresence] = useState(CHECKING);

  useEffect(() => {
    if (!enabled) {
      setPresence(UNKNOWN);
      return undefined;
    }

    let active = true;
    setPresence(CHECKING);

    const refresh = () => {
      getEmbeddingModelPresence(modelId).then((state) => {
        if (!active) return;
        setPresence((current) => (
          current.state === "downloading" ? current : { state, progress: state === "ready" ? 100 : 0 }
        ));
      });
    };

    refresh();

    const unsubscribe = subscribeEmbeddingStatus((changedModelId, status) => {
      if (changedModelId !== modelId) return;

      if (status.stage === "ready") {
        setPresence({ state: "ready", progress: 100 });
      } else if (status.stage === "loading") {
        setPresence({
          state: "downloading",
          progress: Number.isFinite(status.progress) ? status.progress : 0,
        });
      } else if (status.stage === "error") {
        setPresence({ state: "error", progress: 0 });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled, modelId]);

  return presence;
}
