import { areSynonyms, normalizeText } from "./search.js";

const INDUSTRY_EXACT_POINTS = 40;
const INDUSTRY_SYNONYM_POINTS = 25;
const CITY_POINTS = 25;
const TAG_POINTS = { 1: 12, 2: 23, 3: 35 };

const SUPPLIER_INDUSTRY_EXACT_POINTS = 20;
const SUPPLIER_INDUSTRY_SYNONYM_POINTS = 12;
const SUPPLIER_CITY_POINTS = 10;
const SUPPLIER_TAG_POINTS = { 1: 35, 2: 55, 3: 70 };

function scoreMatch(profile, order) {
  let score = 0;
  const reasons = [];

  const industry = String(profile.industry || "").trim();
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

  const city = String(profile.city || "").trim();
  const orderCity = String(order.cityMajor || order.city || "").trim();
  if (city && orderCity && normalizeText(city) === normalizeText(orderCity)) {
    score += CITY_POINTS;
    reasons.push("Совпадает город");
  }

  const specializations = profile.specializations;
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

function matchesSkill(skill, tag) {
  const normalizedSkill = normalizeText(skill);
  const normalizedTag = normalizeText(tag);
  if (!normalizedSkill || !normalizedTag) return false;
  return normalizedSkill === normalizedTag
    || areSynonyms(normalizedSkill, normalizedTag)
    || normalizedSkill.startsWith(normalizedTag)
    || normalizedTag.startsWith(normalizedSkill);
}

function scoreSupplierMatch(profile, order) {
  let score = 0;
  const reasons = [];

  const specializations = profile.specializations;
  const orderTags = Array.isArray(order.tags) ? order.tags : [];
  const matchedSkills = [];
  for (const tag of orderTags) {
    const match = specializations.find((item) => matchesSkill(item, tag));
    if (match && !matchedSkills.includes(match)) matchedSkills.push(match);
  }

  if (matchedSkills.length) {
    const key = Math.min(matchedSkills.length, 3);
    score += SUPPLIER_TAG_POINTS[key];
    reasons.push(`Совпадают услуги: ${matchedSkills.join(", ")}`);
  }

  const industry = String(profile.industry || "").trim();
  const orderIndustry = String(order.category || "").trim();
  if (industry && orderIndustry) {
    if (normalizeText(industry) === normalizeText(orderIndustry)) {
      score += SUPPLIER_INDUSTRY_EXACT_POINTS;
      reasons.push("Совпадает отрасль");
    } else if (areSynonyms(industry, orderIndustry)) {
      score += SUPPLIER_INDUSTRY_SYNONYM_POINTS;
      reasons.push("Совпадает отрасль");
    }
  }

  const city = String(profile.city || "").trim();
  const orderCity = String(order.cityMajor || order.city || "").trim();
  if (city && orderCity && normalizeText(city) === normalizeText(orderCity)) {
    score += SUPPLIER_CITY_POINTS;
    reasons.push("Совпадает город");
  }

  return {
    score: Math.min(100, Math.round(score)),
    reasons,
  };
}

function buildProfile({ industry, city, specializations }) {
  const normalizedIndustry = String(industry || "").trim();
  const normalizedCity = String(city || "").trim();
  const normalizedSpecializations = Array.isArray(specializations)
    ? specializations.filter((item) => String(item || "").trim())
    : [];

  if (!normalizedIndustry && !normalizedCity && !normalizedSpecializations.length) return null;

  return {
    industry: normalizedIndustry,
    city: normalizedCity,
    specializations: normalizedSpecializations,
  };
}

export function getOrderCompatibility(userCompany, order) {
  if (!userCompany || !order) return null;

  const companyId = userCompany.id || userCompany.companyId;
  if (companyId && order.companyId && companyId === order.companyId) return null;

  const profile = buildProfile({
    industry: userCompany.industry,
    city: userCompany.city || userCompany.companyCity,
    specializations: userCompany.specializations,
  });
  if (!profile) return null;

  return scoreMatch(profile, order);
}

export function getSupplierCompatibility(order, supplier) {
  if (!order || !supplier) return null;

  const supplierId = supplier.companyId || supplier.id;
  if (supplierId && order.companyId && supplierId === order.companyId) return null;

  const profile = buildProfile({
    industry: supplier.industry,
    city: supplier.city,
    specializations: Array.isArray(supplier.skills) ? supplier.skills : supplier.specializations,
  });
  if (!profile) return null;

  return scoreSupplierMatch(profile, order);
}
