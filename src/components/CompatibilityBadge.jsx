const MIN_VISIBLE_SCORE = 40;

function CompatibilityBadge({ compatibility, alwaysShow = false }) {
  if (!compatibility) return null;

  const score = Number(compatibility.score) || 0;
  if (!alwaysShow && score < MIN_VISIBLE_SCORE) return null;

  const label = `Совпадение профиля: ${score}%`;
  const reasons = Array.isArray(compatibility.reasons) ? compatibility.reasons : [];
  const description = reasons.length ? reasons.join(" · ") : "Отрасль, город и услуги не совпали";
  const isLow = score < MIN_VISIBLE_SCORE;

  return (
    <span
      className={`compatibility-badge${isLow ? " compatibility-badge-low" : ""}`}
      title={description}
      aria-label={`${label}. ${description}`}
    >
      {label}
    </span>
  );
}

export default CompatibilityBadge;
