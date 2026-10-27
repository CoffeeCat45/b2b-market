function AsyncState({
  loading,
  error,
  onRetry,
  loadingText = "Загружаем данные…",
  errorTitle = "Не удалось загрузить данные",
  children,
}) {
  if (loading) {
    return (
      <div className="async-state card" role="status" aria-live="polite">
        <span className="async-spinner" aria-hidden="true" />
        <p>{loadingText}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="async-state card" role="alert">
        <h2>{errorTitle}</h2>
        <p>{error}</p>
        {onRetry ? (
          <button type="button" className="button button-secondary" onClick={onRetry}>
            Повторить
          </button>
        ) : null}
      </div>
    );
  }

  return children;
}

export default AsyncState;
