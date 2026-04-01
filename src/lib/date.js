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

export const DATE_FILTER_OPTIONS = [
  { value: "all", label: "За всё время" },
  { value: "30d", label: "За месяц" },
  { value: "7d", label: "За неделю" },
  { value: "3d", label: "За три дня" },
  { value: "1d", label: "За сутки" },
];

export function parseRussianDate(value) {
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();
  const dateTimeMatch = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);

  if (dateTimeMatch) {
    const [, day, month, year, hours = "0", minutes = "0"] = dateTimeMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
  }

  const longDateMatch = normalized.match(/^(\d{1,2})\s+([а-яё]+)\s+(\d{4})$/);

  if (longDateMatch) {
    const [, day, monthLabel, year] = longDateMatch;
    const monthIndex = MONTHS[monthLabel];
    if (monthIndex === undefined) return null;
    return new Date(Number(year), monthIndex, Number(day));
  }

  return null;
}

export function matchesDateFilter(value, filterValue) {
  if (!filterValue || filterValue === "all") return true;

  const date = parseRussianDate(value);
  if (!date || Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const daysMap = { "30d": 30, "7d": 7, "3d": 3, "1d": 1 };
  const days = daysMap[filterValue];

  if (!days) return true;

  const diffMs = now.getTime() - date.getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}
