import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import FilterSidebar from "../components/FilterSidebar";
import ListingCard from "../components/ListingCard";
import { categories, orders } from "../data/orders";

function OrdersPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("");
  const [selectedCities, setSelectedCities] = useState([]);
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");

  const cityOptions = useMemo(() => {
    return [...new Set(orders.map((item) => item.city))].sort((left, right) =>
      left.localeCompare(right, "ru"),
    );
  }, []);

  const filteredOrders = useMemo(() => {
    const normalizedMin = minBudget ? Number(minBudget) : null;
    const normalizedMax = maxBudget ? Number(maxBudget) : null;

    return orders.filter((item) => {
      const matchesQuery =
        !query ||
        `${item.title} ${item.company} ${item.summary}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !category || item.category === category;
      const matchesCity = !selectedCities.length || selectedCities.includes(item.city);
      const matchesMinBudget = normalizedMin === null || item.budgetTo >= normalizedMin;
      const matchesMaxBudget = normalizedMax === null || item.budgetFrom <= normalizedMax;

      return matchesQuery && matchesCategory && matchesCity && matchesMinBudget && matchesMaxBudget;
    });
  }, [category, maxBudget, minBudget, query, selectedCities]);

  const toggleCity = (city) => {
    setSelectedCities((current) =>
      current.includes(city) ? current.filter((item) => item !== city) : [...current, city],
    );
  };

  const resetFilters = () => {
    setQuery(initialQuery);
    setCategory("");
    setSelectedCities([]);
    setMinBudget("");
    setMaxBudget("");
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
                <span>Сначала свежие</span>
                <span className="muted">Можно выбрать несколько городов и диапазон бюджета</span>
              </div>
              <div className="catalog-list">
                {filteredOrders.map((item) => (
                  <ListingCard key={item.id} item={item} />
                ))}
                {!filteredOrders.length ? (
                  <div className="empty-state card">
                    <h3>Ничего не найдено</h3>
                    <p>Попробуйте изменить фильтры или расширить диапазон бюджета.</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default OrdersPage;
