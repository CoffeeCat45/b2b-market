import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import FilterSidebar from "../components/FilterSidebar";
import CompanyCard from "../components/CompanyCard";
import AsyncState from "../components/AsyncState";
import SearchSemanticStatus from "../components/SearchSemanticStatus";
import { useAuth } from "../context/AuthContext";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { useSearchPreferences } from "../hooks/useSearchPreferences";
import { useSemanticSearch } from "../hooks/useSemanticSearch";
import { DATE_FILTER_OPTIONS, matchesDateFilter, parseRussianDate } from "../lib/date";
import { searchSuppliers } from "../../shared/search.js";
import { getSupplierCompatibility } from "../../shared/compatibility.js";
import { getEmbeddingModel, rankHybridResults } from "../../shared/embeddings.js";

const SORT_OPTIONS = [
  { value: "relevance", label: "По релевантности" },
  { value: "date_desc", label: "Сначала свежие" },
  { value: "rating_desc", label: "По рейтингу: высокий сначала" },
  { value: "rating_asc", label: "По рейтингу: низкий сначала" },
];

function SuppliersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = searchParams.get("category") ?? "";
  const urlOrder = searchParams.get("order") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [category, setCategory] = useState(urlCategory);
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedCities, setSelectedCities] = useState([]);
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(urlOrder);
  const [sortBy, setSortBy] = useState(urlOrder ? "compatibility" : urlQuery.trim() ? "relevance" : "date_desc");
  const sortManualRef = useRef(false);
  const { user, loading: authLoading } = useAuth();
  const { suppliers, orders, loading, error, reload } = useMarketplaceData();
  const searchPreferences = useSearchPreferences();

  const myOrders = useMemo(() => {
    if (!user?.companyId) return [];
    return orders.filter((item) => item.companyId === user.companyId);
  }, [orders, user]);

  const selectedOrder = useMemo(
    () => myOrders.find((item) => item.id === selectedOrderId) || null,
    [myOrders, selectedOrderId],
  );

  const compatibilityMap = useMemo(() => {
    if (!selectedOrder) return null;

    const map = new Map();
    for (const supplier of suppliers) {
      map.set(supplier.id, getSupplierCompatibility(selectedOrder, supplier));
    }
    return map;
  }, [selectedOrder, suppliers]);

  const sortOptions = useMemo(
    () => (selectedOrder ? [{ value: "compatibility", label: "По совместимости" }, ...SORT_OPTIONS] : SORT_OPTIONS),
    [selectedOrder],
  );

  useEffect(() => {
    setSelectedOrderId(urlOrder);
  }, [urlOrder]);

  useEffect(() => {
    if (authLoading || loading || !selectedOrderId) return;

    if (!myOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId("");
      const params = new URLSearchParams(searchParams);
      params.delete("order");
      setSearchParams(params, { replace: true });
    }
  }, [authLoading, loading, myOrders, selectedOrderId, searchParams, setSearchParams]);

  useEffect(() => {
    if (selectedOrder && !sortManualRef.current) {
      setSortBy("compatibility");
    }
  }, [selectedOrder]);

  useEffect(() => {
    if (authLoading || loading || selectedOrder || sortBy !== "compatibility") return;
    setSortBy(query.trim() ? "relevance" : "date_desc");
  }, [authLoading, loading, selectedOrder, sortBy, query]);

  const cityOptions = useMemo(() => [...new Set(suppliers.map((item) => item.city))].sort((a, b) => a.localeCompare(b, "ru")), [suppliers]);
  const supplierCategories = useMemo(() => [...new Set(suppliers.map((item) => item.industry))].sort((a, b) => a.localeCompare(b, "ru")), [suppliers]);

  const syncUrl = useCallback((nextQuery, nextCategory, nextOrderId = selectedOrderId) => {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextCategory.trim()) params.set("category", nextCategory.trim());
    if (nextOrderId) params.set("order", nextOrderId);
    setSearchParams(params, { replace: true });
  }, [setSearchParams, selectedOrderId]);

  useEffect(() => {
    setQuery(urlQuery);
    setCategory(urlCategory);
  }, [urlQuery, urlCategory]);

  useEffect(() => {
    if (loading || !category || !supplierCategories.length || supplierCategories.includes(category)) return;

    setCategory("");
    syncUrl(query, "");
  }, [loading, supplierCategories, category, query, syncUrl]);

  const handleQueryChange = (value) => {
    setQuery(value);
    if (!sortManualRef.current) {
      setSortBy(selectedOrder ? "compatibility" : value.trim() ? "relevance" : "date_desc");
    }
    syncUrl(value, category);
  };

  const handleSortChange = (value) => {
    sortManualRef.current = true;
    setSortBy(value);
  };

  const handleCategoryChange = (value) => {
    setCategory(value);
    syncUrl(query, value);
  };

  const handleOrderChange = (event) => {
    const nextOrderId = event.target.value;
    setSelectedOrderId(nextOrderId);
    sortManualRef.current = false;
    setSortBy(nextOrderId ? "compatibility" : query.trim() ? "relevance" : "date_desc");

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category.trim()) params.set("category", category.trim());
    if (nextOrderId) params.set("order", nextOrderId);
    setSearchParams(params, { replace: true });
  };

  const ratingValidation = useMemo(() => {
    const rawMin = minRating === "" ? null : Number(minRating);
    const rawMax = maxRating === "" ? null : Number(maxRating);
    const invalidNumber = (value) => value !== null && (!Number.isFinite(value) || value < 1 || value > 5);
    const hasInvalid = invalidNumber(rawMin) || invalidNumber(rawMax);
    const rangeInvalid = !hasInvalid && rawMin !== null && rawMax !== null && rawMin > rawMax;
    const ignore = hasInvalid || rangeInvalid;

    return {
      min: ignore ? null : rawMin,
      max: ignore ? null : rawMax,
      hint: hasInvalid
        ? "Рейтинг должен быть числом от 1 до 5."
        : rangeInvalid
          ? "Минимум рейтинга не может быть больше максимума."
          : "",
    };
  }, [minRating, maxRating]);

  const baseFilteredSuppliers = useMemo(() => {
    const normalizedMin = ratingValidation.min;
    const normalizedMax = ratingValidation.max;

    return suppliers.filter((item) => {
      const matchesCategory = !category || item.industry === category;
      const matchesDate = matchesDateFilter(item.createdAt, dateFilter);
      const matchesCity = !selectedCities.length || selectedCities.includes(item.city);
      const matchesMinRating = normalizedMin === null || item.rating >= normalizedMin;
      const matchesMaxRating = normalizedMax === null || item.rating <= normalizedMax;
      return matchesCategory && matchesDate && matchesCity && matchesMinRating && matchesMaxRating;
    });
  }, [suppliers, category, dateFilter, selectedCities, ratingValidation]);

  const semanticEnabled = searchPreferences.mode === "neural" && Boolean(query.trim());
  const semanticSearch = useSemanticSearch({
    enabled: semanticEnabled,
    modelId: searchPreferences.model,
    entityType: "company",
    items: baseFilteredSuppliers,
    query,
  });

  const filteredSuppliers = useMemo(() => {
    const lexicalResults = query.trim()
      ? searchSuppliers(baseFilteredSuppliers, query)
      : baseFilteredSuppliers.map((item) => ({ item, score: 0 }));

    const results = semanticEnabled && semanticSearch.status === "ready" && semanticSearch.scores.size
      ? rankHybridResults(baseFilteredSuppliers, {
        lexicalScores: new Map(lexicalResults.map((entry) => [entry.item.id, entry.score])),
        semanticScores: semanticSearch.scores,
        semanticThreshold: getEmbeddingModel(searchPreferences.model)?.semanticThreshold ?? 0,
      })
      : lexicalResults;

    results.sort((a, b) => {
      if (sortBy === "compatibility" && compatibilityMap) {
        const compatibilityDiff = (compatibilityMap.get(b.item.id)?.score ?? -1) - (compatibilityMap.get(a.item.id)?.score ?? -1);
        if (compatibilityDiff !== 0) return compatibilityDiff;
      }

      if (sortBy === "relevance") {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
      }

      if (sortBy === "rating_desc") {
        return b.item.rating - a.item.rating;
      }

      if (sortBy === "rating_asc") {
        return a.item.rating - b.item.rating;
      }

      const dateA = parseRussianDate(a.item.createdAt)?.getTime() ?? 0;
      const dateB = parseRussianDate(b.item.createdAt)?.getTime() ?? 0;
      return dateB - dateA;
    });

    return results.map((entry) => entry.item);
  }, [baseFilteredSuppliers, query, sortBy, compatibilityMap, semanticEnabled, semanticSearch.status, semanticSearch.scores, searchPreferences.model]);

  const toggleCity = (city) => {
    setSelectedCities((current) => (current.includes(city) ? current.filter((item) => item !== city) : [...current, city]));
  };

  const resetFilters = () => {
    setQuery("");
    setCategory("");
    setSearchParams(new URLSearchParams(), { replace: true });
    setDateFilter("all");
    setSelectedCities([]);
    setMinRating("");
    setMaxRating("");
    setSelectedOrderId("");
    sortManualRef.current = false;
    setSortBy("date_desc");
  };

  return (
    <Layout>
      <section className="catalog-section">
        <div className="container">
          <div className="section-heading compact">
            <h1>Каталог поставщиков</h1>
            <p>
              {loading
                ? "Загружаем компании…"
                : error
                  ? "Каталог временно недоступен."
                  : `${filteredSuppliers.length} компаний с услугами, рейтингом и профилями.`}
            </p>
          </div>
          <div className="catalog-layout">
            <FilterSidebar
              title="Фильтры поставщиков"
              searchValue={query}
              onSearchChange={handleQueryChange}
              selectedCategory={category}
              onCategoryChange={handleCategoryChange}
              categories={supplierCategories}
              dateFilterValue={dateFilter}
              onDateFilterChange={setDateFilter}
              dateFilterOptions={DATE_FILTER_OPTIONS}
              dateFilterLabel="Дата регистрации"
              cityOptions={cityOptions}
              selectedCities={selectedCities}
              onToggleCity={toggleCity}
              rangeTitle="Рейтинг"
              minValue={minRating}
              maxValue={maxRating}
              onMinChange={setMinRating}
              onMaxChange={setMaxRating}
              minPlaceholder="от 4"
              maxPlaceholder="до 5"
              rangeMinValue={1}
              rangeMaxValue={5}
              rangeHint={ratingValidation.hint}
              onReset={resetFilters}
            />
            <div className="catalog-content">
              {loading || error ? (
                <AsyncState loading={loading} error={error} onRetry={reload} loadingText="Загружаем компании…" />
              ) : (
                <>
                  <SearchSemanticStatus
                    active={semanticEnabled}
                    status={semanticSearch.status}
                    modelStatus={semanticSearch.modelStatus}
                    error={semanticSearch.error}
                  />
                  {filteredSuppliers.length ? (
                    <>
                      <div className="catalog-toolbar card">
                        {myOrders.length ? (
                          <div className="catalog-toolbar-group">
                            <span>Подбор под заказ</span>
                            <label className="catalog-sort-control">
                              <span className="visually-hidden">Заказ для подбора подрядчиков</span>
                              <select name="suppliersMatchOrder" value={selectedOrderId} onChange={handleOrderChange}>
                                <option value="">Без заказа</option>
                                {myOrders.map((order) => (
                                  <option key={order.id} value={order.id}>
                                    {order.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ) : null}
                        <div className="catalog-toolbar-group">
                          <span>Сортировка</span>
                          <label className="catalog-sort-control">
                            <span className="visually-hidden">Сортировка поставщиков</span>
                            <select name="suppliersSort" value={sortBy} onChange={(event) => handleSortChange(event.target.value)}>
                              {sortOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                      <div className="catalog-list company-list">
                        {filteredSuppliers.map((item) => (
                          <CompanyCard
                            key={item.id}
                            supplier={item}
                            onTagClick={handleQueryChange}
                            compatibility={compatibilityMap?.get(item.id) ?? null}
                            compatibilityLabel="Соответствие заказу"
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state card">
                      <h2>Ничего не найдено</h2>
                      <p>Попробуйте изменить запрос или сбросить фильтры.</p>
                      <button type="button" className="button button-secondary" onClick={resetFilters}>
                        Сбросить фильтры
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default SuppliersPage;
