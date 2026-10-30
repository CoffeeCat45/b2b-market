import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import FilterSidebar from "../components/FilterSidebar";
import ListingCard from "../components/ListingCard";
import AsyncState from "../components/AsyncState";
import SearchEmptyState from "../components/SearchEmptyState";
import SearchSemanticStatus from "../components/SearchSemanticStatus";
import { useAuth } from "../context/AuthContext";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { useSearchPreferences } from "../hooks/useSearchPreferences";
import { saveSearchPreferences } from "../lib/searchPreferences";
import { useSemanticSearch } from "../hooks/useSemanticSearch";
import { useEmbeddingModelPresence } from "../hooks/useEmbeddingModelPresence";
import { DATE_FILTER_OPTIONS, matchesDateFilter, parseDateValue } from "../lib/date";
import { searchOrders } from "../../shared/search.js";
import { getOrderCompatibility } from "../../shared/compatibility.js";
import { getEmbeddingModel, getSemanticMatchPercent, rankHybridResults } from "../../shared/embeddings.js";

const SORT_OPTIONS = [
  { value: "relevance", label: "По релевантности" },
  { value: "date_desc", label: "Сначала свежие" },
  { value: "popular_desc", label: "Сначала популярные" },
  { value: "max_budget_asc", label: "По цене: максимум по возрастанию" },
  { value: "min_budget_desc", label: "По цене: минимум по убыванию" },
];

