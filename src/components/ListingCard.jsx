import { Link } from "react-router-dom";
import CompatibilityBadge from "./CompatibilityBadge";
import SemanticMatchBadge from "./SemanticMatchBadge";
import VerificationBadge from "./VerificationBadge";
import VerificationWarning from "./VerificationWarning";

function ListingCard({ item, featured = false, onTagClick, compatibility = null, semanticMatch = null, contractorsHref = "" }) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const openCard = () => {
    window.open(`#/listing/${item.id}`, "_blank", "noopener,noreferrer");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCard();
    }
  };

  return (
    <article
      className={`card listing-card card-clickable ${featured ? "featured-card" : ""}`}
      role="link"
      tabIndex={0}
      onClick={openCard}
      onKeyDown={handleKeyDown}
    >
      <div className="card-topline">
        <span className="pill">{item.category}</span>
        <span className="muted">{item.date}</span>
      </div>
      <h3 className="listing-title">{item.title}</h3>
      <div className="listing-meta">
        <strong>{item.company}</strong>
        <VerificationBadge status={item.verificationStatus} reviewedAt={item.verificationReviewedAt} />
        <span>{item.city}</span>
      </div>
      {compatibility || Number.isFinite(semanticMatch) ? (
        <div className="card-badges">
          <CompatibilityBadge compatibility={compatibility} />
          <SemanticMatchBadge percent={semanticMatch} />
        </div>
      ) : null}
      <p>{item.summary}</p>
      <VerificationWarning status={item.verificationStatus} variant="compact" />
      <div className="card-tags">
        {tags.map((tag) => (
          onTagClick ? (
            <button
              key={tag}
              type="button"
              className="tag tag-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onTagClick(tag);
              }}
            >
              {tag}
            </button>
          ) : (
            <span key={tag} className="tag">
              {tag}
            </span>
          )
        ))}
      </div>
      <div className="card-actions">
        <strong className="price">{item.budget}</strong>
        <div className="card-actions-buttons">
          {contractorsHref ? (
            <Link
              to={contractorsHref}
              className="button button-secondary"
              onClick={(event) => event.stopPropagation()}
            >
              Подрядчики
            </Link>
          ) : null}
          <Link
            to={`/listing/${item.id}`}
            target="_blank"
            rel="noreferrer"
            className="button button-secondary"
            onClick={(event) => event.stopPropagation()}
          >
            Подробнее
          </Link>
        </div>
      </div>
    </article>
  );
}

export default ListingCard;
