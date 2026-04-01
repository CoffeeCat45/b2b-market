import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useMarketplaceData } from "../hooks/useMarketplaceData";

function ListingPage() {
  const { id } = useParams();
  const { orders, companies } = useMarketplaceData();
  const item = orders.find((entry) => entry.id === id);
  if (!item) return <Layout><section className="detail-section"><div className="container"><div className="empty-state card"><h1>Объявление не найдено</h1></div></div></section></Layout>;
  const company = companies.find((entry) => entry.id === item.companyId);

  return (
    <Layout>
      <section className="detail-section">
        <div className="container">
          <div className="breadcrumbs"><Link to="/">Главная</Link><span>/</span><Link to="/orders">Заказы</Link><span>/</span><span>{item.title}</span></div>
          <div className="detail-layout">
            <div className="detail-main">
              <article className="card detail-card">
                <div className="card-topline"><span className="pill">{item.category}</span><span className="muted">{item.date}</span></div>
                <h1>{item.title}</h1>
                <div className="detail-meta"><strong>{item.company}</strong><span>{item.city}</span><span>{item.budget}</span></div>
                <div className="detail-block"><h3>Описание</h3><p>{item.description}</p></div>
                <div className="detail-block"><h3>Условия сотрудничества</h3><p>{item.terms}</p></div>
                <div className="detail-block"><h3>Теги</h3><div className="card-tags">{item.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</div></div>
              </article>
            </div>
            <aside className="detail-side">
              <div className="card sticky-card">
                <strong className="price">{item.budget}</strong>
                <Link to={`/create?chatCompany=${item.companyId}&orderId=${item.id}`} className="button button-primary button-block">Откликнуться</Link>
                <Link to={`/create?chatCompany=${item.companyId}`} className="button button-secondary button-block">Написать</Link>
                <div className="side-meta"><span>Дата публикации</span><strong>{item.date}</strong></div>
              </div>
              {company ? <div className="card company-side-card"><h3>{company.name}</h3><p>{company.description}</p><Link to={`/company/${company.id}`} className="button button-secondary button-block">Профиль компании</Link></div> : null}
            </aside>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export default ListingPage;