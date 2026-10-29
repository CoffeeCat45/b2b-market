import { useEffect, useRef, useState } from "react";
import {
  SEARCH_MODELS,
  SEARCH_MODES,
  getSearchPreferences,
  saveSearchPreferences,
} from "../lib/searchPreferences";
import { getEmbeddingModel } from "../../shared/embeddings";
import { useEmbeddingModelPresence } from "../hooks/useEmbeddingModelPresence";
import { preloadEmbeddingModel } from "../lib/embeddingClient";

function getPresenceInfo(presence, sizeMb, progress) {
  if (presence === "ready" || presence === "cached") {
    return { tone: "ready", text: "Модель уже скачана на это устройство." };
  }

  if (presence === "downloading") {
    const value = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
    return {
      tone: "loading",
      text: value > 0
        ? `Модель скачивается на это устройство — ${value}%.`
        : "Модель скачивается на это устройство…",
    };
  }

  if (presence === "error") {
    return { tone: "error", text: "Не удалось скачать модель — попробуйте ещё раз." };
  }

  if (presence === "absent") {
    return {
      tone: "muted",
      text: `Модель ещё не скачана — загрузится при первом поиске${sizeMb ? ` (~${sizeMb} МБ)` : ""}.`,
    };
  }

  if (presence === "unknown") {
    return { tone: "muted", text: "Браузер не сообщает, сохранена ли модель на устройстве." };
  }

  return null;
}

function SearchSettingsModal({ onClose }) {
  const [preferences, setPreferences] = useState(() => getSearchPreferences());
  const closeButtonRef = useRef(null);
  const isNeural = preferences.mode === "neural";
  const activeMode = SEARCH_MODES.find((option) => option.value === preferences.mode) || SEARCH_MODES[0];
  const activeModel = SEARCH_MODELS.find((option) => option.value === preferences.model) || SEARCH_MODELS[0];
  const modelPresence = useEmbeddingModelPresence(preferences.model, isNeural);
  const presenceInfo = getPresenceInfo(
    modelPresence.state,
    getEmbeddingModel(preferences.model)?.approximateSizeMb,
    modelPresence.progress,
  );
  const canDownload = isNeural && ["absent", "unknown", "error"].includes(modelPresence.state);
  const isDownloading = modelPresence.state === "downloading";

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = () => {
    saveSearchPreferences(preferences);
    onClose();
  };

  const handleDownload = () => {
    preloadEmbeddingModel(preferences.model).catch(() => {});
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card card search-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="search-settings-title">Настройки поиска</h2>
            <p>Выберите, как искать и какая модель будет использоваться.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="button button-secondary modal-close"
            onClick={onClose}
            aria-label="Закрыть настройки"
          >
            ×
          </button>
        </div>

        <div className="search-settings-note">
          Настройка хранится только в этом браузере и не синхронизируется с компанией.
        </div>

        <div className="search-settings-grid">
          <label className="search-settings-field">
            <span>Режим поиска</span>
            <select
              name="searchMode"
              value={preferences.mode}
              onChange={(event) => setPreferences((current) => ({ ...current, mode: event.target.value }))}
            >
              {SEARCH_MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>{activeMode.hint}</small>
          </label>

          <label className={`search-settings-field${isNeural ? "" : " is-disabled"}`}>
            <span>Нейросетевая модель</span>
            <select
              name="searchModel"
              value={preferences.model}
              onChange={(event) => setPreferences((current) => ({ ...current, model: event.target.value }))}
              disabled={!isNeural}
            >
              {SEARCH_MODELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>{isNeural ? activeModel.hint : "Используется только в нейросетевом режиме."}</small>
          </label>
        </div>

        {isNeural ? (
          <div className="search-settings-model-state">
            {presenceInfo ? (
              <span className={`search-settings-presence is-${presenceInfo.tone}`} role="status">
                <span className="search-semantic-dot" aria-hidden="true" />
                {presenceInfo.text}
              </span>
            ) : null}
            {canDownload ? (
              <button type="button" className="button button-secondary search-settings-download" onClick={handleDownload}>
                Скачать модель
              </button>
            ) : null}
            {isDownloading ? (
              <span
                className="search-settings-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={modelPresence.progress}
              >
                <span style={{ width: `${modelPresence.progress}%` }} />
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="button button-primary" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

export default SearchSettingsModal;
