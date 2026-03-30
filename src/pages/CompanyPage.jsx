import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import Tabs from "../components/Tabs";
import ListingCard from "../components/ListingCard";
import { companies } from "../data/companies";
import { orders } from "../data/orders";

function CompanyPage() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("about");
  const company = companies.find((entry) => entry.id === id);

  const companyOrders = useMemo(() => {
    return orders.filter((item) => item.companyId === id);
  }, [id]);

  if (!company) {
    return (
      <Layout>
        <section className="detail-section">
          <div className="container">
            <div className="empty-state card">
              <h1>Профиль компании не найден</h1>
              <p>В демонстрации доступны только подготовленные карточки компаний.</p>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="company-section">
        <div className="container">
          <article className="company-hero card" id="contacts">
            <div className="company-hero-mark">{company.name.slice(0, 2)}</div>
            <div className="company-hero-body">
              <span className="pill">{company.industry}</span>
              <h1>{company.name}</h1>
              <div className="detail-meta">
                <span>{company.city}</span>
                <span>★ {company.rating}</span>
                <span>{company.specializations.join(" · ")}</span>
              </div>
              <p>{company.description}</p>
            </div>
            <div className="company-hero-actions">
              <button type="button" className="button button-primary button-block">
                Связаться
              </button>
              <Link to="/create" className="button button-secondary button-block">
                Разместить запрос
              </Link>
            </div>
          </article>

          <Tabs
            items={[
              { key: "about", label: "О компании" },
              { key: "listings", label: "Объявления" },
              { key: "reviews", label: "Отзывы" },
            ]}
            activeKey={activeTab}
            onChange={setActiveTab}
          />

          {activeTab === "about" ? (
            <section className="tab-panel card">
              <h2>О компании</h2>
              <p>{company.about}</p>
              <div className="info-grid">
                <div>
                  <span className="muted">Отрасль</span>
                  <strong>{company.industry}</strong>
                </div>
                <div>
                  <span className="muted">Город</span>
                  <strong>{company.city}</strong>
                </div>
                <div>
                  <span className="muted">Специализация</span>
                  <strong>{company.specializations.join(", ")}</strong>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "listings" ? (
            <section className="tab-panel">
              <div className="cards-grid">
                {companyOrders.length ? (
                  companyOrders.map((item) => <ListingCard key={item.id} item={item} />)
                ) : (
                  <div className="empty-state card">
                    <h3>У компании пока нет активных объявлений</h3>
                    <p>Для демонстрации можно добавить новые карточки через моковые данные.</p>
                  </div>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === "reviews" ? (
            <section className="tab-panel card">
              <h2>Отзывы</h2>
              <div className="review-list">
                {company.reviews.map((review) => (
                  <article key={review.id} className="review-card">
                    <strong>{review.author}</strong>
                    <p>{review.text}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </Layout>
  );
}

export default CompanyPage;
