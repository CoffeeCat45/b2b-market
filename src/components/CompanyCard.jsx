import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAvatarStyle, getInitials } from "../lib/avatar";
import { getCompanyDescription, hasCompanyDescription } from "../lib/companyText";

function CompanyCard({ supplier, onTagClick }) {
  const { user } = useAuth();
  const skills = Array.isArray(supplier.skills) ? supplier.skills : [];
  // В /suppliers description компании лежит в summary.
  const summaryCompany = { description: supplier.summary };
  const hasDescription = hasCompanyDescription(summaryCompany);
  const openCard = () => {
    window.open(`#/company/${supplier.companyId}`, "_blank", "noopener,noreferrer");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCard();
    }
  };

  const contactPath = `/chats?chatCompany=${encodeURIComponent(supplier.companyId)}`;
  const contactHref = user ? contactPath : `/login?next=${encodeURIComponent(contactPath)}`;
  const isOwnCompany = Boolean(user?.companyId && user.companyId === supplier.companyId);
  const canContact = Boolean(user?.companyId && !isOwnCompany);

  return (
    <article className="card company-card card-clickable" role="link" tabIndex={0} onClick={openCard} onKeyDown={handleKeyDown}>
      <div className="company-avatar avatar-frame" style={getAvatarStyle(supplier)}>
        {supplier.avatarUrl ? null : getInitials(supplier.name)}
      </div>
      <div className="company-body">
        <div className="card-topline"><span className="pill pill-light">{supplier.industry}</span><span className="rating">★ {supplier.rating}</span></div>
        <h3>{supplier.name}</h3>
        <p className="company-city">{supplier.city}</p>
        <p className={hasDescription ? undefined : "muted"}>{getCompanyDescription(summaryCompany)}</p>
        <div className="card-tags">
          {skills.map((skill) => (
            onTagClick ? (
              <button
                key={skill}
                type="button"
                className="tag tag-button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTagClick(skill);
                }}
              >
                {skill}
              </button>
            ) : (
              <span key={skill} className="tag">{skill}</span>
            )
          ))}
        </div>
        <div className="card-actions">
          {canContact || !user ? (
            <Link to={contactHref} className="button button-primary" onClick={(event) => event.stopPropagation()}>Связаться</Link>
          ) : (
            <span className="muted">{isOwnCompany ? "Это ваша компания" : "Чат только для компаний"}</span>
          )}
        </div>
      </div>
    </article>
  );
}

export default CompanyCard;
