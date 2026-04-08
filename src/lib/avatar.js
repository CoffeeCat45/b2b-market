export function getInitials(name) {
  return String(name || "B2B").trim().slice(0, 2) || "B2B";
}

function clampPercent(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
}

function clampScale(value, fallback = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(100, Math.min(220, numeric));
}

// Один стиль используется в карточках, профиле и чатах, чтобы кадрирование выглядело одинаково.
export function getAvatarStyle(entity) {
  if (!entity?.avatarUrl) return undefined;

  return {
    backgroundImage: `url("${entity.avatarUrl}")`,
    backgroundPosition: `${clampPercent(entity.avatarPositionX)}% ${clampPercent(entity.avatarPositionY)}%`,
    backgroundSize: `${clampScale(entity.avatarScale)}%`,
    backgroundRepeat: "no-repeat",
  };
}
