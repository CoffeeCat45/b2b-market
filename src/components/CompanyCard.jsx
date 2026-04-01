import { Link } from "react-router-dom";

function CompanyCard({ supplier }) {
  const openCard = () => {
    window.open(`#/company/${supplier.companyId}`, "_blank", "noopener,noreferrer");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCard();
    }
  };

  return (
    <article className="card company-card card-clickable" role="link" tabIndex={0} onClick={openCard} onKeyDown={handleKeyDown}>
      <div className="company-avatar">{supplier.name.slice(0, 2)}</div>
      <div className="company-body">
        <div className="card-topline"><span className="pill pill-light">{supplier.industry}</span><span className="rating">★ {supplier.rating}</span></div>
        <h3>{supplier.name}</h3>
        <p className="company-city">{supplier.city}</p>
        <p>{supplier.summary}</p>
        <div className="card-tags">{supplier.skills.map((skill) => <span key={skill} className="tag">{skill}</span>)}</div>
        <div className="card-actions">
          <Link to={`/create?chatCompany=${supplier.companyId}`} className="button button-primary" onClick={(event) => event.stopPropagation()}>Связаться</Link>
        </div>
      </div>
    </article>
  );
}

export default CompanyCard;
