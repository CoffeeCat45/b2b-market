function SearchEmptyState({ neuralMode, hasQuery, onEnableNeural, onReset }) {
  const suggestNeural = !neuralMode && hasQuery;

  return (
    <div className="empty-state card">
      <h2>{suggestNeural ? "По словам ничего не нашлось" : "Ничего не найдено"}</h2>
      <p>
        {suggestNeural
          ? "Нейропоиск ищет по смыслу и понимает синонимы: «уборка» найдёт «клининг». Модель работает прямо в браузере."
          : "Попробуйте изменить запрос или сбросить фильтры."}
      </p>
      <div className="empty-state-actions">
        {suggestNeural ? (
          <button type="button" className="button button-primary" onClick={onEnableNeural}>
            Включить нейропоиск
          </button>
        ) : null}
        <button type="button" className="button button-secondary" onClick={onReset}>
          Сбросить фильтры
        </button>
      </div>
    </div>
  );
}

export default SearchEmptyState;
