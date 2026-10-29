import { useEffect, useState } from "react";

function AsyncState({
  loading,
  error,
  onRetry,
  loadingText = "Загружаем данные…",
  slowAfterMs = 8000,
  slowLoadingText = "База данных просыпается, это может занять до минуты…",
  errorTitle = "Не удалось загрузить данные",
  children,
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }

    const timer = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(timer);
  }, [loading, slowAfterMs]);

  if (loading) {
    return (
      <div className="async-state card" role="status" aria-live="polite">
        <span className="async-spinner" aria-hidden="true" />
        <p>{slow ? slowLoadingText : loadingText}</p>
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
