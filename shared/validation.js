const MIB = 1024 * 1024;
const numberFormatter = new Intl.NumberFormat("ru-RU");
const textEncoder = new TextEncoder();

export const LIMITS = {
  order: {
    titleMin: 5,
    titleMax: 120,
    summaryMin: 10,
    summaryMax: 300,
    descriptionMin: 20,
    descriptionMax: 3000,
    termsMin: 5,
    termsMax: 1000,
    categoryMin: 2,
    categoryMax: 60,
    cityMin: 2,
    cityMax: 80,
    locationMax: 120,
    tagsMax: 10,
    tagMax: 30,
    budgetMax: 1_000_000_000,
  },
  chat: {
    idMax: 80,
    subjectMax: 120,
    messageMax: 4000,
    detailsMax: 4000,
  },
  review: {
    textMax: 1000,
  },
  profile: {
    displayNameMin: 2,
    displayNameMax: 80,
    companyNameMin: 2,
    companyNameMax: 120,
    cityMin: 2,
    cityMax: 80,
    phoneMax: 30,
    industryMin: 2,
    industryMax: 60,
    descriptionMin: 10,
    descriptionMax: 1000,
    aboutMin: 10,
    aboutMax: 3000,
    specializationsMax: 10,
    specializationMax: 30,
  },
  auth: {
    emailMax: 254,
    passwordMinBytes: 8,
    passwordMaxBytes: 72,
  },
  files: {
    avatarMaxBytes: 3 * MIB,
    attachmentMaxBytes: 6 * MIB,
    attachmentsTotalMaxBytes: 15 * MIB,
    maxAttachments: 5,
    attachmentNameMax: 120,
    allowedAttachmentTypes: ["application/pdf", "image/jpeg", "image/png"],
    allowedAvatarTypes: ["image/jpeg", "image/png", "image/webp"],
  },
};

function readText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function byteLength(value) {
  return textEncoder.encode(String(value || "")).length;
}

function addTextError(errors, field, label, value, { min = 0, max = Infinity, required = true } = {}) {
  if (!value) {
    if (required) errors[field] = `Заполните поле «${label}».`;
    return "";
  }

  if (value.length < min) {
    errors[field] = `«${label}»: минимум ${min} символов.`;
  } else if (value.length > max) {
    errors[field] = `«${label}»: максимум ${max} символов.`;
  }

  return value;
}

function readTextWithLimit(raw, field, label, options, errors) {
  return addTextError(errors, field, label, readText(raw), options);
}

function readEmail(raw, field, errors) {
  const value = readText(raw).toLowerCase();

  if (!value) {
    errors[field] = "Укажите email.";
    return "";
  }

  if (value.length > LIMITS.auth.emailMax || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    errors[field] = "Укажите корректный email.";
  }

  return value;
}

function readInteger(raw, field, label, { min, max, required = true }, errors) {
  const text = readText(raw);

  if (!text) {
    if (required) errors[field] = `Укажите ${label}.`;
    return null;
  }

  if (!/^-?\d+$/.test(text)) {
    errors[field] = `«${label}»: укажите целое число.`;
    return null;
  }

  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) {
    errors[field] = `«${label}»: значение от ${numberFormatter.format(min)} до ${numberFormatter.format(max)}.`;
    return null;
  }

  return value;
}

function readTags(raw, errors) {
  if (raw === undefined || raw === null || raw === "") return [];

  let items;
  if (Array.isArray(raw)) {
    items = raw.map(readText);
  } else if (typeof raw === "string") {
    items = raw.split(",").map(readText);
  } else {
    errors.tags = "Теги должны быть списком.";
    return [];
  }

  const unique = [...new Set(items.filter(Boolean))];

  if (unique.length > LIMITS.order.tagsMax) {
    errors.tags = `Можно указать не более ${LIMITS.order.tagsMax} тегов.`;
  } else if (unique.some((tag) => tag.length > LIMITS.order.tagMax)) {
    errors.tags = `Каждый тег должен быть не длиннее ${LIMITS.order.tagMax} символов.`;
  }

  return unique;
}

