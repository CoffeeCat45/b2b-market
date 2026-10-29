import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import ListingCard from "../components/ListingCard";
import CompanyCard from "../components/CompanyCard";
import AsyncState from "../components/AsyncState";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { parseDateValue } from "../lib/date";
import { normalizeText } from "../../shared/search.js";

function topValues(values, limit) {
  const counts = new Map();

  for (const raw of values) {
    const text = String(raw || "").trim();
    const key = normalizeText(text);
    if (!key) continue;

    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(key, { value: text, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ru"))
    .slice(0, limit)
    .map((entry) => entry.value);
}

function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("orders");
  const { orders, suppliers, loading, error, reload } = useMarketplaceData();

  const categories = useMemo(() => [...new Set(orders.map((item) => item.category))], [orders]);
  const supplierIndustries = useMemo(
    () => [...new Set(suppliers.map((item) => item.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [suppliers],
  );
  const topOrderTags = useMemo(
    () => topValues(orders.flatMap((item) => (Array.isArray(item.tags) ? item.tags : [])), 4),
    [orders],
  );
  const topSupplierSkills = useMemo(
    () => topValues(suppliers.flatMap((item) => (Array.isArray(item.skills) ? item.skills : [])), 4),
    [suppliers],
  );
  const searchSuggestions = useMemo(() => {
    const pools = [
      categories.map((value) => ({ value, type: "orders", label: "категория" })),
      supplierIndustries.map((value) => ({ value, type: "suppliers", label: "отрасль" })),
      topOrderTags.map((value) => ({ value, type: "orders", label: "тег" })),
      topSupplierSkills.map((value) => ({ value, type: "suppliers", label: "навык" })),
    ];
    const seen = new Set();
    const result = [];
    const maxDepth = Math.max(0, ...pools.map((pool) => pool.length));

    for (let index = 0; index < maxDepth; index += 1) {
      for (const pool of pools) {
        const suggestion = pool[index];
        if (!suggestion) continue;

        const key = `${suggestion.type}:${normalizeText(suggestion.value)}`;
        if (seen.has(key)) continue;

        seen.add(key);
        result.push(suggestion);
      }
    }

    return result;
  }, [categories, supplierIndustries, topOrderTags, topSupplierSkills]);
  const featuredOrders = useMemo(() => (
    [...orders]
      .sort((a, b) => (parseDateValue(b.publishedAt ?? b.date)?.getTime() || 0) - (parseDateValue(a.publishedAt ?? a.date)?.getTime() || 0))
      .slice(0, 6)
  ), [orders]);
  const featuredSuppliers = useMemo(() => suppliers.slice(0, 3), [suppliers]);
  const freshSuppliers = useMemo(() => {
    const sortedSuppliers = [...suppliers].sort((a, b) => (
      (parseDateValue(b.createdAt)?.getTime() || 0) - (parseDateValue(a.createdAt)?.getTime() || 0)
    ));

    return sortedSuppliers.slice(0, 5);
  }, [suppliers]);
  const focusOrder = useMemo(() => {
    const freshestOrders = [...orders]
      .sort((a, b) => (parseDateValue(b.publishedAt ?? b.date)?.getTime() || 0) - (parseDateValue(a.publishedAt ?? a.date)?.getTime() || 0))
      .slice(0, 5);

    if (!freshestOrders.length) return null;

    return freshestOrders[Math.floor(Math.random() * freshestOrders.length)];
  }, [orders]);
  const focusSupplier = useMemo(() => {
    if (!freshSuppliers.length) return null;
    return freshSuppliers[Math.floor(Math.random() * freshSuppliers.length)];
  }, [freshSuppliers]);

  const handleSearch = (event) => {
    event.preventDefault();
    const target = type === "orders" ? "/orders" : "/suppliers";
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    const search = params.toString();
    navigate(search ? `${target}?${search}` : target);
  };

  const openFeaturedOrder = () => {
    if (focusOrder?.id) {
      navigate(`/listing/${focusOrder.id}`);
    } else {
      navigate("/orders");
    }
  };

  const openFeaturedSupplier = () => {
    if (focusSupplier?.companyId) {
      navigate(`/company/${focusSupplier.companyId}`);
    } else {
      navigate("/suppliers");
    }
  };

  const openCategory = (category) => {
    const params = new URLSearchParams();
    params.set("category", category);
    navigate(`/orders?${params.toString()}`);
  };

  return (
    <Layout>
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <h1>Партнёры для бизнеса в одном месте</h1>
            <p>
              B2B Connect помогает компаниям быстро публиковать запросы, искать подрядчиков
              и сравнивать предложения в привычном формате каталога.
            </p>
            <SearchBar
              query={query}
              type={type}
              onQueryChange={setQuery}
              onTypeChange={setType}
              onSubmit={handleSearch}
              suggestions={searchSuggestions}
            />
            <div className="hero-metrics">
              <div>
                <strong>{loading || error ? "—" : orders.length}</strong>
                <span>объявлений в каталоге</span>
              </div>
              <div>
                <strong>{loading || error ? "—" : suppliers.length}</strong>
                <span>активных поставщиков</span>
              </div>
              <div>
                <strong>{loading || error ? "—" : categories.length}</strong>
                <span>основных категорий</span>
              </div>
            </div>
          </div>

          <div className="hero-panel">
            <button type="button" className="hero-panel-card card-clickable" onClick={openFeaturedOrder}>
              <p>Сегодня в фокусе</p>
              <strong>{focusOrder?.title || "Актуальные заказы"}</strong>
              <span>{focusOrder ? `${focusOrder.company} · ${focusOrder.city}` : "B2B Connect"}</span>
            </button>
            <button type="button" className="hero-panel-card alternate card-clickable" onClick={openFeaturedSupplier}>
              <p>Новый поставщик</p>
              <strong>{focusSupplier?.name || "Проверенные поставщики"}</strong>
              <span>{focusSupplier?.summary || "Компании для B2B-сотрудничества и переговоров."}</span>
            </button>
          </div>
        </div>
      </section>

      {loading || error ? (
        <section className="section-block">
          <div className="container">
            <AsyncState loading={loading} error={error} onRetry={reload} loadingText="Загружаем каталог…" />
          </div>
        </section>
      ) : (
        <>
          <section className="section-block">
            <div className="container">
              <div className="section-heading">
                <h2>Популярные категории</h2>
              </div>
              <div className="category-grid">
                {categories.map((category) => (
                  <button key={category} type="button" className="category-card card-clickable" onClick={() => openCategory(category)}>
                    <h3>{category}</h3>
                    <p>Подбор подрядчиков и предложений в категории {category.toLowerCase()}.</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="section-block section-muted">
            <div className="container">
              <div className="section-heading">
                <h2>Актуальные заказы</h2>
              </div>
              <div className="cards-grid cards-grid-wide">
                {featuredOrders.map((item) => (
                  <ListingCard key={item.id} item={item} featured />
                ))}
              </div>
            </div>
          </section>

          <section className="section-block">
            <div className="container">
              <div className="section-heading">
                <h2>Проверенные поставщики</h2>
              </div>
              <div className="cards-grid suppliers-grid">
                {featuredSuppliers.map((item) => (
                  <CompanyCard key={item.id} supplier={item} />
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </Layout>
  );
}

export default HomePage;
