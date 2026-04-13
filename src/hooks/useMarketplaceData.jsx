import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function useMarketplaceData() {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Заказы, поставщики и компании грузятся вместе, потому что большинство экранов каталога завязаны на все три сущности.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [ordersData, suppliersData, companiesData] = await Promise.all([
        apiFetch("/orders", { skipAuth: true }),
        apiFetch("/suppliers", { skipAuth: true }),
        apiFetch("/companies"),
      ]);

      setOrders(ordersData);
      setSuppliers(suppliersData);
      setCompanies(companiesData);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { orders, suppliers, companies, loading, error, reload: load };
}