function readSpecializations(raw, errors) {
  if (raw === undefined || raw === null || raw === "") return [];

  let items;
  if (Array.isArray(raw)) {
    items = raw.map(readText);
  } else if (typeof raw === "string") {
    items = raw.split(",").map(readText);
  } else {
    errors.specializations = "Теги компании должны быть списком.";
    return [];
  }

  const unique = [...new Set(items.filter(Boolean))];

  if (unique.length > LIMITS.profile.specializationsMax) {
    errors.specializations = `Можно указать не более ${LIMITS.profile.specializationsMax} тегов компании.`;
  } else if (unique.some((tag) => tag.length > LIMITS.profile.specializationMax)) {
    errors.specializations = `Каждый тег компании должен быть не длиннее ${LIMITS.profile.specializationMax} символов.`;
  }

  return unique;
}

function readBudget(rawFrom, rawTo, errors) {
  const fromText = readText(rawFrom);
  const toText = readText(rawTo);

  if (!fromText && !toText) {
    return { from: 0, to: 0, label: "По договорённости" };
  }

  const from = fromText
    ? readInteger(fromText, "budgetFrom", "Бюджет от", { min: 0, max: LIMITS.order.budgetMax }, errors)
    : null;
  const to = toText
    ? readInteger(toText, "budgetTo", "Бюджет до", { min: 0, max: LIMITS.order.budgetMax }, errors)
    : null;

  if (!fromText) errors.budgetFrom = "Укажите бюджет от или оставьте оба поля пустыми.";
  if (!toText) errors.budgetTo = "Укажите бюджет до или оставьте оба поля пустыми.";

  if (from !== null && to !== null && from > to) {
    errors.budgetTo = "Бюджет «до» должен быть не меньше бюджета «от».";
  }

  return {
    from: from ?? 0,
    to: to ?? 0,
    label: `от ${numberFormatter.format(from ?? 0)} ₽ до ${numberFormatter.format(to ?? 0)} ₽`,
  };
}

function validationResult(value, errors) {
  const keys = Object.keys(errors);
  if (keys.length) {
    return { ok: false, message: errors[keys[0]], fields: { ...errors } };
  }

  return { ok: true, value, fields: {} };
}

export function dataUrlBytes(dataUrl) {
  const value = String(dataUrl || "");
  const commaIndex = value.indexOf(",");

  if (commaIndex === -1 || !/;base64$/i.test(value.slice(0, commaIndex))) {
    return null;
  }

  const payload = value.slice(commaIndex + 1);
  if (!payload || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
    return null;
  }

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return (payload.length * 3) / 4 - padding;
}

const FILE_SIGNATURES = {
  "application/pdf": (bytes) => String.fromCharCode(...bytes.slice(0, 1024)).includes("%PDF-"),
  "image/jpeg": (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) => bytes.length >= 8
    && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte),
  "image/webp": (bytes) => bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50,
};

