export const VERIFICATION_STATUSES = ["none", "pending", "approved", "rejected"];

export const VERIFICATION_LIMITS = {
  legalNameMin: 2,
  legalNameMax: 200,
  legalAddressMax: 300,
  reasonMin: 3,
  reasonMax: 500,
};

const INN_10_WEIGHTS = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN_11_WEIGHTS = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN_12_WEIGHTS = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function readText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function validationResult(value, errors) {
  const keys = Object.keys(errors);
  if (keys.length) {
    return { ok: false, message: errors[keys[0]], fields: { ...errors } };
  }

  return { ok: true, value, fields: {} };
}

function innChecksum(digits, weights) {
  let sum = 0;
  for (let index = 0; index < weights.length; index += 1) {
    sum += Number(digits[index]) * weights[index];
  }
  return (sum % 11) % 10;
}

export function normalizeInn(value) {
  return readText(value).replace(/\s+/g, "");
}

export function isValidInn(value) {
  const inn = normalizeInn(value);
  if (!/^(?:\d{10}|\d{12})$/.test(inn)) return false;

  if (inn.length === 10) {
    return innChecksum(inn, INN_10_WEIGHTS) === Number(inn[9]);
  }

  return innChecksum(inn, INN_11_WEIGHTS) === Number(inn[10])
    && innChecksum(inn, INN_12_WEIGHTS) === Number(inn[11]);
}

export function isIndividualInn(value) {
  return /^\d{12}$/.test(normalizeInn(value));
}

export function isValidOgrn(value) {
  const ogrn = normalizeInn(value);
  if (!/^(?:\d{13}|\d{15})$/.test(ogrn)) return false;

  const baseLength = ogrn.length - 1;
  const mod = ogrn.length === 13 ? 11 : 13;
  const control = Number(ogrn[baseLength]);
  const remainder = Number(ogrn.slice(0, baseLength)) % mod;

  return remainder % 10 === control;
}

function readLegalName(raw, required, errors) {
  const value = readText(raw).replace(/\s+/g, " ");

  if (!value) {
    if (required) errors.legalName = "Укажите полное наименование организации.";
    return "";
  }

  if (value.length < VERIFICATION_LIMITS.legalNameMin) {
    errors.legalName = `«Наименование»: минимум ${VERIFICATION_LIMITS.legalNameMin} символа.`;
  } else if (value.length > VERIFICATION_LIMITS.legalNameMax) {
    errors.legalName = `«Наименование»: максимум ${VERIFICATION_LIMITS.legalNameMax} символов.`;
  }

  return value;
}

function readLegalAddress(raw, errors) {
  const value = readText(raw);

  if (value.length > VERIFICATION_LIMITS.legalAddressMax) {
    errors.legalAddress = `«Юридический адрес»: максимум ${VERIFICATION_LIMITS.legalAddressMax} символов.`;
  }

  return value;
}

function readInn(raw, { required }, errors) {
  const inn = normalizeInn(raw);

  if (!inn) {
    if (required) errors.inn = "Укажите ИНН.";
    return "";
  }

  if (!isValidInn(inn)) {
    errors.inn = "Укажите корректный ИНН: 10 цифр для юрлица или 12 для ИП.";
  }

  return inn;
}

function readOgrn(raw, errors) {
  const ogrn = normalizeInn(raw);

  if (ogrn && !isValidOgrn(ogrn)) {
    errors.ogrn = "Укажите корректный ОГРН: 13 цифр для юрлица или 15 для ИП.";
  }

  return ogrn;
}

export function validateCompanyLegalFields(body = {}) {
  const errors = {};
  const inn = readInn(body.inn, { required: false }, errors);
  const legalName = readLegalName(body.legalName, false, errors);
  const ogrn = readOgrn(body.ogrn, errors);
  const legalAddress = readLegalAddress(body.legalAddress, errors);

  return validationResult({ inn, legalName, ogrn, legalAddress }, errors);
}

export function validateVerificationPayload(body = {}) {
  const errors = {};
  const inn = readInn(body.inn, { required: true }, errors);
  const requiredLegalName = inn.length === 10;
  const legalName = readLegalName(body.legalName, requiredLegalName, errors);
  const ogrn = readOgrn(body.ogrn, errors);
  const legalAddress = readLegalAddress(body.legalAddress, errors);

  return validationResult({ inn, legalName, ogrn, legalAddress }, errors);
}

export function validateVerificationDecision(body = {}) {
  const errors = {};
  const decision = readText(body.decision);
  const reason = readText(body.reason);

  if (!["approved", "rejected"].includes(decision)) {
    errors.decision = "Допустимые решения: approved или rejected.";
  }

  if (decision === "rejected") {
    if (!reason) {
      errors.reason = "Укажите причину отклонения.";
    } else if (reason.length < VERIFICATION_LIMITS.reasonMin) {
      errors.reason = `«Причина»: минимум ${VERIFICATION_LIMITS.reasonMin} символа.`;
    } else if (reason.length > VERIFICATION_LIMITS.reasonMax) {
      errors.reason = `«Причина»: максимум ${VERIFICATION_LIMITS.reasonMax} символов.`;
    }
  } else if (reason.length > VERIFICATION_LIMITS.reasonMax) {
    errors.reason = `«Причина»: максимум ${VERIFICATION_LIMITS.reasonMax} символов.`;
  }

  return validationResult({
    decision,
    reason: decision === "rejected" ? reason : "",
  }, errors);
}
