import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import FilterSidebar from "../components/FilterSidebar";
import ListingCard from "../components/ListingCard";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { DATE_FILTER_OPTIONS, matchesDateFilter, parseRussianDate } from "../lib/date";

const SORT_OPTIONS = [
  { value: "date_desc", label: "Сначала свежие" },
  { value: "popular_desc", label: "Сначала популярные" },
  { value: "max_budget_asc", label: "По цене: максимум по возрастанию" },
  { value: "min_budget_desc", label: "По цене: минимум по убыванию" },
];

function OrdersPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const initialCategory = searchParams.get("category") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [dateFilter, setDateFilter] = useState("all");
  const [majorCityInput, setMajorCityInput] = useState("");
  const [appliedMajorCity, setAppliedMajorCity] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [appliedLocation, setAppliedLocation] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const { orders } = useMarketplaceData();

  const categories = useMemo(() => [...new Set(orders.map((item) => item.category))], [orders]);
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

  const filteredOrders = useMemo(() => {
    const normalizedMin = minBudget ? Number(minBudget) : null;
    const normalizedMax = maxBudget ? Number(maxBudget) : null;
    const majorCityQuery = appliedMajorCity.trim().toLowerCase();
    const locationQuery = appliedLocation.trim().toLowerCase();

    const nextOrders = orders.filter((item) => {
      const matchesQuery = !query || `${item.title} ${item.company} ${item.summary}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !category || item.category === category;
      const matchesDate = matchesDateFilter(item.date, dateFilter);
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

      const aDate = parseRussianDate(a.date)?.getTime() || 0;
      const bDate = parseRussianDate(b.date)?.getTime() || 0;
      return bDate - aDate;
    });
  }, [orders, query, category, dateFilter, appliedMajorCity, appliedLocation, minBudget, maxBudget, sortBy]);

  const applyMajorCity = (value) => {
    const normalized = value.trim().toLowerCase();
    const matched = majorCityOptions.find((city) => city.toLowerCase() === normalized) || "";
    setAppliedMajorCity(matched);
    setMajorCityInput(matched || value.trim());
    setAppliedLocation("");
    setLocationInput("");
  };

  const applyLocation = (value) => {
    const normalized = value.trim().toLowerCase();
    const matched = locationOptions.find((location) => location.toLowerCase() === normalized) || "";
    setAppliedLocation(matched);
    setLocationInput(matched || value.trim());
  };

  const resetFilters = () => {
    setQuery(initialQuery);
    setCategory(initialCategory);
    setDateFilter("all");
    setMajorCityInput("");
    setAppliedMajorCity("");
    setLocationInput("");
    setAppliedLocation("");
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
            <p>{filteredOrders.length} объявлений для поиска подрядчиков и поставщиков.</p>
          </div>
          <div className="catalog-layout">
            <FilterSidebar
              title="Фильтры заказов"
              searchValue={query}
              onSearchChange={setQuery}
              selectedCategory={category}
              onCategoryChange={setCategory}
              categories={categories}
              dateFilterValue={dateFilter}
              onDateFilterChange={setDateFilter}
              dateFilterOptions={DATE_FILTER_OPTIONS}
              dateFilterLabel="Дата публикации"
              majorCityOptions={majorCityOptions}
              selectedMajorCity={majorCityInput}
              onMajorCityChange={(value) => {
                setMajorCityInput(value);
                if (!value.trim()) {
                  setAppliedMajorCity("");
                  setLocationInput("");
                  setAppliedLocation("");
                }
              }}
              onMajorCityBlur={() => applyMajorCity(majorCityInput)}
              majorCitySuggestions={majorCitySuggestions}
              onMajorCitySuggestionPick={applyMajorCity}
              locationOptions={locationOptions}
              selectedLocation={locationInput}
              onLocationChange={(value) => {
                setLocationInput(value);
                if (!value.trim()) {
                  setAppliedLocation("");
                }
              }}
              onLocationBlur={() => applyLocation(locationInput)}
              locationSuggestions={locationSuggestions}
              onLocationSuggestionPick={applyLocation}
              majorCityLabel="Областной центр"
              locationLabel="Пригород / район"
              rangeTitle="Бюджет, ₽"
              minValue={minBudget}
              maxValue={maxBudget}
              onMinChange={setMinBudget}
              onMaxChange={setMaxBudget}
              minPlaceholder="от 1000"
              maxPlaceholder="до 10000"
              onReset={resetFilters}
            />
            <div className="catalog-content">
              <div className="catalog-toolbar card">
                <span>Сортировка</span>
                <label className="catalog-sort-control">
                  <span className="visually-hidden">Сортировка заказов</span>
                  <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="catalog-list">
                {filteredOrders.map((item) => <ListingCard key={item.id} item={item} />)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default OrdersPage;
