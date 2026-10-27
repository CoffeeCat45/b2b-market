export function getInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "B2B";

  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
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
