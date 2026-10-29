function getStatusText(status, modelStatus) {
  if (status === "loading-index") return { tone: "loading", text: "Нейропоиск: загружаем смысловые векторы…" };
  if (status === "index-ready") return { tone: "loading", text: "Нейропоиск: готовим запрос…" };
  if (status === "empty") {
    return { tone: "muted", text: "Нейропоиск: векторы ещё не подготовлены — используется обычный поиск." };
  }
  if (status === "no-matches") {
    return { tone: "muted", text: "Нейропоиск: смысловых совпадений не нашлось — используется обычный поиск." };
  }
  if (status === "error") {
    return { tone: "error", text: "Нейропоиск недоступен — используется обычный поиск." };
  }
  if (status === "ready") return { tone: "ready", text: "Нейропоиск: учтены смысловые совпадения." };

  if (status === "embedding") {
    if (modelStatus?.stage === "error") {
      return { tone: "error", text: "Нейропоиск недоступен — используется обычный поиск." };
    }

    if (modelStatus?.stage === "loading") {
      const progress = Number.isFinite(modelStatus.progress) ? Math.min(100, Math.max(0, modelStatus.progress)) : 0;
      return {
        tone: "loading",
        text: progress > 0 ? `Нейропоиск: загружаем модель — ${progress}%.` : "Нейропоиск: загружаем модель…",
        progress,
      };
    }

    return { tone: "loading", text: "Нейропоиск: сравниваем запрос по смыслу…" };
  }

  return null;
}

function getPresenceText(presence, modelStatus, progress) {
  if (modelStatus?.stage === "error" || presence === "error") {
    return { tone: "error", text: "Нейропоиск включён: модель не загрузилась — попробуйте повторить запрос." };
  }

  if (modelStatus?.stage === "loading" || presence === "downloading") {
    const value = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
    return {
      tone: "loading",
      text: value > 0
        ? `Нейропоиск включён: модель скачивается на это устройство — ${value}%.`
        : "Нейропоиск включён: модель скачивается на это устройство…",
      progress: value,
    };
  }

  if (presence === "ready" || presence === "cached") {
    return { tone: "ready", text: "Нейропоиск включён: модель уже на этом устройстве." };
  }

  if (presence === "absent") {
    return { tone: "muted", text: "Нейропоиск включён: модель скачается при первом запросе." };
  }

  if (presence === "unknown") {
    return { tone: "muted", text: "Нейропоиск включён." };
  }

  return null;
}

function SearchSemanticStatus({ enabled = false, active, status, modelStatus, presence = "unknown", presenceProgress = 0, error }) {
  if (!enabled) return null;

  const display = active
    ? getStatusText(status, modelStatus)
    : getPresenceText(presence, modelStatus, presenceProgress);
  if (!display) return null;

  return (
    <div
      className={`search-semantic-status is-${display.tone}`}
      role="status"
      aria-live="polite"
      title={error || undefined}
    >
      <span className="search-semantic-dot" aria-hidden="true" />
      <span className="search-semantic-text">{display.text}</span>
      {Number.isFinite(display.progress) && display.progress < 100 ? (
        <span
          className="search-semantic-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={display.progress}
        >
          <span style={{ width: `${display.progress}%` }} />
        </span>
      ) : null}
    </div>
  );
}

export default SearchSemanticStatus;