function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = searchParams.get("category") ?? "";
  const urlMatch = searchParams.get("match") ?? "";
  const urlSort = searchParams.get("sort") ?? "";
  const wantsCompatibility = urlMatch === "profile" || urlSort === "compatibility";
  const [query, setQuery] = useState(urlQuery);
  const [category, setCategory] = useState(urlCategory);
  const [dateFilter, setDateFilter] = useState("all");
  const [majorCityInput, setMajorCityInput] = useState("");
  const [appliedMajorCity, setAppliedMajorCity] = useState("");
  const [majorCityHint, setMajorCityHint] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [sortBy, setSortBy] = useState(wantsCompatibility ? "compatibility" : urlQuery.trim() ? "relevance" : "date_desc");
  const sortManualRef = useRef(false);
  const { user, loading: authLoading } = useAuth();
  const { orders, companies, loading, error, reload } = useMarketplaceData();
  const searchPreferences = useSearchPreferences();

  const categories = useMemo(() => [...new Set(orders.map((item) => item.category))], [orders]);
  const userCompany = useMemo(() => {
    if (!user?.companyId) return null;

    const ownCompany = companies.find((company) => company.id === user.companyId);
    if (ownCompany) {
      return {
        id: ownCompany.id,
        industry: ownCompany.industry,
        city: ownCompany.city,
        specializations: ownCompany.specializations,
      };
    }

    return {
      id: user.companyId,
      industry: user.industry,
      city: user.companyCity,
      specializations: user.specializations,
    };
  }, [companies, user]);

  const sortOptions = useMemo(
    () => (userCompany ? [{ value: "compatibility", label: "По совместимости" }, ...SORT_OPTIONS] : SORT_OPTIONS),
    [userCompany],
  );

  useEffect(() => {
    if (wantsCompatibility && userCompany && !sortManualRef.current) {
      setSortBy("compatibility");
    }
  }, [wantsCompatibility, userCompany]);

  useEffect(() => {
    if (authLoading || userCompany || sortBy !== "compatibility") return;
    setSortBy(urlQuery.trim() ? "relevance" : "date_desc");
  }, [authLoading, userCompany, sortBy, urlQuery]);

  const syncUrl = useCallback((nextQuery, nextCategory) => {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextCategory.trim()) params.set("category", nextCategory.trim());
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    setQuery(urlQuery);
    setCategory(urlCategory);
  }, [urlQuery, urlCategory]);

  useEffect(() => {
    if (loading || !category || !categories.length || categories.includes(category)) return;

    setCategory("");
    syncUrl(query, "");
  }, [loading, categories, category, query, syncUrl]);

  const handleQueryChange = (value) => {
    setQuery(value);
    if (!sortManualRef.current) {
      if (wantsCompatibility && userCompany) {
        setSortBy("compatibility");
      } else {
        setSortBy(value.trim() ? "relevance" : "date_desc");
      }
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
  const majorCityOptions = useMemo(
    () => [...new Set(orders.map((item) => item.cityMajor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [orders],
  );

  const majorCitySuggestions = useMemo(() => {
    const normalized = majorCityInput.trim().toLowerCase();
    if (!normalized) return majorCityOptions.slice(0, 8);

    return majorCityOptions
      .filter((city) => city.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [majorCityOptions, majorCityInput]);

  const normalizedAppliedMajorCity = useMemo(
    () => majorCityOptions.find((city) => city.toLowerCase() === appliedMajorCity.trim().toLowerCase()) || "",
    [majorCityOptions, appliedMajorCity],
  );

  const locationOptions = useMemo(() => {
    if (!normalizedAppliedMajorCity) return [];

    return [...new Set(
      orders
        .filter((item) => item.cityMajor === normalizedAppliedMajorCity)
        .map((item) => item.locationDetail)
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, "ru"));
  }, [orders, normalizedAppliedMajorCity]);

  const locationSuggestions = useMemo(() => {
    const normalized = locationInput.trim().toLowerCase();
    if (!normalized) return locationOptions.slice(0, 8);

    return locationOptions
      .filter((location) => location.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [locationOptions, locationInput]);

  const budgetValidation = useMemo(() => {
    const rawMin = minBudget === "" ? null : Number(minBudget);
    const rawMax = maxBudget === "" ? null : Number(maxBudget);
    const invalidNumber = (value) => value !== null && (!Number.isFinite(value) || value < 0);
    const hasInvalid = invalidNumber(rawMin) || invalidNumber(rawMax);
    const rangeInvalid = !hasInvalid && rawMin !== null && rawMax !== null && rawMin > rawMax;
    const ignore = hasInvalid || rangeInvalid;

    return {
      min: ignore ? null : rawMin,
      max: ignore ? null : rawMax,
      hint: hasInvalid
        ? "Бюджет должен быть неотрицательным числом."
        : rangeInvalid
          ? "Минимум бюджета не может быть больше максимума."
          : "",
    };
  }, [minBudget, maxBudget]);

  const baseFilteredOrders = useMemo(() => {
    const normalizedMin = budgetValidation.min;
    const normalizedMax = budgetValidation.max;
    const majorCityQuery = appliedMajorCity.trim().toLowerCase();
    const locationQuery = appliedLocation.trim().toLowerCase();

    return orders.filter((item) => {
      const matchesCategory = !category || item.category === category;
      const matchesDate = matchesDateFilter(item.publishedAt, dateFilter);
      const matchesMajorCity = !majorCityQuery || (item.cityMajor || "").toLowerCase() === majorCityQuery;
      const matchesLocation = !locationQuery || (item.locationDetail || "").toLowerCase() === locationQuery;
      const matchesMinBudget = normalizedMin === null || item.budgetTo >= normalizedMin;
      const matchesMaxBudget = normalizedMax === null || item.budgetFrom <= normalizedMax;
      return matchesCategory && matchesDate && matchesMajorCity && matchesLocation && matchesMinBudget && matchesMaxBudget;
    });
  }, [orders, category, dateFilter, appliedMajorCity, appliedLocation, budgetValidation]);

  const neuralMode = searchPreferences.mode === "neural";
  const semanticEnabled = neuralMode && Boolean(query.trim());
  const semanticSearch = useSemanticSearch({
    enabled: semanticEnabled,
    modelId: searchPreferences.model,
    entityType: "order",
    items: baseFilteredOrders,
    query,
  });
  const modelPresence = useEmbeddingModelPresence(searchPreferences.model, neuralMode);
  const semanticThreshold = getEmbeddingModel(searchPreferences.model)?.semanticThreshold ?? 0;

  const enableNeuralSearch = () => saveSearchPreferences({ ...searchPreferences, mode: "neural" });

  const lexicalResults = useMemo(() => (
    query.trim()
      ? searchOrders(baseFilteredOrders, query)
      : baseFilteredOrders.map((item) => ({ item, score: 0 }))
  ), [baseFilteredOrders, query]);

  const semanticStatus = semanticSearch.status;
  const semanticReady = semanticStatus === "ready" || semanticStatus === "no-matches";
  const semanticOnly = semanticEnabled
    && semanticReady
    && semanticSearch.scores.size > 0
    && lexicalResults.length === 0;
  const weakSemantic = semanticOnly && semanticStatus === "no-matches";

  const semanticMatchMap = useMemo(() => {
    if (!semanticEnabled || !semanticReady || !semanticSearch.scores.size) return null;

    const map = new Map();
    for (const [id, score] of semanticSearch.scores) {
      const strong = score >= semanticThreshold;
      if (!semanticOnly && !strong) continue;
      const percent = getSemanticMatchPercent(score, semanticThreshold, { weak: !strong });
      if (percent !== null) map.set(id, percent);
    }
    return map.size ? map : null;
  }, [semanticEnabled, semanticReady, semanticOnly, semanticSearch.scores, semanticThreshold]);

  const filteredOrders = useMemo(() => {
    const useSemantic = semanticEnabled
      && semanticSearch.scores.size > 0
      && (semanticStatus === "ready" || semanticOnly);

    let results = useSemantic
      ? rankHybridResults(baseFilteredOrders, {
        lexicalScores: new Map(lexicalResults.map((entry) => [entry.item.id, entry.score])),
        semanticScores: semanticSearch.scores,
        semanticThreshold: semanticOnly ? 0 : semanticThreshold,
      })
      : lexicalResults;

    if (semanticOnly) {
      results = results.slice(0, 5);
    }

    const compatibilityScores = new Map();
    if (sortBy === "compatibility" && userCompany) {
      for (const entry of results) {
        compatibilityScores.set(entry.item.id, getOrderCompatibility(userCompany, entry.item)?.score ?? -1);
      }
    }

    results.sort((a, b) => {
      if (sortBy === "compatibility" && userCompany) {
        const compatibilityDiff = (compatibilityScores.get(b.item.id) ?? -1) - (compatibilityScores.get(a.item.id) ?? -1);
        if (compatibilityDiff !== 0) return compatibilityDiff;
      }

      if (sortBy === "relevance") {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
      }

      if (sortBy === "popular_desc") {
        const viewsDiff = (b.item.viewsCount || 0) - (a.item.viewsCount || 0);
        if (viewsDiff !== 0) return viewsDiff;
      }

      if (sortBy === "max_budget_asc") {
        return a.item.budgetTo - b.item.budgetTo;
      }

      if (sortBy === "min_budget_desc") {
        return b.item.budgetFrom - a.item.budgetFrom;
      }

      const aDate = parseDateValue(a.item.publishedAt)?.getTime() || 0;
      const bDate = parseDateValue(b.item.publishedAt)?.getTime() || 0;
      return bDate - aDate;
    });

    return results.map((entry) => entry.item);
  }, [baseFilteredOrders, lexicalResults, sortBy, userCompany, semanticEnabled, semanticOnly, semanticStatus, semanticSearch.scores, semanticThreshold]);

  const applyMajorCity = (value) => {
    const trimmed = value.trim();
    const normalized = trimmed.toLowerCase();
    const matched = majorCityOptions.find((city) => city.toLowerCase() === normalized) || "";
    setAppliedMajorCity(matched);
    setMajorCityInput(matched || trimmed);
    setMajorCityHint(trimmed && !matched ? `Город «${trimmed}» не найден в объявлениях — фильтр по городу не применён.` : "");
    setAppliedLocation("");
    setLocationInput("");
    setLocationHint("");
  };

  const applyLocation = (value) => {
    const trimmed = value.trim();
    const normalized = trimmed.toLowerCase();
    const matched = locationOptions.find((location) => location.toLowerCase() === normalized) || "";
    setAppliedLocation(matched);
    setLocationInput(matched || trimmed);
    setLocationHint(trimmed && !matched ? `Район «${trimmed}» не найден — фильтр по району не применён.` : "");
  };

  const resetFilters = () => {
    setQuery("");
    setCategory("");
    setSearchParams(new URLSearchParams(), { replace: true });
    setDateFilter("all");
    setMajorCityInput("");
    setAppliedMajorCity("");
    setMajorCityHint("");
    setLocationInput("");
    setAppliedLocation("");
    setLocationHint("");
    setMinBudget("");
    setMaxBudget("");
    sortManualRef.current = false;
    setSortBy("date_desc");
  };

  return (
    <Layout>
      <section className="catalog-section">
        <div className="container">
          <div className="section-heading compact">
            <h1>Каталог заказов</h1>
            <p>
              {loading
                ? "Загружаем объявления…"
                : error
                  ? "Каталог временно недоступен."
                  : `${filteredOrders.length} объявлений для поиска подрядчиков и поставщиков.`}
            </p>
          </div>
          <div className="catalog-layout">
            <FilterSidebar
              title="Фильтры заказов"
              searchValue={query}
              onSearchChange={handleQueryChange}
              selectedCategory={category}
              onCategoryChange={handleCategoryChange}
              categories={categories}
              dateFilterValue={dateFilter}
              onDateFilterChange={setDateFilter}
              dateFilterOptions={DATE_FILTER_OPTIONS}
              dateFilterLabel="Дата публикации"
              majorCityOptions={majorCityOptions}
              selectedMajorCity={majorCityInput}
              onMajorCityChange={(value) => {
                setMajorCityInput(value);
                setMajorCityHint("");
                if (!value.trim()) {
                  setAppliedMajorCity("");
                  setLocationInput("");
                  setAppliedLocation("");
                  setLocationHint("");
                }
              }}
              onMajorCityBlur={() => applyMajorCity(majorCityInput)}
              majorCitySuggestions={majorCitySuggestions}
              onMajorCitySuggestionPick={applyMajorCity}
              majorCityHint={majorCityHint}
              locationOptions={locationOptions}
              selectedLocation={locationInput}
              onLocationChange={(value) => {
                setLocationInput(value);
                setLocationHint("");
                if (!value.trim()) {
                  setAppliedLocation("");
                }
              }}
              onLocationBlur={() => applyLocation(locationInput)}
              locationSuggestions={locationSuggestions}
              onLocationSuggestionPick={applyLocation}
              locationHint={locationHint}
              majorCityLabel="Областной центр"
              locationLabel="Пригород / район"
              rangeTitle="Бюджет, ₽"
              minValue={minBudget}
              maxValue={maxBudget}
              onMinChange={setMinBudget}
              onMaxChange={setMaxBudget}
              minPlaceholder="от 1000"
              maxPlaceholder="до 10000"
              rangeHint={budgetValidation.hint}
              onReset={resetFilters}
            />
            <div className="catalog-content">
              {loading || error ? (
                <AsyncState loading={loading} error={error} onRetry={reload} loadingText="Загружаем объявления…" />
              ) : (
                <>
                  <SearchSemanticStatus
                    enabled={neuralMode}
                    active={semanticEnabled}
                    status={semanticSearch.status}
                    modelStatus={semanticSearch.modelStatus}
                    presence={modelPresence.state}
                    presenceProgress={modelPresence.progress}
                    weakResults={weakSemantic}
                    error={semanticSearch.error}
                  />
                  {filteredOrders.length ? (
                    <>
                      <div className="catalog-toolbar card">
                        <span>Сортировка</span>
                        <label className="catalog-sort-control">
                          <span className="visually-hidden">Сортировка заказов</span>
                          <select name="ordersSort" value={sortBy} onChange={(event) => handleSortChange(event.target.value)}>
                            {sortOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="catalog-list">
                        {filteredOrders.map((item) => (
                          <ListingCard
                            key={item.id}
                            item={item}
                            onTagClick={handleQueryChange}
                            compatibility={getOrderCompatibility(userCompany, item)}
                            semanticMatch={semanticMatchMap?.get(item.id) ?? null}
                            contractorsHref={
                              user?.companyId && item.companyId === user.companyId
                                ? `/suppliers?order=${encodeURIComponent(item.id)}`
                                : ""
                            }
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <SearchEmptyState
                      neuralMode={neuralMode}
                      hasQuery={Boolean(query.trim())}
                      onEnableNeural={enableNeuralSearch}
                      onReset={resetFilters}
                    />
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

export default OrdersPage;