function readDataUrlPrefix(dataUrl, maxBytes) {
  const value = String(dataUrl || "");
  const commaIndex = value.indexOf(",");
  if (commaIndex === -1) return null;

  const payload = value.slice(commaIndex + 1);
  const chars = Math.ceil(maxBytes / 3) * 4;

  try {
    const binary = atob(payload.slice(0, chars));
    return Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function matchesFileSignature(type, dataUrl) {
  const matcher = FILE_SIGNATURES[type];
  if (!matcher) return false;

  const bytes = readDataUrlPrefix(dataUrl, 1024);
  return Boolean(bytes && matcher(bytes));
}

export function validatePassword(raw, { field = "password", label = "Пароль", minBytes = LIMITS.auth.passwordMinBytes } = {}) {
  const value = raw === undefined || raw === null ? "" : String(raw);

  if (!value) {
    return { ok: false, field, error: `Введите ${label.toLowerCase()}.` };
  }

  const bytes = byteLength(value);
  if (bytes < minBytes || bytes > LIMITS.auth.passwordMaxBytes) {
    return {
      ok: false,
      field,
      error: `«${label}»: от ${minBytes} до ${LIMITS.auth.passwordMaxBytes} байт.`,
    };
  }

  return { ok: true, value };
}

export function validateAvatar(raw) {
  const value = readText(raw);

  if (!value) {
    return { ok: true, value: "", provided: true };
  }

  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,/i);
  if (!match || !LIMITS.files.allowedAvatarTypes.includes(match[1].toLowerCase())) {
    return { ok: false, error: "Аватар должен быть изображением JPG, PNG или WebP." };
  }

  const bytes = dataUrlBytes(value);
  if (!bytes) {
    return { ok: false, error: "Не удалось прочитать изображение аватара." };
  }

  if (!matchesFileSignature(match[1].toLowerCase(), value)) {
    return { ok: false, error: "Содержимое аватара не похоже на изображение JPG, PNG или WebP." };
  }

  if (bytes > LIMITS.files.avatarMaxBytes) {
    return {
      ok: false,
      error: `Аватар слишком большой. Загрузите изображение до ${LIMITS.files.avatarMaxBytes / MIB} МБ.`,
    };
  }

  return { ok: true, value, provided: true, bytes };
}

export function validateAttachments(raw) {
  if (raw === undefined || raw === null) {
    return { ok: true, value: [], totalBytes: 0 };
  }

  if (!Array.isArray(raw)) {
    return { ok: false, error: "Вложения должны быть списком." };
  }

  if (raw.length > LIMITS.files.maxAttachments) {
    return { ok: false, error: `Можно прикрепить не более ${LIMITS.files.maxAttachments} файлов.` };
  }

  const items = [];
  let totalBytes = 0;

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index] || {};
    const name = readText(item.name);
    const type = readText(item.type).toLowerCase();
    const dataUrl = String(item.dataUrl || "").trim();

    if (!name) {
      return { ok: false, error: `У файла №${index + 1} нет имени.` };
    }

    if (name.length > LIMITS.files.attachmentNameMax) {
      return { ok: false, error: `Имя файла «${name}» длиннее ${LIMITS.files.attachmentNameMax} символов.` };
    }

    if (!LIMITS.files.allowedAttachmentTypes.includes(type)) {
      return { ok: false, error: `Файл «${name}» должен быть PDF, JPG или PNG.` };
    }

    const match = dataUrl.match(/^data:([^;]+);base64,/i);
    if (!match || match[1].toLowerCase() !== type) {
      return { ok: false, error: `Содержимое файла «${name}» не соответствует его типу.` };
    }

    const bytes = dataUrlBytes(dataUrl);
    if (!bytes) {
      return { ok: false, error: `Не удалось прочитать файл «${name}».` };
    }

    if (!matchesFileSignature(type, dataUrl)) {
      return { ok: false, error: `Содержимое файла «${name}» не похоже на PDF, JPG или PNG.` };
    }

    if (bytes > LIMITS.files.attachmentMaxBytes) {
      return {
        ok: false,
        error: `Файл «${name}» больше ${LIMITS.files.attachmentMaxBytes / MIB} МБ.`,
      };
    }

    totalBytes += bytes;
    items.push({ name, type, size: bytes, dataUrl });
  }

  if (totalBytes > LIMITS.files.attachmentsTotalMaxBytes) {
    return {
      ok: false,
      error: `Суммарный размер вложений больше ${LIMITS.files.attachmentsTotalMaxBytes / MIB} МБ.`,
    };
  }

  return { ok: true, value: items, totalBytes };
}

