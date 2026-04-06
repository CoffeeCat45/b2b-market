import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function useMarketplaceData() {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [ordersData, suppliersData, companiesData] = await Promise.all([
        apiFetch("/orders"),
        apiFetch("/suppliers"),
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
