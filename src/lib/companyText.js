export const COMPANY_DESCRIPTION_FALLBACK = "Компания пока не заполнила описание.";
export const COMPANY_ABOUT_FALLBACK = "Компания пока не заполнила раздел «О компании».";

export function hasCompanyDescription(company) {
  return Boolean(String(company?.description || "").trim());
}

export function hasCompanyAbout(company) {
  return Boolean(String(company?.about || "").trim());
}

export function getCompanyDescription(company) {
  return hasCompanyDescription(company) ? company.description : COMPANY_DESCRIPTION_FALLBACK;
}

export function getCompanyAbout(company) {
  return hasCompanyAbout(company) ? company.about : COMPANY_ABOUT_FALLBACK;
}

export function isCompanyProfileIncomplete(company) {
  return !hasCompanyDescription(company) || !hasCompanyAbout(company);
}
