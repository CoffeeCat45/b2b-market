import { Link, useNavigate } from "react-router-dom";

function ListingCard({ item, featured = false }) {
  const navigate = useNavigate();

  const openCard = () => {
    navigate(`/listing/${item.id}`);
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
        <span>{item.city}</span>
      </div>
      <p>{item.summary}</p>
      <div className="card-tags">
        {item.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <div className="card-actions">
        <strong className="price">{item.budget}</strong>
        <Link
          to={`/listing/${item.id}`}
          className="button button-secondary"
          onClick={(event) => event.stopPropagation()}
        >
          Подробнее
        </Link>
      </div>
    </article>
  );
}

export default ListingCard;
