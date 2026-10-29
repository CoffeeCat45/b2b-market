import { useMarketplaceData } from "../hooks/useMarketplaceData";

function DataRefreshNotice() {
  const { refreshError, refreshing, reload } = useMarketplaceData();

  if (!refreshError) return null;

  return (
    <div className="data-refresh-banner" role="status" aria-live="polite">
      <span>Не удалось обновить данные: {refreshError}</span>
      <button type="button" className="button button-ghost" onClick={() => reload()} disabled={refreshing}>
        {refreshing ? "Обновляем…" : "Повторить"}
      </button>
    </div>
  );
}

export default DataRefreshNotice;
