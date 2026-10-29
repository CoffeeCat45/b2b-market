import { useContext, useEffect } from "react";
import { MarketplaceDataContext } from "../context/MarketplaceDataContext";

export function useMarketplaceData() {
  const value = useContext(MarketplaceDataContext);
  const reload = value?.reload;

  // Кэш живёт 60 секунд: при заходе на страницу проверяем свежесть и при необходимости обновляем.
  useEffect(() => {
    if (reload) void reload({ force: false });
  }, [reload]);

  if (!value) {
    throw new Error("useMarketplaceData должен использоваться внутри MarketplaceDataProvider.");
  }

  return value;
}
