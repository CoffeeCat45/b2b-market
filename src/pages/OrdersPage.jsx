import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import FilterSidebar from "../components/FilterSidebar";
import ListingCard from "../components/ListingCard";
import AsyncState from "../components/AsyncState";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { DATE_FILTER_OPTIONS, matchesDateFilter, parseDateValue } from "../lib/date";

const SORT_OPTIONS = [
  { value: "date_desc", label: "Сначала свежие" },
  { value: "popular_desc", label: "Сначала популярные" },
  { value: "max_budget_asc", label: "По цене: максимум по возрастанию" },
  { value: "min_budget_desc", label: "По цене: минимум по убыванию" },
];

function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = searchParams.get("category") ?? "";
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
  const [sortBy, setSortBy] = useState("date_desc");
  const { orders, loading, error, reload } = useMarketplaceData();

  const categories = useMemo(() => [...new Set(orders.map((item) => item.category))], [orders]);

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
    syncUrl(value, category);
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

  const filteredOrders = useMemo(() => {
    const normalizedMin = budgetValidation.min;
    const normalizedMax = budgetValidation.max;
    const majorCityQuery = appliedMajorCity.trim().toLowerCase();
    const locationQuery = appliedLocation.trim().toLowerCase();

    const nextOrders = orders.filter((item) => {
      const tagsText = Array.isArray(item.tags) ? item.tags.join(" ") : String(item.tags || "");
      const matchesQuery = !query || `${item.title} ${item.company} ${item.summary} ${tagsText}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !category || item.category === category;
      const matchesDate = matchesDateFilter(item.publishedAt, dateFilter);
      const matchesMajorCity = !majorCityQuery || (item.cityMajor || "").toLowerCase() === majorCityQuery;
      const matchesLocation = !locationQuery || (item.locationDetail || "").toLowerCase() === locationQuery;
      const matchesMinBudget = normalizedMin === null || item.budgetTo >= normalizedMin;
      const matchesMaxBudget = normalizedMax === null || item.budgetFrom <= normalizedMax;
      return matchesQuery && matchesCategory && matchesDate && matchesMajorCity && matchesLocation && matchesMinBudget && matchesMaxBudget;
    });

    return nextOrders.sort((a, b) => {
      if (sortBy === "popular_desc") {
        const viewsDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
        if (viewsDiff !== 0) return viewsDiff;
      }

      if (sortBy === "max_budget_asc") {
        return a.budgetTo - b.budgetTo;
      }

      if (sortBy === "min_budget_desc") {
        return b.budgetFrom - a.budgetFrom;
      }

      const aDate = parseDateValue(a.publishedAt)?.getTime() || 0;
      const bDate = parseDateValue(b.publishedAt)?.getTime() || 0;
      return bDate - aDate;
    });
  }, [orders, query, category, dateFilter, appliedMajorCity, appliedLocation, budgetValidation, sortBy]);

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
              ) : filteredOrders.length ? (
                <>
                  <div className="catalog-toolbar card">
                    <span>Сортировка</span>
                    <label className="catalog-sort-control">
                      <span className="visually-hidden">Сортировка заказов</span>
                      <select name="ordersSort" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                        {SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="catalog-list">
                    {filteredOrders.map((item) => <ListingCard key={item.id} item={item} onTagClick={handleQueryChange} />)}
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
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default OrdersPage;