export function validateOrderPayload(body = {}) {
  const errors = {};
  const title = readTextWithLimit(body.title, "title", "Название", { min: LIMITS.order.titleMin, max: LIMITS.order.titleMax }, errors);
  const category = readTextWithLimit(body.category, "category", "Категория", { min: LIMITS.order.categoryMin, max: LIMITS.order.categoryMax }, errors);
  const cityMajor = readTextWithLimit(body.cityMajor ?? body.city, "cityMajor", "Город", { min: LIMITS.order.cityMin, max: LIMITS.order.cityMax }, errors);
  const locationDetail = readTextWithLimit(body.locationDetail, "locationDetail", "Район / пригород", { max: LIMITS.order.locationMax, required: false }, errors);
  const summary = readTextWithLimit(body.summary, "summary", "Краткое описание", { min: LIMITS.order.summaryMin, max: LIMITS.order.summaryMax }, errors);
  const description = readTextWithLimit(body.description, "description", "Полное описание", { min: LIMITS.order.descriptionMin, max: LIMITS.order.descriptionMax }, errors);
  const terms = readTextWithLimit(body.terms, "terms", "Условия сотрудничества", { min: LIMITS.order.termsMin, max: LIMITS.order.termsMax }, errors);
  const tags = readTags(body.tags, errors);
  const budget = readBudget(body.budgetFrom, body.budgetTo, errors);

  return validationResult({
    title,
    category,
    cityMajor,
    locationDetail,
    city: locationDetail ? `${cityMajor}, ${locationDetail}` : cityMajor,
    budgetFrom: budget.from,
    budgetTo: budget.to,
    budgetLabel: budget.label,
    summary,
    description,
    terms,
    tags,
  }, errors);
}

export function validateRegisterPayload(body = {}) {
  const errors = {};
  const companyName = readTextWithLimit(body.companyName, "companyName", "Название компании", { min: LIMITS.profile.companyNameMin, max: LIMITS.profile.companyNameMax }, errors);
  const displayName = readTextWithLimit(body.displayName, "displayName", "Контактное имя", { min: LIMITS.profile.displayNameMin, max: LIMITS.profile.displayNameMax }, errors);
  const city = readTextWithLimit(body.city, "city", "Город", { min: LIMITS.profile.cityMin, max: LIMITS.profile.cityMax }, errors);
  const industry = readTextWithLimit(body.industry, "industry", "Сфера", { min: LIMITS.profile.industryMin, max: LIMITS.profile.industryMax }, errors);
  const email = readEmail(body.email, "email", errors);
  const passwordResult = validatePassword(body.password);

  if (!passwordResult.ok) {
    errors.password = passwordResult.error;
  }

  return validationResult({
    companyName,
    displayName,
    city,
    industry,
    email,
    password: passwordResult.ok ? passwordResult.value : "",
  }, errors);
}

export function validateProfilePayload(body = {}, { requireCompanyFields = true } = {}) {
  const errors = {};
  const displayName = readTextWithLimit(body.displayName, "displayName", "Контактное имя", { min: LIMITS.profile.displayNameMin, max: LIMITS.profile.displayNameMax }, errors);
  const email = readEmail(body.email, "email", errors);
  const currentPassword = body.currentPassword === undefined || body.currentPassword === null ? "" : String(body.currentPassword);

  if (!currentPassword) {
    errors.currentPassword = "Введите текущий пароль.";
  }

  let companyName = "";
  let city = "";
  let phone = "";
  let industry = "";
  let description = "";
  let about = "";
  let specializations = [];

  if (requireCompanyFields) {
    companyName = readTextWithLimit(body.companyName, "companyName", "Название компании", { min: LIMITS.profile.companyNameMin, max: LIMITS.profile.companyNameMax }, errors);
    city = readTextWithLimit(body.city, "city", "Город", { min: LIMITS.profile.cityMin, max: LIMITS.profile.cityMax }, errors);
    phone = readTextWithLimit(body.phone, "phone", "Телефон", { max: LIMITS.profile.phoneMax, required: false }, errors);
    industry = readTextWithLimit(body.industry, "industry", "Отрасль", { min: LIMITS.profile.industryMin, max: LIMITS.profile.industryMax }, errors);
    description = readTextWithLimit(body.description, "description", "Описание компании", { min: LIMITS.profile.descriptionMin, max: LIMITS.profile.descriptionMax }, errors);
    about = readTextWithLimit(body.about, "about", "О компании", { min: LIMITS.profile.aboutMin, max: LIMITS.profile.aboutMax }, errors);
    specializations = readSpecializations(body.specializations, errors);
  }

  const avatarProvided = hasOwn(body, "avatarUrl");
  const avatar = avatarProvided ? validateAvatar(body.avatarUrl) : { ok: true, value: "", provided: false };

  if (!avatar.ok) {
    errors.avatarUrl = avatar.error;
  }

  const avatarPositionX = Number(body.avatarPositionX ?? 50);
  const avatarPositionY = Number(body.avatarPositionY ?? 50);
  const avatarScale = Number(body.avatarScale ?? 100);

  return validationResult({
    displayName,
    email,
    currentPassword,
    companyName,
    city,
    phone,
    industry,
    description,
    about,
    specializations,
    avatarProvided,
    avatarUrl: avatar.ok ? avatar.value : "",
    avatarPositionX: Number.isFinite(avatarPositionX) ? Math.max(0, Math.min(100, Math.round(avatarPositionX))) : 50,
    avatarPositionY: Number.isFinite(avatarPositionY) ? Math.max(0, Math.min(100, Math.round(avatarPositionY))) : 50,
    avatarScale: Number.isFinite(avatarScale) ? Math.max(100, Math.min(220, Math.round(avatarScale))) : 100,
  }, errors);
}

