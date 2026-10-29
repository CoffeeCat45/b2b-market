const MIN_VISIBLE_SCORE = 40;

function CompatibilityBadge({ compatibility }) {
  if (!compatibility || compatibility.score < MIN_VISIBLE_SCORE) return null;

  const label = `Совпадение профиля: ${compatibility.score}%`;
  const description = compatibility.reasons.join(" · ");

  return (
    <span className="compatibility-badge" title={description || label} aria-label={description ? `${label}. ${description}` : label}>
      {label}
    </span>
  );
}

export default CompatibilityBadge;
