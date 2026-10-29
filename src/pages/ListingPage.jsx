import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import AsyncState from "../components/AsyncState";
import { useAuth } from "../context/AuthContext";
import { useMarketplaceData } from "../hooks/useMarketplaceData";
import { apiFetch } from "../lib/api";
import {
  getCompanyDescription,
  hasCompanyDescription,
  isCompanyProfileIncomplete,
} from "../lib/companyText";

function ListingPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { orders, companies, loading, error, reload } = useMarketplaceData();
  const [viewsCount, setViewsCount] = useState(null);
  const viewedOrderIdsRef = useRef(new Set());
  const item = orders.find((entry) => entry.id === id);
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  const isOwner = Boolean(user?.companyId && item?.companyId === user.companyId);

  useEffect(() => {
    if (item) {
      setViewsCount(item.viewsCount ?? 0);
    }
  }, [item]);

  useEffect(() => {
    if (!item || isOwner || viewedOrderIdsRef.current.has(item.id)) {
      return;
    }

    viewedOrderIdsRef.current.add(item.id);

    const registerView = async () => {
      try {
        const data = await apiFetch(`/orders/${item.id}/view`, { method: "POST" });
        setViewsCount(data.viewsCount ?? item.viewsCount ?? 0);
      } catch {
        // Просмотр не критичен: если запись не удалась, показываем прежний счётчик.
      }
    };

    registerView();
  }, [item, isOwner]);

  if (loading || error) {
    return (
      <Layout>
        <section className="detail-section">
          <div className="container">
            <AsyncState loading={loading} error={error} onRetry={reload} loadingText="Загружаем объявление…" />
          </div>
        </section>
      </Layout>
    );
  }

  if (!item) {
    return (
      <Layout>
        <section className="detail-section">
          <div className="container">
            <div className="empty-state card">
              <h1>Объявление не найдено</h1>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  const company = companies.find((entry) => entry.id === item.companyId);
  const chatPath = `/chats?chatCompany=${encodeURIComponent(item.companyId)}&orderId=${encodeURIComponent(item.id)}`;
  const chatHref = user ? chatPath : `/login?next=${encodeURIComponent(chatPath)}`;
  const isOwnOrder = Boolean(user?.companyId && item.companyId === user.companyId);
  const canContact = Boolean(user?.companyId && !isOwnOrder);
  const effectiveViewsCount = viewsCount ?? item.viewsCount ?? 0;

  return (
    <Layout>
      <section className="detail-section">
        <div className="container">
          <div className="breadcrumbs">
            <Link to="/">Главная</Link>
            <span>/</span>
            <Link to="/orders">Заказы</Link>
            <span>/</span>
            <span>{item.title}</span>
          </div>
          <div className="detail-layout">
            <div className="detail-main">
              <article className="card detail-card">
                <div className="card-topline">
                  <span className="pill">{item.category}</span>
                  <span className="muted">{item.date}</span>
                </div>
                <h1>{item.title}</h1>
                <div className="detail-meta">
                  <strong>{item.company}</strong>
                  <span>{item.city}</span>
                  <span>{item.budget}</span>
                  <span>{effectiveViewsCount} просмотров</span>
                </div>
                <div className="detail-block">
                  <h3>Описание</h3>
                  <p>{item.description}</p>
                </div>
                <div className="detail-block">
                  <h3>Условия сотрудничества</h3>
                  <p>{item.terms}</p>
                </div>
                <div className="detail-block">
                  <h3>Теги</h3>
                  <div className="card-tags">
                    {tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            </div>
            <aside className="detail-side">
              <div className="card sticky-card">
                <strong className="price">{item.budget}</strong>
                {canContact || !user ? (
                  <Link to={chatHref} className="button button-primary button-block">
                    Написать
                  </Link>
                ) : (
                  <p className="muted">
                    {isOwnOrder ? "Это ваше объявление." : "Чат доступен только аккаунтам компаний."}
                  </p>
                )}
                <div className="side-meta">
                  <span>Дата публикации</span>
                  <strong>{item.date}</strong>
                </div>
                <div className="side-meta">
                  <span>Просмотры</span>
                  <strong>{effectiveViewsCount}</strong>
                </div>
              </div>
              {company ? (
                <div className="card company-side-card">
                  <h3>{company.name}</h3>
                  <p className={hasCompanyDescription(company) ? undefined : "muted"}>{getCompanyDescription(company)}</p>
                  {user?.companyId === company.id && isCompanyProfileIncomplete(company) ? (
                    <Link to="/create?profile=edit" className="inline-cta">Заполнить описание</Link>
                  ) : null}
                  <Link to={`/company/${company.id}`} className="button button-secondary button-block">
                    Профиль компании
                  </Link>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default ListingPage;
