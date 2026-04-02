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
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedCities, setSelectedCities] = useState([]);
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const { orders } = useMarketplaceData();

  const categories = useMemo(() => [...new Set(orders.map((item) => item.category))], [orders]);
  const cityOptions = useMemo(() => [...new Set(orders.map((item) => item.city))].sort((a, b) => a.localeCompare(b, "ru")), [orders]);

  const filteredOrders = useMemo(() => {
    const normalizedMin = minBudget ? Number(minBudget) : null;
    const normalizedMax = maxBudget ? Number(maxBudget) : null;

    const nextOrders = orders.filter((item) => {
      const matchesQuery = !query || `${item.title} ${item.company} ${item.summary}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !category || item.category === category;
      const matchesDate = matchesDateFilter(item.date, dateFilter);
      const matchesCity = !selectedCities.length || selectedCities.includes(item.city);
      const matchesMinBudget = normalizedMin === null || item.budgetTo >= normalizedMin;
      const matchesMaxBudget = normalizedMax === null || item.budgetFrom <= normalizedMax;
      return matchesQuery && matchesCategory && matchesDate && matchesCity && matchesMinBudget && matchesMaxBudget;
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
  }, [orders, query, category, dateFilter, selectedCities, minBudget, maxBudget, sortBy]);

  const toggleCity = (city) => {
    setSelectedCities((current) => (current.includes(city) ? current.filter((item) => item !== city) : [...current, city]));
  };

  const resetFilters = () => {
    setQuery(initialQuery);
    setCategory("");
    setDateFilter("all");
    setSelectedCities([]);
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
              cityOptions={cityOptions}
              selectedCities={selectedCities}
              onToggleCity={toggleCity}
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
