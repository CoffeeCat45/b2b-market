import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import FilterSidebar from "../components/FilterSidebar";
import CompanyCard from "../components/CompanyCard";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { DATE_FILTER_OPTIONS, matchesDateFilter, parseRussianDate } from "../lib/date";

function SuppliersPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedCities, setSelectedCities] = useState([]);
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const { suppliers, orders } = useMarketplaceData();

  const cityOptions = useMemo(() => [...new Set(suppliers.map((item) => item.city))].sort((a, b) => a.localeCompare(b, "ru")), [suppliers]);
  const supplierCategories = useMemo(() => [...new Set(suppliers.map((item) => item.industry))].sort((a, b) => a.localeCompare(b, "ru")), [suppliers]);
  const supplierActivityDates = useMemo(() => {
    const latestByCompany = new Map();

    orders.forEach((item) => {
      const parsedDate = parseRussianDate(item.date);
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) return;

      const current = latestByCompany.get(item.companyId);
      if (!current || parsedDate > current) {
        latestByCompany.set(item.companyId, parsedDate);
      }
    });

    return latestByCompany;
  }, [orders]);

  const filteredSuppliers = useMemo(() => {
    const normalizedMin = minRating ? Number(minRating) : null;
    const normalizedMax = maxRating ? Number(maxRating) : null;

    return suppliers.filter((item) => {
      const matchesQuery = !query || `${item.name} ${item.summary} ${item.description}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !category || item.industry === category;
      const lastActivity = supplierActivityDates.get(item.companyId);
      const matchesDate = dateFilter === "all" || (lastActivity && matchesDateFilter(lastActivity.toLocaleDateString("ru-RU"), dateFilter));
      const matchesCity = !selectedCities.length || selectedCities.includes(item.city);
      const matchesMinRating = normalizedMin === null || item.rating >= normalizedMin;
      const matchesMaxRating = normalizedMax === null || item.rating <= normalizedMax;
      return matchesQuery && matchesCategory && matchesDate && matchesCity && matchesMinRating && matchesMaxRating;
    });
  }, [suppliers, query, category, dateFilter, selectedCities, minRating, maxRating, supplierActivityDates]);

  const toggleCity = (city) => {
    setSelectedCities((current) => (current.includes(city) ? current.filter((item) => item !== city) : [...current, city]));
  };

  const resetFilters = () => {
    setQuery(initialQuery);
    setCategory("");
    setDateFilter("all");
    setSelectedCities([]);
    setMinRating("");
    setMaxRating("");
  };

  return (
    <Layout>
      <section className="catalog-section">
        <div className="container">
          <div className="section-heading compact">
            <h1>Каталог поставщиков</h1>
            <p>{filteredSuppliers.length} компаний с услугами, рейтингом и профилями.</p>
          </div>
          <div className="catalog-layout">
            <FilterSidebar
              title="Фильтры поставщиков"
              searchValue={query}
              onSearchChange={setQuery}
              selectedCategory={category}
              onCategoryChange={setCategory}
              categories={supplierCategories}
              dateFilterValue={dateFilter}
              onDateFilterChange={setDateFilter}
              dateFilterOptions={DATE_FILTER_OPTIONS}
              dateFilterLabel="Последняя активность"
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
              onReset={resetFilters}
            />
            <div className="catalog-content">
              <div className="catalog-toolbar card">
                <span>Рейтинг и экспертиза</span>
                
              </div>
              <div className="catalog-list company-list">
                {filteredSuppliers.map((item) => <CompanyCard key={item.id} supplier={item} />)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default SuppliersPage;


