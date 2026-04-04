import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import ListingCard from "../components/ListingCard";
import CompanyCard from "../components/CompanyCard";
import { useMarketplaceData } from "../hooks/useMarketplaceData";

function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("orders");
  const { orders, suppliers } = useMarketplaceData();

  const categories = useMemo(() => [...new Set(orders.map((item) => item.category))], [orders]);
  const featuredOrders = useMemo(() => orders.slice(0, 6), [orders]);
  const featuredSuppliers = useMemo(() => suppliers.slice(0, 3), [suppliers]);

  const handleSearch = (event) => {
    event.preventDefault();
    const target = type === "orders" ? "/orders" : "/suppliers";
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    navigate(`${target}?${params.toString()}`);
  };

  const openFeaturedOrder = () => {
    if (featuredOrders[0]?.id) {
      navigate(`/listing/${featuredOrders[0].id}`);
    } else {
      navigate("/orders");
    }
  };

  const openFeaturedSupplier = () => {
    if (featuredSuppliers[0]?.companyId) {
      navigate(`/company/${featuredSuppliers[0].companyId}`);
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
              categories={categories}
            />
            <div className="hero-metrics">
              <div>
                <strong>{orders.length}</strong>
                <span>объявлений в каталоге</span>
              </div>
              <div>
                <strong>{suppliers.length}</strong>
                <span>активных поставщиков</span>
              </div>
              <div>
                <strong>{categories.length}</strong>
                <span>основных категорий</span>
              </div>
            </div>
          </div>

          <div className="hero-panel">
            <button type="button" className="hero-panel-card card-clickable" onClick={openFeaturedOrder}>
              <p>Сегодня в фокусе</p>
              <strong>{featuredOrders[0]?.title || "Актуальные заказы"}</strong>
              <span>{featuredOrders[0] ? `${featuredOrders[0].company} · ${featuredOrders[0].city}` : "B2B Connect"}</span>
            </button>
            <button type="button" className="hero-panel-card alternate card-clickable" onClick={openFeaturedSupplier}>
              <p>Новый поставщик</p>
              <strong>{featuredSuppliers[0]?.name || "Проверенные поставщики"}</strong>
              <span>{featuredSuppliers[0]?.summary || "Компании для B2B-сотрудничества и переговоров."}</span>
            </button>
          </div>
        </div>
      </section>

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
    </Layout>
  );
}

export default HomePage;
