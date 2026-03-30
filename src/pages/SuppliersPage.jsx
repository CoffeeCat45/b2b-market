import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import FilterSidebar from "../components/FilterSidebar";
import CompanyCard from "../components/CompanyCard";
import { suppliers } from "../data/suppliers";

function SuppliersPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("");
  const [selectedCities, setSelectedCities] = useState([]);
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");

  const cityOptions = useMemo(() => {
    return [...new Set(suppliers.map((item) => item.city))].sort((left, right) =>
      left.localeCompare(right, "ru"),
    );
  }, []);

  const supplierCategories = useMemo(() => {
    return [...new Set(suppliers.map((item) => item.industry))].sort((left, right) =>
      left.localeCompare(right, "ru"),
    );
  }, []);

  const filteredSuppliers = useMemo(() => {
    const normalizedMin = minRating ? Number(minRating) : null;
    const normalizedMax = maxRating ? Number(maxRating) : null;

    return suppliers.filter((item) => {
      const matchesQuery =
        !query ||
        `${item.name} ${item.summary} ${item.description}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = !category || item.industry === category;
      const matchesCity = !selectedCities.length || selectedCities.includes(item.city);
      const matchesMinRating = normalizedMin === null || item.rating >= normalizedMin;
      const matchesMaxRating = normalizedMax === null || item.rating <= normalizedMax;

      return matchesQuery && matchesCategory && matchesCity && matchesMinRating && matchesMaxRating;
    });
  }, [category, maxRating, minRating, query, selectedCities]);

  const toggleCity = (city) => {
    setSelectedCities((current) =>
      current.includes(city) ? current.filter((item) => item !== city) : [...current, city],
    );
  };

  const resetFilters = () => {
    setQuery(initialQuery);
    setCategory("");
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
                <span className="muted">Карточка открывается по нажатию на весь блок</span>
              </div>
              <div className="catalog-list company-list">
                {filteredSuppliers.map((item) => (
                  <CompanyCard key={item.id} supplier={item} />
                ))}
                {!filteredSuppliers.length ? (
                  <div className="empty-state card">
                    <h3>Поставщики не найдены</h3>
                    <p>Попробуйте выбрать другой город или расширить диапазон рейтинга.</p>
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

export default SuppliersPage;
