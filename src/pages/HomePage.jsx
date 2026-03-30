import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import SearchBar from "../components/SearchBar";
import ListingCard from "../components/ListingCard";
import CompanyCard from "../components/CompanyCard";
import { categories, orders } from "../data/orders";
import { suppliers } from "../data/suppliers";

function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("orders");

  const featuredOrders = useMemo(() => orders.slice(0, 6), []);
  const featuredSuppliers = useMemo(() => suppliers.slice(0, 3), []);

  const handleSearch = (event) => {
    event.preventDefault();
    const target = type === "orders" ? "/orders" : "/suppliers";
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    navigate(`${target}?${params.toString()}`);
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
            <div className="hero-panel-card">
              <p>Сегодня в фокусе</p>
              <strong>Поставка упаковки для сети кофеен</strong>
              <span>North Beans · Екатеринбург</span>
            </div>
            <div className="hero-panel-card alternate">
              <p>Новый поставщик</p>
              <strong>BuildAxis</strong>
              <span>Коммерческая отделка и запуск объектов под ключ</span>
            </div>
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
              <article key={category} className="category-card">
                <h3>{category}</h3>
                <p>Подбор подрядчиков и предложений в категории {category.toLowerCase()}.</p>
              </article>
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

      <section className="section-block section-accent">
        <div className="container">
          <div className="section-heading">
            <h2>Как это работает</h2>
          </div>
          <div className="steps-grid">
            <article className="step-card">
              <span>01</span>
              <h3>Разместите запрос</h3>
              <p>Компания публикует заказ или предложение и указывает бюджет, город и условия.</p>
            </article>
            <article className="step-card">
              <span>02</span>
              <h3>Отфильтруйте рынок</h3>
              <p>Пользователь просматривает каталог и выбирает подходящие карточки по параметрам.</p>
            </article>
            <article className="step-card">
              <span>03</span>
              <h3>Свяжитесь напрямую</h3>
              <p>После выбора компании можно перейти в профиль и быстро начать обсуждение сделки.</p>
            </article>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default HomePage;
