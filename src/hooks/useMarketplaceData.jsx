import { useContext, useEffect } from "react";
import { MARKETPLACE_CACHE_TTL_MS, MarketplaceDataContext } from "../context/MarketplaceDataContext";

export function useMarketplaceData() {
  const value = useContext(MarketplaceDataContext);
  const reload = value?.reload;
  const updatedAt = value?.updatedAt || 0;

  // Кэш живёт 5 минут: обновляем только протухший. Первая загрузка всегда на провайдере,
  // иначе страница и провайдер стартуют двумя одинаковыми наборами запросов.
  useEffect(() => {
    if (!reload || !updatedAt) return;
    if (Date.now() - updatedAt >= MARKETPLACE_CACHE_TTL_MS) void reload({ force: true });
  }, [reload, updatedAt]);

  if (!value) {
    throw new Error("useMarketplaceData должен использоваться внутри MarketplaceDataProvider.");
  }

  return value;
}
