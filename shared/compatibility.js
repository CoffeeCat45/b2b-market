import { areSynonyms, normalizeText } from "./search.js";

const INDUSTRY_EXACT_POINTS = 40;
const INDUSTRY_SYNONYM_POINTS = 25;
const CITY_POINTS = 25;
const TAG_POINTS = { 1: 12, 2: 23, 3: 35 };

export function getOrderCompatibility(userCompany, order) {
  if (!userCompany || !order) return null;

  const companyId = userCompany.id || userCompany.companyId;
  if (companyId && order.companyId && companyId === order.companyId) return null;

  const industry = String(userCompany.industry || "").trim();
  const city = String(userCompany.city || userCompany.companyCity || "").trim();
  const specializations = Array.isArray(userCompany.specializations) ? userCompany.specializations : [];

  if (!industry && !city && !specializations.length) return null;

  let score = 0;
  const reasons = [];

  const orderIndustry = String(order.category || "").trim();
  if (industry && orderIndustry) {
    if (normalizeText(industry) === normalizeText(orderIndustry)) {
      score += INDUSTRY_EXACT_POINTS;
      reasons.push("Совпадает отрасль");
    } else if (areSynonyms(industry, orderIndustry)) {
      score += INDUSTRY_SYNONYM_POINTS;
      reasons.push("Совпадает отрасль");
    }
  }

  const orderCity = String(order.cityMajor || order.city || "").trim();
  if (city && orderCity && normalizeText(city) === normalizeText(orderCity)) {
    score += CITY_POINTS;
    reasons.push("Совпадает город");
  }

  const orderTags = Array.isArray(order.tags) ? order.tags : [];
  const matchedTags = [];
  for (const tag of orderTags) {
    const normalizedTag = normalizeText(tag);
    if (!normalizedTag) continue;
    const match = specializations.find((item) => normalizeText(item) === normalizedTag);
    if (match && !matchedTags.includes(match)) matchedTags.push(match);
  }

  if (matchedTags.length) {
    const key = Math.min(matchedTags.length, 3);
    score += TAG_POINTS[key];
    reasons.push(`Совпадают теги: ${matchedTags.join(", ")}`);
  }

  return {
    score: Math.min(100, Math.round(score)),
    reasons,
  };
}