export function validateMessagePayload(body = {}) {
  const errors = {};
  const text = readTextWithLimit(body.text, "text", "Сообщение", { max: LIMITS.chat.messageMax, required: false }, errors);
  const attachments = validateAttachments(body.attachments);

  if (!attachments.ok) {
    errors.attachments = attachments.error;
  }

  if (!text && attachments.ok && attachments.value.length === 0) {
    errors.text = "Добавьте текст сообщения или вложение.";
  }

  return validationResult({
    text,
    attachments: attachments.ok ? attachments.value : [],
  }, errors);
}

export function validateReviewPayload(body = {}) {
  const errors = {};
  const text = readTextWithLimit(body.text, "text", "Текст отзыва", { max: LIMITS.review.textMax }, errors);
  const rating = Number(body.rating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = "Выберите оценку от 1 до 5.";
  }

  return validationResult({ text, rating }, errors);
}

export function validateChatOpenPayload(body = {}) {
  const errors = {};
  const companyId = readTextWithLimit(body.companyId, "companyId", "Компания", { min: 1, max: LIMITS.chat.idMax }, errors);
  const orderId = readTextWithLimit(body.orderId, "orderId", "Объявление", { max: LIMITS.chat.idMax, required: false }, errors);
  const subject = readTextWithLimit(body.subject, "subject", "Тема", { max: LIMITS.chat.subjectMax, required: false }, errors);

  return validationResult({ companyId, orderId, subject }, errors);
}

export function validateChatDetailsPayload(body = {}) {
  const errors = {};
  const value = {};

  if (hasOwn(body, "offeredDetails")) {
    value.offeredDetails = readTextWithLimit(body.offeredDetails, "offeredDetails", "Что предложили", { max: LIMITS.chat.detailsMax, required: false }, errors);
  }

  if (hasOwn(body, "agreementDetails")) {
    value.agreementDetails = readTextWithLimit(body.agreementDetails, "agreementDetails", "На чём сошлись", { max: LIMITS.chat.detailsMax, required: false }, errors);
  }

  if (!hasOwn(body, "offeredDetails") && !hasOwn(body, "agreementDetails")) {
    return { ok: false, message: "Нет полей для обновления.", fields: {} };
  }

  return validationResult(value, errors);
}

export function validateArchivePayload(body = {}) {
  if (typeof body.isArchived !== "boolean") {
    return {
      ok: false,
      message: "Поле isArchived должно быть boolean.",
      fields: { isArchived: "Укажите true или false." },
    };
  }

  return { ok: true, value: { isArchived: body.isArchived }, fields: {} };
}

export function validateStatusRequestPayload(body = {}) {
  const status = readText(body.status);

  if (!["negotiation", "closed"].includes(status)) {
    return {
      ok: false,
      message: "Некорректный статус переговоров.",
      fields: { status: "Допустимые статусы: negotiation, closed." },
    };
  }

  return { ok: true, value: { status }, fields: {} };
}

export function validateStatusResponsePayload(body = {}) {
  if (typeof body.accepted !== "boolean") {
    return {
      ok: false,
      message: "Поле accepted должно быть boolean.",
      fields: { accepted: "Укажите true или false." },
    };
  }

  return { ok: true, value: { accepted: body.accepted }, fields: {} };
}
