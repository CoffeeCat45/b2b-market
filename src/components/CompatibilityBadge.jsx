const LOW_SCORE = 40;

function CompatibilityBadge({ compatibility, label = "Совпадение профиля" }) {
  if (!compatibility) return null;

  const score = Number(compatibility.score) || 0;
  const text = `${label}: ${score}%`;
  const reasons = Array.isArray(compatibility.reasons) ? compatibility.reasons : [];
  const description = reasons.length ? reasons.join(" · ") : "Отрасль, город и услуги не совпали";
  const isLow = score < LOW_SCORE;

  return (
    <span
      className={`compatibility-badge${isLow ? " compatibility-badge-low" : ""}`}
      title={description}
      aria-label={`${text}. ${description}`}
    >
      {text}
    </span>
  );
}

export default CompatibilityBadge;
