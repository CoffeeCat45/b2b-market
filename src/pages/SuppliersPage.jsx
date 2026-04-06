import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import FilterSidebar from "../components/FilterSidebar";
import CompanyCard from "../components/CompanyCard";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { DATE_FILTER_OPTIONS, matchesDateFilter, parseRussianDate } from "../lib/date";

const SORT_OPTIONS = [
  { value: "date_desc", label: "Сначала свежие" },
  { value: "rating_desc", label: "По рейтингу: высокий сначала" },
  { value: "rating_asc", label: "По рейтингу: низкий сначала" },
];

function SuppliersPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedCities, setSelectedCities] = useState([]);
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const { suppliers } = useMarketplaceData();

  const cityOptions = useMemo(() => [...new Set(suppliers.map((item) => item.city))].sort((a, b) => a.localeCompare(b, "ru")), [suppliers]);
  const supplierCategories = useMemo(() => [...new Set(suppliers.map((item) => item.industry))].sort((a, b) => a.localeCompare(b, "ru")), [suppliers]);

  const filteredSuppliers = useMemo(() => {
    const normalizedMin = minRating ? Number(minRating) : null;
    const normalizedMax = maxRating ? Number(maxRating) : null;

    const nextSuppliers = suppliers.filter((item) => {
      const matchesQuery = !query || `${item.name} ${item.summary} ${item.description} ${item.skills.join(" ")}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !category || item.industry === category;
      const matchesDate = matchesDateFilter(item.createdAt, dateFilter);
      const matchesCity = !selectedCities.length || selectedCities.includes(item.city);
      const matchesMinRating = normalizedMin === null || item.rating >= normalizedMin;
      const matchesMaxRating = normalizedMax === null || item.rating <= normalizedMax;
      return matchesQuery && matchesCategory && matchesDate && matchesCity && matchesMinRating && matchesMaxRating;
    });

    return nextSuppliers.sort((a, b) => {
      if (sortBy === "rating_desc") {
        return b.rating - a.rating;
      }

      if (sortBy === "rating_asc") {
        return a.rating - b.rating;
      }

      const dateA = parseRussianDate(a.createdAt)?.getTime() ?? 0;
      const dateB = parseRussianDate(b.createdAt)?.getTime() ?? 0;
      return dateB - dateA;
    });
  }, [suppliers, query, category, dateFilter, selectedCities, minRating, maxRating, sortBy]);

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
    setSortBy("date_desc");
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
              onReset={resetFilters}
            />
            <div className="catalog-content">
              <div className="catalog-toolbar card">
                <span>Сортировка</span>
                <label className="catalog-sort-control">
                  <span className="visually-hidden">Сортировка поставщиков</span>
                  <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="catalog-list company-list">
                {filteredSuppliers.map((item) => <CompanyCard key={item.id} supplier={item} onTagClick={setQuery} />)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default SuppliersPage;


