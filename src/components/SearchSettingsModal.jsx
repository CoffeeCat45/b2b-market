import { useEffect, useRef, useState } from "react";
import {
  SEARCH_MODELS,
  SEARCH_MODES,
  getSearchPreferences,
  saveSearchPreferences,
} from "../lib/searchPreferences";

function SearchSettingsModal({ onClose }) {
  const [preferences, setPreferences] = useState(() => getSearchPreferences());
  const closeButtonRef = useRef(null);
  const isNeural = preferences.mode === "neural";
  const activeMode = SEARCH_MODES.find((option) => option.value === preferences.mode) || SEARCH_MODES[0];
  const activeModel = SEARCH_MODELS.find((option) => option.value === preferences.model) || SEARCH_MODELS[0];

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
