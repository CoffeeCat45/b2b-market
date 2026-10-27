const MONTHS = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

const displayFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export const DATE_FILTER_OPTIONS = [
  { value: "all", label: "За всё время" },
  { value: "30d", label: "За месяц" },
  { value: "7d", label: "За неделю" },
  { value: "3d", label: "За три дня" },
  { value: "1d", label: "За сутки" },
];

export function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "number") {
    const numericDate = new Date(value);
    return Number.isNaN(numericDate.getTime()) ? null : numericDate;
  }

  const normalized = String(value).trim();
  if (!normalized) return null;

  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    const isoDate = new Date(normalized);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
  }

  const dateTimeMatch = normalized.match(/^(\d{1,2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (dateTimeMatch) {
    const [, day, month, year, hours = "0", minutes = "0"] = dateTimeMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
  }

  const longDateMatch = normalized.toLowerCase().match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})(?:\s*г\.?)?$/);
  if (longDateMatch) {
    const [, day, monthLabel, year] = longDateMatch;
    const monthIndex = MONTHS[monthLabel];
    if (monthIndex === undefined) return null;
    return new Date(Number(year), monthIndex, Number(day));
  }

  return null;
}

export function formatDisplayDate(value) {
  if (!value) return "";

  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    return normalized;
  }

  const date = parseDateValue(normalized);
  if (!date) return normalized;

  return displayFormatter.format(date).replace(/\s*г\.$/, "");
}

export function matchesDateFilter(value, filterValue) {
  if (!filterValue || filterValue === "all") return true;

  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const daysMap = { "30d": 30, "7d": 7, "3d": 3, "1d": 1 };
  const days = daysMap[filterValue];

  if (!days) return true;

  const diffMs = now.getTime() - date.getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}
