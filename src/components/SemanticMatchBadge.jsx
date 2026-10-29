function SemanticMatchBadge({ percent }) {
  if (!Number.isFinite(percent)) return null;

  const value = Math.min(100, Math.max(0, Math.round(percent)));
  const title = "Смысловая близость объявления к тексту запроса по локальной нейромодели";

  return (
    <span className="semantic-match-badge" title={title} aria-label={`Смысловое совпадение: ${value}%. ${title}`}>
      Смысловое совпадение: {value}%
    </span>
  );
}

export default SemanticMatchBadge;
