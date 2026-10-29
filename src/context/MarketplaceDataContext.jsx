import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { CONNECTION_RESTORED_EVENT } from "../lib/connection";
import { useAuth } from "./AuthContext";

const CACHE_TTL_MS = 60000;
const EMPTY_DATA = { orders: [], suppliers: [], companies: [], updatedAt: 0 };

export const MarketplaceDataContext = createContext(null);

export function MarketplaceDataProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || "";
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");

  const dataRef = useRef(EMPTY_DATA);
  const requestRef = useRef(null);
  const generationRef = useRef(0);
  const lastRequestFailedRef = useRef(false);

  const load = useCallback(async ({ force = true } = {}) => {
    const now = Date.now();

    if (!force && dataRef.current.updatedAt && now - dataRef.current.updatedAt < CACHE_TTL_MS) {
      return dataRef.current;
    }

    if (requestRef.current) {
      return requestRef.current;
    }

    const generation = generationRef.current;
    const hasData = dataRef.current.updatedAt > 0;

    if (hasData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    setRefreshError("");

    const request = (async () => {
      try {
        const [ordersData, suppliersData, companiesData] = await Promise.all([
          apiFetch("/orders", { skipAuth: true }),
          apiFetch("/suppliers", { skipAuth: true }),
          apiFetch("/companies"),
        ]);

        if (generation !== generationRef.current) return dataRef.current;

        const nextData = {
          orders: Array.isArray(ordersData) ? ordersData : [],
          suppliers: Array.isArray(suppliersData) ? suppliersData : [],
          companies: Array.isArray(companiesData) ? companiesData : [],
          updatedAt: Date.now(),
        };

        dataRef.current = nextData;
        setData(nextData);
        lastRequestFailedRef.current = false;
        return nextData;
      } catch (loadError) {
        if (generation !== generationRef.current) return dataRef.current;

        lastRequestFailedRef.current = true;

        // Ошибка обновления не стирает уже показанные данные.
        if (dataRef.current.updatedAt > 0) {
          setRefreshError(loadError.message);
        } else {
          setError(loadError.message);
        }

        return dataRef.current;
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    requestRef.current = request;

    try {
      return await request;
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
      }
    }
  }, []);

  // Смена пользователя меняет видимость контактов в /companies, поэтому кэш сбрасывается.
  useEffect(() => {
    generationRef.current += 1;
    requestRef.current = null;
    dataRef.current = EMPTY_DATA;
    lastRequestFailedRef.current = false;
    setData(EMPTY_DATA);
    setError("");
    setRefreshError("");
    setRefreshing(false);
    setLoading(true);
    void load({ force: true });
  }, [userId, load]);

  useEffect(() => {
    const handleRestored = () => {
      const stale = !dataRef.current.updatedAt || Date.now() - dataRef.current.updatedAt > CACHE_TTL_MS;
      if (stale || lastRequestFailedRef.current) {
        void load({ force: true });
      }
    };

    window.addEventListener(CONNECTION_RESTORED_EVENT, handleRestored);
    return () => window.removeEventListener(CONNECTION_RESTORED_EVENT, handleRestored);
  }, [load]);

  return (
    <MarketplaceDataContext.Provider
      value={{
        orders: data.orders,
        suppliers: data.suppliers,
        companies: data.companies,
        loading,
        refreshing,
        error,
        refreshError,
        reload: load,
      }}
    >
      {children}
    </MarketplaceDataContext.Provider>
  );
}
