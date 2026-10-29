import { isIndividualInn, isValidInn } from "../../shared/verification.js";

export const VERIFICATION_STATUS_LABELS = {
  none: "Не проверена",
  pending: "На проверке",
  approved: "Проверена",
  rejected: "Проверка отклонена",
};

export function getVerificationStatusLabel(status) {
  return VERIFICATION_STATUS_LABELS[status] || VERIFICATION_STATUS_LABELS.none;
}

export function formatVerificationDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function getInnHint(value) {
  const inn = String(value || "").replace(/\s+/g, "");

  if (!inn) return "";
  if (!/^\d+$/.test(inn)) return "ИНН может содержать только цифры.";
  if (isValidInn(inn)) {
    return isIndividualInn(inn)
      ? "ИНН ИП: автопроверка по ЕГРЮЛ недоступна, реквизиты заполняются вручную."
      : "ИНН юрлица заполнен корректно.";
  }

  return "Проверьте ИНН: 10 цифр для юрлица или 12 для ИП.";
}

export function canLookupInn(value) {
  const inn = String(value || "").replace(/\s+/g, "");
  return /^\d{10}$/.test(inn) && isValidInn(inn);
}
