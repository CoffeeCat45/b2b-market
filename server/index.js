import crypto from "crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { isTransientDbError, pool, testConnection } from "./db.js";
import { getSnapshot, isReady, markDegraded, markReady, markSchemaReady, markWaking } from "./dbState.js";
import { lookupPartyByInn } from "./dadata.js";
import { formatDisplayDate } from "../shared/dates.js";
import {
  isIndividualInn,
  isValidInn,
  normalizeInn,
  validateCompanyLegalFields,
  validateVerificationDecision,
  validateVerificationPayload,
} from "../shared/verification.js";
import {
  validateArchivePayload,
  validateChatDetailsPayload,
  validateChatOpenPayload,
  validateMessagePayload,
  validateOrderPayload,
  validatePassword,
  validateProfilePayload,
  validateRegisterPayload,
  validateReviewPayload,
  validateStatusRequestPayload,
  validateStatusResponsePayload,
} from "../shared/validation.js";

const app = express();
const port = Number(process.env.PORT || 3000);

function readBoundedInt(raw, fallback, min, max) {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

const SESSION_TTL_DAYS = readBoundedInt(process.env.SESSION_TTL_DAYS, 30, 1, 365);
const LOGIN_RATE_LIMIT_MAX = readBoundedInt(process.env.LOGIN_RATE_LIMIT_MAX, 10, 1, 1000);
const LOGIN_RATE_LIMIT_WINDOW_MIN = readBoundedInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MIN, 15, 1, 1440);
const REGISTER_RATE_LIMIT_MAX = readBoundedInt(process.env.REGISTER_RATE_LIMIT_MAX, 5, 1, 1000);
const REGISTER_RATE_LIMIT_WINDOW_MIN = readBoundedInt(process.env.REGISTER_RATE_LIMIT_WINDOW_MIN, 60, 1, 1440);

const DEFAULT_CORS_ORIGINS = [
  "https://coffeecat45.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function readCorsOrigins(raw) {
  const configured = String(raw || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin && origin !== "*");

  return new Set(configured.length ? configured : DEFAULT_CORS_ORIGINS);
}

const allowedCorsOrigins = readCorsOrigins(process.env.CORS_ORIGINS);
const corsOptions = {
  origin(origin, callback) {
    callback(null, !origin || allowedCorsOrigins.has(origin));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.set("trust proxy", 1);
app.disable("x-powered-by");

// Хеширование паролей остаётся настраиваемым, но при плохом env всё равно откатывается к безопасному дефолту.
const parsedPasswordSaltRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);
const PASSWORD_SALT_ROUNDS =
  Number.isFinite(parsedPasswordSaltRounds) && parsedPasswordSaltRounds >= 8 && parsedPasswordSaltRounds <= 15
    ? parsedPasswordSaltRounds
    : 10;

app.use(helmet());
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "25mb" }));

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function isUniqueViolation(error) {
  return error?.code === "23505";
}

function sendValidationError(res, result) {
  return res.status(400).json({ message: result.message, fields: result.fields });
}

const DB_WAKING_MESSAGE = "База данных просыпается. Это может занять до минуты.";

function sendDbWaking(res) {
  res.set("Retry-After", "3");
  return res.status(503).json({
    code: "DB_WAKING",
    message: DB_WAKING_MESSAGE,
    retryAfterMs: 3000,
  });
}

function serverError(res, message, error) {
  console.error(message, error);
  if (isTransientDbError(error)) {
    markWaking();
    ensureDatabaseReady();
    return sendDbWaking(res);
  }
  return res.status(500).json({ message });
}

function requireDatabase(_req, res, next) {
  if (isReady()) return next();
  ensureDatabaseReady();
  return sendDbWaking(res);
}

async function writeAuditLog(req, action, { userId = null, companyId = null, details = {} } = {}, queryClient = pool) {
  try {
    await queryClient.query(
      `INSERT INTO audit_log (user_id, company_id, action, ip, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, companyId, action, req?.ip || null, JSON.stringify(details)],
    );
  } catch (error) {
    console.error("Не удалось записать audit log.", error);
  }
}

function createAuthRateLimiter({ windowMinutes, max, message, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler(req, res) {
      void writeAuditLog(req, "auth.rate_limited", { details: { path: req.path } });
      res.status(429).json({ message });
    },
  });
}

const loginRateLimiter = createAuthRateLimiter({
  windowMinutes: LOGIN_RATE_LIMIT_WINDOW_MIN,
  max: LOGIN_RATE_LIMIT_MAX,
  message: "Слишком много попыток входа. Попробуйте позже.",
  skipSuccessfulRequests: true,
});

const registerRateLimiter = createAuthRateLimiter({
  windowMinutes: REGISTER_RATE_LIMIT_WINDOW_MIN,
  max: REGISTER_RATE_LIMIT_MAX,
  message: "Слишком много попыток регистрации. Попробуйте позже.",
});

function createUserRateLimiter({ windowMinutes, max, message, action }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
    handler(req, res) {
      void writeAuditLog(req, action, { userId: req.user?.id || null, companyId: req.user?.companyId || null });
      res.status(429).json({ message });
    },
  });
}

const verificationRequestRateLimiter = createUserRateLimiter({
  windowMinutes: 60,
  max: 5,
  message: "Слишком много заявок на проверку. Попробуйте позже.",
  action: "verification.rate_limited",
});

const dadataRateLimiter = createUserRateLimiter({
  windowMinutes: 1,
  max: 10,
  message: "Слишком много запросов к ЕГРЮЛ. Попробуйте позже.",
  action: "dadata.rate_limited",
});

// Хелперы сессий и авторизации.
function getSessionExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function getUserByToken(token, queryClient = pool) {
  if (!token) return null;
  const result = await queryClient.query(
    `SELECT u.id, u.company_id AS "companyId", u.email, u.role, u.display_name AS "displayName", c.name AS company, c.city AS "companyCity", c.phone AS "companyPhone", c.industry, c.description, c.about, c.specializations, c.avatar_url AS "avatarUrl", c.avatar_position_x AS "avatarPositionX", c.avatar_position_y AS "avatarPositionY", c.avatar_scale AS "avatarScale", c.verification_status AS "verificationStatus", c.inn, c.legal_name AS "legalName", c.ogrn, c.legal_address AS "legalAddress"
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token],
  );
  return result.rows[0] ?? null;
}

async function authMiddleware(req, res, next) {
  try {
    const user = await getUserByToken(getBearerToken(req));
    if (!user) return res.status(401).json({ message: "Требуется авторизация." });
    req.user = user;
    next();
  } catch (error) {
    serverError(res, "Ошибка авторизации.", error);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Недостаточно прав." });
  next();
}

function optionalAuthMiddleware(req, _res, next) {
  const token = getBearerToken(req);

  if (!token) {
    req.user = null;
    next();
    return;
  }

  getUserByToken(token)
    .then((user) => {
      req.user = user || null;
      next();
    })
    .catch(() => {
      req.user = null;
      next();
    });
}

// Хелперы паролей поддерживают как bcrypt-хеши, так и старые plain-text записи.
function isBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

async function verifyPassword(storedPassword, providedPassword) {
  if (!storedPassword) return false;

  if (isBcryptHash(storedPassword)) {
    return bcrypt.compare(providedPassword, storedPassword);
  }

  return storedPassword === providedPassword;
}

async function hashPassword(password) {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

function hasBrokenEncodingValue(value) {
  if (typeof value === "string") {
    return value.includes(String.fromCharCode(0xfffd)) || /\?{3,}/u.test(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasBrokenEncodingValue(item));
  }

  return false;
}

function normalizeLifecycleStatus(status) {
  const normalized = String(status || "").trim();

  if (!normalized || normalized === "active") {
    return "negotiation";
  }

  if (["negotiation", "closed", "archived"].includes(normalized)) {
    return normalized;
  }

  return "negotiation";
}

// Хелперы чатов нормализуют legacy-статусы и переиспользуют проверки ролей между endpoint-ами.
async function getChatForUser(chatId, user) {
  const result = await pool.query(
    `SELECT id, company_a_id AS "companyAId", company_b_id AS "companyBId", CASE WHEN $3 = '' THEN FALSE ELSE EXISTS (SELECT 1 FROM chat_archives archive_state WHERE archive_state.chat_id = chats.id AND archive_state.company_id = $3) END AS "isArchived", lifecycle_status AS "lifecycleStatus", pending_status AS "pendingStatus", pending_status_requested_by_company_id AS "pendingStatusRequestedByCompanyId"
       FROM chats
       WHERE id = $1 AND ($2 = 'admin' OR company_a_id = $3 OR company_b_id = $3)`,
    [chatId, user.role, user.companyId || ""],
  );
  return result.rows[0] ?? null;
}

async function findChatByPair(executor, companyId, otherCompanyId, orderId) {
  const result = await executor.query(
    `SELECT id
     FROM chats
     WHERE LEAST(company_a_id, company_b_id) = LEAST($1::text, $2::text)
       AND GREATEST(company_a_id, company_b_id) = GREATEST($1::text, $2::text)
       AND COALESCE(order_id, '') = COALESCE($3::text, '')
     LIMIT 1`,
    [companyId, otherCompanyId, orderId],
  );
  return result.rows[0] ?? null;
}

// Сервисные и auth-маршруты.
// Health всегда 200 и без запроса в БД: Render считает сервис живым, пока порт отвечает.
app.get("/api/health", (_req, res) => {
  const snapshot = getSnapshot();
  res.json({
    ok: true,
    ready: snapshot.ready,
    database: snapshot.ready ? "connected" : snapshot.phase === "degraded" ? "degraded" : "waking",
    schemaReady: snapshot.schemaReady,
    startedAt: snapshot.startedAt,
    checkedAt: new Date().toISOString(),
  });
});

app.use("/api", requireDatabase);

app.get("/api/locations", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT city
       FROM (
         SELECT NULLIF(TRIM(city), '') AS city FROM companies
         UNION
         SELECT NULLIF(TRIM(city), '') AS city FROM suppliers
         UNION
         SELECT NULLIF(TRIM(city_major), '') AS city FROM orders
       ) locations
       WHERE city IS NOT NULL
       ORDER BY city ASC`,
    );

    res.json({ cities: result.rows.map((row) => row.city) });
  } catch (error) {
    serverError(res, "Не удалось получить список городов.", error);
  }
});

app.get("/api/industries", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT industry
       FROM (
         SELECT NULLIF(TRIM(industry), '') AS industry FROM companies
         UNION
         SELECT NULLIF(TRIM(industry), '') AS industry FROM suppliers
         UNION
         SELECT NULLIF(TRIM(category), '') AS industry FROM orders
       ) industries
       WHERE industry IS NOT NULL
       ORDER BY industry ASC`,
    );

    res.json({ industries: result.rows.map((row) => row.industry) });
  } catch (error) {
    serverError(res, "Не удалось получить список отраслей.", error);
  }
});

app.post("/api/auth/register", registerRateLimiter, async (req, res) => {
  let client;

  try {
    client = await pool.connect();
    const validation = validateRegisterPayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const { companyName, displayName, city, industry, email, password } = validation.value;

    await client.query("BEGIN");

    const existingUser = await client.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingUser.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Пользователь с таким email уже существует." });
    }

    const companyId = `cmp-${crypto.randomUUID()}`;
    const userId = `usr-${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);

    await client.query(
      `INSERT INTO companies (id, name, city, phone, industry, rating, description, about, specializations, reviews)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
      [
        companyId,
        companyName,
        city,
        "",
        industry,
        0,
        "",
        "",
        JSON.stringify([industry]),
        JSON.stringify([]),
      ],
    );

    await client.query(
      `INSERT INTO users (id, company_id, email, password, role, display_name)
       VALUES ($1, $2, $3, $4, 'company', $5)`,
      [userId, companyId, email, passwordHash, displayName],
    );

    const token = crypto.randomUUID();
    await client.query(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
      [token, userId, getSessionExpiresAt()],
    );

    await client.query("COMMIT");
    await writeAuditLog(req, "auth.register", { userId, companyId, details: { email } }, client);

    res.status(201).json({
      token,
      user: {
        id: userId,
        companyId,
        email,
        role: "company",
        displayName,
        company: companyName,
        companyCity: city,
        companyPhone: "",
        industry,
        description: "",
        about: "",
        specializations: [industry],
        verificationStatus: "none",
        inn: "",
        legalName: "",
        ogrn: "",
        legalAddress: "",
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
    }
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: "Пользователь с таким email уже существует.", fields: { email: "Этот email уже занят." } });
    }
    serverError(res, "Не удалось зарегистрировать аккаунт.", error);
  } finally {
    client?.release();
  }
});
app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await pool.query(
      `SELECT u.id, u.company_id AS "companyId", u.email, u.password, u.role, u.display_name AS "displayName", c.name AS company, c.city AS "companyCity", c.phone AS "companyPhone", c.industry, c.description, c.about, c.specializations, c.avatar_url AS "avatarUrl", c.avatar_position_x AS "avatarPositionX", c.avatar_position_y AS "avatarPositionY", c.avatar_scale AS "avatarScale", c.verification_status AS "verificationStatus", c.inn, c.legal_name AS "legalName", c.ogrn, c.legal_address AS "legalAddress"
       FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.email = $1`,
      [String(email || "").trim().toLowerCase()],
    );
    const user = result.rows[0];
    const normalizedPassword = String(password || "");
    const passwordOk = user ? await verifyPassword(user.password, normalizedPassword) : false;
    if (!user || !passwordOk) {
      await writeAuditLog(req, "auth.login_failed", {
        userId: user?.id || null,
        companyId: user?.companyId || null,
        details: { email: String(email || "").trim().toLowerCase().slice(0, 254) },
      });
      return res.status(401).json({ message: "Неверный email или пароль." });
    }

    if (!isBcryptHash(user.password)) {
      const nextHash = await hashPassword(normalizedPassword);
      await pool.query("UPDATE users SET password = $2 WHERE id = $1", [user.id, nextHash]);
      user.password = nextHash;
    }

    const token = crypto.randomUUID();
    await pool.query(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)",
      [token, user.id, getSessionExpiresAt()],
    );
    await writeAuditLog(req, "auth.login", { userId: user.id, companyId: user.companyId || null });
    delete user.password;
    res.json({ token, user });
  } catch (error) {
    serverError(res, "Не удалось выполнить вход.", error);
  }
});

app.post("/api/auth/verify-password", authMiddleware, async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    const result = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
    const storedPassword = result.rows[0]?.password || "";
    const ok = await verifyPassword(storedPassword, password);

    if (!ok) return res.status(401).json({ message: "Неверный пароль.", fields: { password: "Неверный пароль." } });

    res.json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось подтвердить пароль.", error);
  }
});

app.put("/api/auth/password", authMiddleware, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const nextPasswordResult = validatePassword(req.body?.nextPassword, { field: "nextPassword", label: "Новый пароль" });

    if (!nextPasswordResult.ok) {
      return res.status(400).json({ message: nextPasswordResult.error, fields: { [nextPasswordResult.field]: nextPasswordResult.error } });
    }

    const nextPassword = nextPasswordResult.value;
    const result = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
    const storedPassword = result.rows[0]?.password || "";
    const passwordOk = await verifyPassword(storedPassword, currentPassword);

    if (!passwordOk) {
      return res.status(401).json({ message: "Неверный пароль.", fields: { currentPassword: "Неверный пароль." } });
    }

    const nextHash = await hashPassword(nextPassword);
    await pool.query("UPDATE users SET password = $2 WHERE id = $1", [req.user.id, nextHash]);

    await pool.query("DELETE FROM sessions WHERE user_id = $1 AND token <> $2", [req.user.id, getBearerToken(req)]);
    await writeAuditLog(req, "auth.password_changed", { userId: req.user.id, companyId: req.user.companyId || null });

    res.json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось сменить пароль.", error);
  }
});

app.delete("/api/auth/company", authMiddleware, async (req, res) => {
  let client;

  try {
    client = await pool.connect();

    if (req.user.role !== "company" || !req.user.companyId) {
      return res.status(403).json({ message: "Удалить можно только аккаунт компании." });
    }

    const password = String(req.body?.password || "");
    const result = await client.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
    const storedPassword = result.rows[0]?.password || "";
    const passwordOk = await verifyPassword(storedPassword, password);

    if (!passwordOk) {
      return res.status(401).json({ message: "Неверный пароль." });
    }

    await client.query("BEGIN");
    await client.query("DELETE FROM users WHERE company_id = $1", [req.user.companyId]);
    await client.query("DELETE FROM companies WHERE id = $1", [req.user.companyId]);
    await client.query("COMMIT");
    await writeAuditLog(req, "auth.company_deleted", { userId: req.user.id, companyId: req.user.companyId }, client);

    res.json({ ok: true });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
    }
    serverError(res, "Не удалось удалить компанию.", error);
  } finally {
    client?.release();
  }
});

const LEGAL_PROFILE_KEYS = ["inn", "legalName", "ogrn", "legalAddress"];

async function updateProfileData(req, res, user, body, token, sharedClient = null) {
  let client = sharedClient;
  const shouldReleaseClient = !sharedClient;
  let inTransaction = false;

  try {
    if (!client) {
      client = await pool.connect();
    }

    const profileBody = body || {};
    const validation = validateProfilePayload(profileBody, { requireCompanyFields: Boolean(user.companyId) });

    if (!validation.ok) return sendValidationError(res, validation);

    const value = validation.value;

    const legalProvided = Boolean(user.companyId)
      && LEGAL_PROFILE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(profileBody, key));
    const legalValidation = legalProvided
      ? validateCompanyLegalFields({
        inn: profileBody.inn,
        legalName: profileBody.legalName,
        ogrn: profileBody.ogrn,
        legalAddress: profileBody.legalAddress,
      })
      : null;

    if (legalValidation && !legalValidation.ok) return sendValidationError(res, legalValidation);

    if (hasBrokenEncodingValue([value.displayName, value.companyName, value.city, value.industry, value.description, value.about, value.specializations])) {
      return res.status(400).json({ message: "Данные выглядят как сломанная кодировка. Обновите страницу и введите текст заново." });
    }

    const userResult = await client.query("SELECT password FROM users WHERE id = $1", [user.id]);
    const storedPassword = userResult.rows[0]?.password || "";
    const passwordOk = await verifyPassword(storedPassword, value.currentPassword);

    if (!passwordOk) {
      return res.status(401).json({ message: "Неверный пароль.", fields: { currentPassword: "Неверный пароль." } });
    }

    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '3000ms'");
    await client.query("SET LOCAL statement_timeout = '8000ms'");

    const existingUser = await client.query("SELECT id FROM users WHERE email = $1 AND id <> $2", [value.email, user.id]);
    if (existingUser.rows[0]) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(409).json({ message: "Пользователь с таким email уже существует.", fields: { email: "Этот email уже занят." } });
    }

    await client.query("UPDATE users SET display_name = $2, email = $3 WHERE id = $1", [user.id, value.displayName, value.email]);

    if (user.companyId) {
      const companyResult = await client.query(
        `SELECT inn, legal_name AS "legalName", ogrn, legal_address AS "legalAddress", verification_status AS "verificationStatus"
         FROM companies
         WHERE id = $1
         FOR UPDATE`,
        [user.companyId],
      );
      const currentCompany = companyResult.rows[0];

      if (!currentCompany) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return res.status(404).json({ message: "Компания не найдена." });
      }

      const nextLegal = legalValidation?.value ?? {
        inn: currentCompany.inn || "",
        legalName: currentCompany.legalName || "",
        ogrn: currentCompany.ogrn || "",
        legalAddress: currentCompany.legalAddress || "",
      };

      const legalChanged = nextLegal.inn !== (currentCompany.inn || "")
        || nextLegal.legalName !== (currentCompany.legalName || "")
        || nextLegal.ogrn !== (currentCompany.ogrn || "")
        || nextLegal.legalAddress !== (currentCompany.legalAddress || "");
      const resetVerification = legalChanged && ["approved", "pending"].includes(currentCompany.verificationStatus);

      if (nextLegal.inn) {
        const duplicateInn = await client.query("SELECT id FROM companies WHERE inn = $1 AND id <> $2", [nextLegal.inn, user.companyId]);
        if (duplicateInn.rows[0]) {
          await client.query("ROLLBACK");
          inTransaction = false;
          return res.status(409).json({ message: "Этот ИНН уже привязан к другой компании.", fields: { inn: "Этот ИНН уже привязан к другой компании." } });
        }
      }

      await client.query(
        `UPDATE companies
         SET name = $2,
             city = $3,
             phone = $4,
             industry = $5,
             description = $6,
             about = $7,
             specializations = $8::jsonb,
             avatar_url = CASE WHEN $9 THEN $10 ELSE avatar_url END,
             avatar_position_x = $11,
             avatar_position_y = $12,
             avatar_scale = $13,
             inn = $14,
             legal_name = $15,
             ogrn = $16,
             legal_address = $17,
             verification_status = CASE WHEN $18 THEN 'none' ELSE verification_status END,
             verification_reason = CASE WHEN $18 THEN '' ELSE verification_reason END,
             verification_requested_at = CASE WHEN $18 THEN NULL ELSE verification_requested_at END,
             verification_reviewed_at = CASE WHEN $18 THEN NULL ELSE verification_reviewed_at END,
             verification_reviewed_by = CASE WHEN $18 THEN NULL ELSE verification_reviewed_by END
         WHERE id = $1`,
        [
          user.companyId,
          value.companyName,
          value.city,
          value.phone,
          value.industry,
          value.description,
          value.about,
          JSON.stringify(value.specializations),
          value.avatarProvided,
          value.avatarUrl,
          value.avatarPositionX,
          value.avatarPositionY,
          value.avatarScale,
          nextLegal.inn,
          nextLegal.legalName,
          nextLegal.ogrn,
          nextLegal.legalAddress,
          resetVerification,
        ],
      );
    }

    await client.query("COMMIT");
    inTransaction = false;
    await writeAuditLog(req, "auth.profile_updated", { userId: user.id, companyId: user.companyId || null }, client);

    const refreshed = await getUserByToken(token, client);
    res.json({ ok: true, user: refreshed });
  } catch (error) {
    if (inTransaction && client) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
    }
    if (isUniqueViolation(error)) {
      if (error.constraint === "companies_inn_unique_idx") {
        return res.status(409).json({ message: "Этот ИНН уже привязан к другой компании.", fields: { inn: "Этот ИНН уже привязан к другой компании." } });
      }
      return res.status(409).json({ message: "Пользователь с таким email уже существует.", fields: { email: "Этот email уже занят." } });
    }
    serverError(res, "Не удалось обновить данные профиля.", error);
  } finally {
    if (shouldReleaseClient && client) {
      client.release();
    }
  }
}

app.put("/api/auth/profile", authMiddleware, async (req, res) => {
  await updateProfileData(req, res, req.user, req.body || {}, getBearerToken(req));
});

app.get("/api/auth/me", authMiddleware, async (req, res) => res.json({ user: req.user }));
app.post("/api/auth/logout", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM sessions WHERE token = $1", [getBearerToken(req)]);
    await writeAuditLog(req, "auth.logout", { userId: req.user.id, companyId: req.user.companyId || null });
    res.json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось завершить сеанс.", error);
  }
});

// Объявления и управление каталогом.
app.get("/api/orders", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.title, o.category, o.city_major AS "cityMajor", o.location_detail AS "locationDetail", o.city,
              o.budget_from AS "budgetFrom", o.budget_to AS "budgetTo", o.budget_label AS budget,
              o.summary, o.description, o.terms, o.tags, o.published_at AS "publishedAt",
              c.id AS "companyId", c.name AS company, c.verification_status AS "verificationStatus", c.verification_reviewed_at AS "verificationReviewedAt",
              COUNT(DISTINCT ov.user_id)::integer AS "viewsCount"
       FROM orders o
       JOIN companies c ON c.id = o.company_id
       LEFT JOIN order_views ov ON ov.order_id = o.id
       GROUP BY o.id, c.id, c.name, c.verification_status, c.verification_reviewed_at
       ORDER BY o.sort_order ASC, o.id ASC`,
    );
    res.json(result.rows.map((row) => ({
      ...row,
      tags: Array.isArray(row.tags) ? row.tags : [],
      date: formatDisplayDate(row.publishedAt),
    })));
  } catch (error) {
    serverError(res, "Не удалось получить список заказов.", error);
  }
});

app.post("/api/orders", authMiddleware, async (req, res) => {
  try {
    const validation = validateOrderPayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const payload = validation.value;
    const id = `ord-${crypto.randomUUID()}`;
    const companyId = req.user.role === "admin" ? String(req.body?.companyId || "").trim() : req.user.companyId;
    if (!companyId) return res.status(400).json({ message: "Выберите компанию для объявления.", fields: { companyId: "Выберите компанию." } });

    const companyExists = await pool.query("SELECT id FROM companies WHERE id = $1", [companyId]);
    if (!companyExists.rows[0]) return res.status(404).json({ message: "Компания для объявления не найдена." });

    await pool.query(
      `INSERT INTO orders (id, company_id, title, category, city_major, location_detail, city, budget_from, budget_to, budget_label, summary, description, terms, tags, published_at, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,COALESCE((SELECT MAX(sort_order)+1 FROM orders),1))`,
      [id, companyId, payload.title, payload.category, payload.cityMajor, payload.locationDetail, payload.city, payload.budgetFrom, payload.budgetTo, payload.budgetLabel, payload.summary, payload.description, payload.terms, JSON.stringify(payload.tags), new Date().toISOString()],
    );
    res.status(201).json({ ok: true, id });
  } catch (error) {
    serverError(res, "Не удалось создать объявление.", error);
  }
});

app.put("/api/orders/:id", authMiddleware, async (req, res) => {
  try {
    const existing = await pool.query("SELECT company_id AS \"companyId\", published_at AS \"publishedAt\" FROM orders WHERE id = $1", [req.params.id]);
    const order = existing.rows[0];
    if (!order) return res.status(404).json({ message: "Объявление не найдено." });
    if (!(req.user.role === "admin" || req.user.companyId === order.companyId)) return res.status(403).json({ message: "Недостаточно прав." });

    const validation = validateOrderPayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const payload = validation.value;
    const nextCompanyId = req.user.role === "admin" ? String(req.body?.companyId || order.companyId).trim() : order.companyId;
    const companyExists = await pool.query("SELECT id FROM companies WHERE id = $1", [nextCompanyId]);
    if (!companyExists.rows[0]) return res.status(404).json({ message: "Компания для объявления не найдена." });

    await pool.query(
      `UPDATE orders SET company_id=$2, title=$3, category=$4, city_major=$5, location_detail=$6, city=$7, budget_from=$8, budget_to=$9, budget_label=$10, summary=$11, description=$12, terms=$13, tags=$14::jsonb, published_at=$15 WHERE id=$1`,
      [req.params.id, nextCompanyId, payload.title, payload.category, payload.cityMajor, payload.locationDetail, payload.city, payload.budgetFrom, payload.budgetTo, payload.budgetLabel, payload.summary, payload.description, payload.terms, JSON.stringify(payload.tags), order.publishedAt],
    );
    res.json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось обновить объявление.", error);
  }
});

app.delete("/api/orders/:id", authMiddleware, async (req, res) => {
  try {
    const existing = await pool.query("SELECT company_id AS \"companyId\" FROM orders WHERE id = $1", [req.params.id]);
    const order = existing.rows[0];
    if (!order) return res.status(404).json({ message: "Объявление не найдено." });
    if (!(req.user.role === "admin" || req.user.companyId === order.companyId)) return res.status(403).json({ message: "Недостаточно прав." });
    await pool.query("DELETE FROM orders WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось удалить объявление.", error);
  }
});

app.post("/api/orders/:id/view", optionalAuthMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const existingOrder = await pool.query(
      `SELECT id, company_id AS "companyId" FROM orders WHERE id = $1`,
      [orderId],
    );
    if (!existingOrder.rows[0]) return res.status(404).json({ message: "Объявление не найдено." });

    const isOwner = Boolean(req.user?.companyId && req.user.companyId === existingOrder.rows[0].companyId);

    if (req.user?.id && !isOwner) {
      await pool.query(
        `INSERT INTO order_views (order_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (order_id, user_id) DO NOTHING`,
        [orderId, req.user.id],
      );
    }

    const stats = await pool.query(
      `SELECT COUNT(DISTINCT user_id)::integer AS "viewsCount"
       FROM order_views
       WHERE order_id = $1`,
      [orderId],
    );

    res.status(201).json({ ok: true, viewsCount: stats.rows[0]?.viewsCount ?? 0 });
  } catch (error) {
    serverError(res, "Не удалось сохранить просмотр.", error);
  }
});

// Сценарий переговоров с chat-first логикой.
app.post("/api/chats/open", authMiddleware, async (req, res) => {
  let client;
  let otherCompanyId = "";
  let orderId = null;

  try {
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может открывать чаты." });
    }

    const validation = validateChatOpenPayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const parsed = validation.value;
    otherCompanyId = parsed.companyId;
    orderId = parsed.orderId || null;
    let subject = parsed.subject;

    if (otherCompanyId === req.user.companyId) {
      return res.status(400).json({ message: "Нельзя открыть чат со своей компанией." });
    }

    const otherCompany = await pool.query("SELECT id FROM companies WHERE id = $1", [otherCompanyId]);
    if (!otherCompany.rows[0]) return res.status(404).json({ message: "Компания для чата не найдена." });

    if (orderId) {
      const orderResult = await pool.query(
        `SELECT id, company_id AS "companyId", title, budget_label AS budget, summary, terms
         FROM orders
         WHERE id = $1`,
        [orderId],
      );
      const orderDetails = orderResult.rows[0] ?? null;
      if (!orderDetails) return res.status(404).json({ message: "Объявление не найдено." });
      if (orderDetails.companyId !== otherCompanyId) {
        return res.status(400).json({ message: "Объявление принадлежит другой компании.", fields: { companyId: "Выберите компанию, которой принадлежит объявление." } });
      }
      if (!subject) subject = `Отклик по объявлению: ${orderDetails.title}`;
    }

    if (!subject) {
      subject = "Обсуждение сотрудничества";
    }

    // Блокировка на пару компаний и заказ закрывает гонку двух одновременных «Написать».
    client = await pool.connect();
    await client.query("BEGIN");
    const lockKey = `${[req.user.companyId, otherCompanyId].sort().join(":")}:${orderId || ""}`;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [lockKey]);

    const existing = await findChatByPair(client, req.user.companyId, otherCompanyId, orderId);
    const chatId = existing?.id || `chat-${crypto.randomUUID()}`;

    if (!existing) {
      await client.query(
        `INSERT INTO chats (id, company_a_id, company_b_id, order_id, subject)
         VALUES ($1, $2, $3, $4, $5)`,
        [chatId, req.user.companyId, otherCompanyId, orderId, subject],
      );
    }

    await client.query(
      `INSERT INTO chat_reads (chat_id, company_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (chat_id, company_id)
       DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
      [chatId, req.user.companyId],
    );

    await client.query("COMMIT");
    res.json({ ok: true, chatId });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
    }

    if (error?.code === "23505" && client && otherCompanyId) {
      try {
        const existing = await findChatByPair(client, req.user.companyId, otherCompanyId, orderId);
        if (existing) {
          await client.query(
            `INSERT INTO chat_reads (chat_id, company_id, last_read_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (chat_id, company_id)
             DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
            [existing.id, req.user.companyId],
          );
          return res.json({ ok: true, chatId: existing.id });
        }
      } catch {
      }
    }

    serverError(res, "Не удалось открыть чат.", error);
  } finally {
    client?.release();
  }
});
app.get("/api/chats", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ch.id,
              ch.subject,
              ch.order_id AS "orderId",
              CASE WHEN $2 = '' THEN FALSE ELSE EXISTS (SELECT 1 FROM chat_archives archive_state WHERE archive_state.chat_id = ch.id AND archive_state.company_id = $2) END AS "isArchived",
              ch.lifecycle_status AS "lifecycleStatus",
              ch.pending_status AS "pendingStatus",
              ch.pending_status_requested_by_company_id AS "pendingStatusRequestedByCompanyId",
              CASE
                WHEN $2 = '' THEN 0
                ELSE COALESCE((SELECT COUNT(*)::integer
                               FROM chat_messages m
                               WHERE m.chat_id = ch.id
                                 AND m.sender_company_id <> $2
                                 AND m.created_at > COALESCE(cr.last_read_at, 'epoch'::timestamptz)), 0)
              END AS "unreadCount",
              to_char(cr.last_read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastReadAtIso",
              ch.offered_details AS "offeredDetails",
              ch.agreement_details AS "agreementDetails",
              to_char(ch.created_at, 'DD.MM.YYYY HH24:MI') AS "createdAt",
              ch.company_a_id AS "initiatorCompanyId",
              CASE
                WHEN $2 <> '' AND ch.company_a_id = $2 THEN ch.company_b_id
                WHEN $2 <> '' AND ch.company_b_id = $2 THEN ch.company_a_id
                ELSE NULL
              END AS "otherCompanyId",
              ca.name AS "companyA",
              cb.name AS "companyB",
              CASE
                WHEN $2 <> '' AND ch.company_a_id = $2 THEN cb.name
                WHEN $2 <> '' AND ch.company_b_id = $2 THEN ca.name
                ELSE CONCAT(ca.name, ' / ', cb.name)
              END AS "otherCompanyName",
              CASE
                WHEN $2 <> '' AND ch.company_a_id = $2 THEN SUBSTRING(cb.name FROM 1 FOR 2)
                WHEN $2 <> '' AND ch.company_b_id = $2 THEN SUBSTRING(ca.name FROM 1 FOR 2)
                ELSE SUBSTRING(CONCAT(ca.name, ' / ', cb.name) FROM 1 FOR 2)
              END AS initials,
              CASE
                WHEN $2 <> '' AND ch.company_a_id = $2 THEN cb.avatar_url
                WHEN $2 <> '' AND ch.company_b_id = $2 THEN ca.avatar_url
                ELSE ''
              END AS "otherCompanyAvatarUrl",
              CASE
                WHEN $2 <> '' AND ch.company_a_id = $2 THEN cb.avatar_position_x
                WHEN $2 <> '' AND ch.company_b_id = $2 THEN ca.avatar_position_x
                ELSE 50
              END AS "otherCompanyAvatarPositionX",
              CASE
                WHEN $2 <> '' AND ch.company_a_id = $2 THEN cb.avatar_position_y
                WHEN $2 <> '' AND ch.company_b_id = $2 THEN ca.avatar_position_y
                ELSE 50
              END AS "otherCompanyAvatarPositionY",
              CASE
                WHEN $2 <> '' AND ch.company_a_id = $2 THEN cb.avatar_scale
                WHEN $2 <> '' AND ch.company_b_id = $2 THEN ca.avatar_scale
                ELSE 100
              END AS "otherCompanyAvatarScale",
              COALESCE(o.title, ch.subject) AS "contractTitle",
              o.title AS "orderTitle",
              o.budget_label AS "orderBudget",
              o.summary AS "orderSummary",
              o.terms AS "orderTerms",
              o.company_id AS "orderCompanyId",
              last_message.sender_company_id AS "lastSenderCompanyId",
              COALESCE(to_char(last_message.created_at, 'DD.MM.YYYY HH24:MI'), to_char(ch.created_at, 'DD.MM.YYYY HH24:MI')) AS "lastActivityAt",
              COALESCE(to_char(last_message.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), to_char(ch.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS "lastActivityAtIso",
              CASE
                WHEN NULLIF(last_message.text, '') IS NOT NULL THEN LEFT(last_message.text, 160)
                WHEN last_message.attachments_count > 0 THEN 'Вложений: ' || last_message.attachments_count
                ELSE NULL
              END AS "lastMessagePreview"
       FROM chats ch
       JOIN companies ca ON ca.id = ch.company_a_id
       JOIN companies cb ON cb.id = ch.company_b_id
       LEFT JOIN orders o ON o.id = ch.order_id
       LEFT JOIN chat_reads cr ON cr.chat_id = ch.id AND cr.company_id = NULLIF($2, '')
       LEFT JOIN LATERAL (
         SELECT m.sender_company_id,
                m.text,
                m.attachments,
                m.created_at,
                CASE WHEN jsonb_typeof(m.attachments) = 'array' THEN jsonb_array_length(m.attachments) ELSE 0 END AS attachments_count
         FROM chat_messages m
         WHERE m.chat_id = ch.id
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT 1
       ) last_message ON TRUE
       WHERE $1 = 'admin' OR ch.company_a_id = $2 OR ch.company_b_id = $2
       ORDER BY CASE WHEN $2 = '' THEN FALSE ELSE EXISTS (SELECT 1 FROM chat_archives archive_state WHERE archive_state.chat_id = ch.id AND archive_state.company_id = $2) END ASC,
                COALESCE(last_message.created_at, ch.created_at) DESC,
                ch.created_at DESC`,
      [req.user.role, req.user.companyId || ""],
    );
    res.json(result.rows);
  } catch (error) {
    serverError(res, "Не удалось получить чаты.", error);
  }
});

app.get("/api/chats/:id/messages", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });

    const limit = readBoundedInt(req.query.limit, 50, 1, 100);
    const beforeId = String(req.query.beforeId || "").trim().slice(0, 120);
    const afterId = String(req.query.afterId || "").trim().slice(0, 120);

    if (beforeId && afterId) {
      return res.status(400).json({ message: "Укажите только одно направление загрузки сообщений." });
    }

    const cursorId = beforeId || afterId;
    const params = [req.params.id];
    let cursorCondition = "";

    if (cursorId) {
      params.push(cursorId);
      cursorCondition = beforeId
        ? `AND (m.created_at, m.id) < (
             SELECT cursor.created_at, cursor.id
             FROM chat_messages cursor
             WHERE cursor.id = $2 AND cursor.chat_id = $1
           )`
        : `AND (m.created_at, m.id) > (
             SELECT cursor.created_at, cursor.id
             FROM chat_messages cursor
             WHERE cursor.id = $2 AND cursor.chat_id = $1
           )`;
    }

    params.push(limit + 1);
    const limitParam = `$${params.length}`;
    const orderDirection = afterId ? "ASC" : "DESC";

    const result = await pool.query(
      `SELECT m.id,
              m.text,
              to_char(m.created_at, 'DD.MM.YYYY HH24:MI') AS "createdAt",
              to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAtIso",
              m.sender_company_id AS "senderCompanyId",
              m.attachments
       FROM chat_messages m
       WHERE m.chat_id = $1 ${cursorCondition}
       ORDER BY m.created_at ${orderDirection}, m.id ${orderDirection}
       LIMIT ${limitParam}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const messages = afterId ? rows : rows.reverse();

    res.json({ messages, hasMore });
  } catch (error) {
    serverError(res, "Не удалось получить сообщения чата.", error);
  }
});

app.post("/api/chats/:id/read", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) return res.json({ ok: true });

    await pool.query(
      `INSERT INTO chat_reads (chat_id, company_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (chat_id, company_id)
       DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
      [req.params.id, req.user.companyId],
    );

    res.json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось отметить чат как прочитанный.", error);
  }
});

app.delete("/api/chats/:id", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Удалить переписку может только администратор. Компания может перенести чат в архив." });
    }

    await pool.query("DELETE FROM chats WHERE id = $1", [req.params.id]);
    await writeAuditLog(req, "admin.chat_deleted", { userId: req.user.id, details: { chatId: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось удалить чат.", error);
  }
});

app.put("/api/chats/:id/details", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });

    const validation = validateChatDetailsPayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const value = validation.value;

    await pool.query(
      `UPDATE chats
       SET offered_details = COALESCE($2, offered_details),
           agreement_details = COALESCE($3, agreement_details)
       WHERE id = $1`,
      [req.params.id, value.offeredDetails ?? null, value.agreementDetails ?? null],
    );

    res.json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось обновить данные чата.", error);
  }
});

app.put("/api/chats/:id/archive", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может архивировать чат." });
    }

    const validation = validateArchivePayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const { isArchived } = validation.value;

    if (isArchived) {
      await pool.query(
        `INSERT INTO chat_archives (chat_id, company_id, archived_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (chat_id, company_id)
         DO UPDATE SET archived_at = EXCLUDED.archived_at`,
        [req.params.id, req.user.companyId],
      );
    } else {
      await pool.query(
        `DELETE FROM chat_archives
         WHERE chat_id = $1 AND company_id = $2`,
        [req.params.id, req.user.companyId],
      );
    }

    res.json({ ok: true, isArchived });
  } catch (error) {
    serverError(res, "Не удалось обновить архив чата.", error);
  }
});

app.put("/api/chats/:id/status-request", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может менять статус переговоров." });
    }

    const validation = validateStatusRequestPayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const { status: nextStatus } = validation.value;

    if (chat.pendingStatus) {
      return res.status(409).json({ message: "Уже есть активный запрос на смену статуса. Дождитесь ответа второй стороны." });
    }

    const currentStatus = normalizeLifecycleStatus(chat.lifecycleStatus);
    if (nextStatus === currentStatus) {
      return res.json({ ok: true, lifecycleStatus: currentStatus, isArchived: chat.isArchived, pendingStatus: null });
    }

    await pool.query(
      `UPDATE chats
       SET pending_status = $2,
           pending_status_requested_by_company_id = $3
       WHERE id = $1`,
      [req.params.id, nextStatus, req.user.companyId],
    );

    res.json({ ok: true, pendingStatus: nextStatus });
  } catch (error) {
    serverError(res, "Не удалось отправить запрос на смену статуса.", error);
  }
});

app.post("/api/chats/:id/status-request/respond", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может подтверждать статус переговоров." });
    }
    if (!chat.pendingStatus) {
      return res.status(400).json({ message: "Нет активного запроса на смену статуса." });
    }
    if (chat.pendingStatusRequestedByCompanyId === req.user.companyId) {
      return res.status(403).json({ message: "Нельзя подтверждать или отклонять собственный запрос на смену статуса." });
    }

    const validation = validateStatusResponsePayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const { accepted } = validation.value;

    if (accepted) {
      const nextLifecycleStatus = normalizeLifecycleStatus(chat.pendingStatus);

      await pool.query(
        `UPDATE chats
         SET lifecycle_status = $2,
             pending_status = NULL,
             pending_status_requested_by_company_id = NULL
         WHERE id = $1`,
        [req.params.id, nextLifecycleStatus],
      );

      return res.json({ ok: true, accepted: true, lifecycleStatus: nextLifecycleStatus });
    }

    await pool.query(
      `UPDATE chats
       SET pending_status = NULL,
           pending_status_requested_by_company_id = NULL
       WHERE id = $1`,
      [req.params.id],
    );

    res.json({ ok: true, accepted: false });
  } catch (error) {
    serverError(res, "Не удалось обработать запрос на смену статуса.", error);
  }
});

app.post("/api/chats/:id/messages", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может отправлять сообщения." });
    }
    if (normalizeLifecycleStatus(chat.lifecycleStatus) === "closed") {
      return res.status(400).json({ message: "Переписка закрыта. Чтобы продолжить общение, откройте новый чат." });
    }

    const validation = validateMessagePayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const { text, attachments } = validation.value;

    await pool.query(
      `INSERT INTO chat_messages (id, chat_id, sender_company_id, text, attachments)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [`msg-${crypto.randomUUID()}`, req.params.id, req.user.companyId, text, JSON.stringify(attachments)],
    );

    await pool.query(
      `INSERT INTO chat_reads (chat_id, company_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (chat_id, company_id)
       DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
      [req.params.id, req.user.companyId],
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    serverError(res, "Не удалось отправить сообщение.", error);
  }
});
// Каталог компаний и social proof.
app.post("/api/companies/:id/reviews", authMiddleware, async (req, res) => {
  let client;

  try {
    client = await pool.connect();

    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может оставить отзыв." });
    }

    if (req.user.companyId === req.params.id) {
      return res.status(403).json({ message: "О своей компании отзыв оставить нельзя." });
    }

    const validation = validateReviewPayload(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const { text, rating: ratingValue } = validation.value;

    await client.query("BEGIN");

    const companyResult = await client.query("SELECT reviews FROM companies WHERE id = $1 FOR UPDATE", [req.params.id]);
    const company = companyResult.rows[0];
    if (!company) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Профиль компании не найден." });
    }

    const currentReviews = Array.isArray(company.reviews) ? company.reviews : [];
    const existingIndex = currentReviews.findIndex((review) => review?.authorCompanyId === req.user.companyId);
    const existingReview = existingIndex >= 0 ? currentReviews[existingIndex] : null;
    const now = new Date().toISOString();
    const nextReview = {
      id: existingReview?.id || "rev-" + crypto.randomUUID(),
      author: req.user.displayName || req.user.company || "Пользователь",
      authorCompanyId: req.user.companyId,
      authorCompanyName: req.user.company || "",
      rating: ratingValue,
      text,
      createdAt: existingReview?.createdAt || now,
      updatedAt: now,
    };

    const nextReviews = existingIndex >= 0
      ? currentReviews.map((review, index) => (index === existingIndex ? nextReview : review))
      : [nextReview, ...currentReviews];
    const ratingSource = nextReviews
      .map((review) => Number(review?.rating))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
    const nextRating = ratingSource.length
      ? Number((ratingSource.reduce((sum, value) => sum + value, 0) / ratingSource.length).toFixed(1))
      : 0;

    await client.query(
      "UPDATE companies SET reviews = $2::jsonb, rating = $3 WHERE id = $1",
      [req.params.id, JSON.stringify(nextReviews), nextRating],
    );

    await client.query("COMMIT");
    res.status(existingReview ? 200 : 201).json({ ok: true, review: nextReview, rating: nextRating, updated: Boolean(existingReview) });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
    }
    serverError(res, "Не удалось сохранить отзыв.", error);
  } finally {
    client?.release();
  }
});
app.get("/api/companies", optionalAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id,
              c.name,
              c.city,
              c.phone,
              c.industry,
              c.avatar_url AS "avatarUrl",
              c.avatar_position_x AS "avatarPositionX",
              c.avatar_position_y AS "avatarPositionY",
              c.avatar_scale AS "avatarScale",
              COALESCE(
                (
                  SELECT ROUND(AVG((review->>'rating')::numeric), 1)
                  FROM jsonb_array_elements(COALESCE(c.reviews, '[]'::jsonb)) review
                  WHERE jsonb_typeof(review) = 'object' AND review ? 'rating'
                ),
                c.rating
              ) AS rating,
              c.description,
              c.about,
              c.specializations,
              c.reviews,
              c.inn,
              c.verification_status AS "verificationStatus",
              c.verification_reviewed_at AS "verificationReviewedAt",
              to_char(c.created_at, 'DD.MM.YYYY') AS "createdAt",
              CASE WHEN $1 THEN cu.display_name ELSE NULL END AS "contactName",
              CASE WHEN $1 THEN cu.email ELSE NULL END AS "contactEmail"
       FROM companies c
       LEFT JOIN LATERAL (
         SELECT u.display_name, u.email
         FROM users u
         WHERE u.company_id = c.id AND u.role = 'company'
         ORDER BY u.id ASC
         LIMIT 1
       ) cu ON TRUE
       ORDER BY c.id ASC`,
      [Boolean(req.user)],
    );
    res.json(result.rows.map((row) => ({
      ...row,
      specializations: Array.isArray(row.specializations) ? row.specializations : [],
      reviews: Array.isArray(row.reviews) ? row.reviews : [],
    })));
  } catch (error) {
    serverError(res, "Не удалось получить список компаний.", error);
  }
});
app.get("/api/suppliers", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id,
              c.id AS "companyId",
              c.name,
              c.city,
              c.industry,
              COALESCE(
                (
                  SELECT ROUND(AVG((review->>'rating')::numeric), 1)
                  FROM jsonb_array_elements(COALESCE(c.reviews, '[]'::jsonb)) review
                  WHERE jsonb_typeof(review) = 'object' AND review ? 'rating'
                ),
                c.rating
              ) AS rating,
              c.description AS summary,
              c.about AS description,
              c.specializations AS skills,
              c.avatar_url AS "avatarUrl",
              c.avatar_position_x AS "avatarPositionX",
              c.avatar_position_y AS "avatarPositionY",
              c.avatar_scale AS "avatarScale",
              c.inn,
              c.verification_status AS "verificationStatus",
              c.verification_reviewed_at AS "verificationReviewedAt",
              to_char(c.created_at, 'DD.MM.YYYY HH24:MI') AS "createdAt"
       FROM companies c
       ORDER BY c.created_at DESC, c.id ASC`,
    );
    res.json(result.rows.map((row) => ({
      ...row,
      skills: Array.isArray(row.skills) ? row.skills : [],
    })));
  } catch (error) {
    serverError(res, "Не удалось получить список поставщиков.", error);
  }
});

// Верификация компаний и проверка реквизитов через DaData.
const COMPANY_VERIFICATION_SELECT = `
  SELECT c.id AS "companyId",
         c.name AS "companyName",
         c.verification_status AS status,
         c.verification_reason AS reason,
         c.verification_requested_at AS "requestedAt",
         c.verification_reviewed_at AS "reviewedAt",
         c.verification_reviewed_by AS "reviewedBy",
         c.inn,
         c.legal_name AS "legalName",
         c.ogrn,
         c.legal_address AS "legalAddress"
  FROM companies c
  WHERE c.id = $1
`;

app.get("/api/companies/:id/verification", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(COMPANY_VERIFICATION_SELECT, [req.params.id]);
    const company = result.rows[0];
    if (!company) return res.status(404).json({ message: "Компания не найдена." });
    if (!(req.user.role === "admin" || req.user.companyId === company.companyId)) {
      return res.status(403).json({ message: "Недостаточно прав." });
    }

    res.json({ verification: company });
  } catch (error) {
    serverError(res, "Не удалось получить данные проверки.", error);
  }
});

app.post("/api/companies/:id/verification/request", authMiddleware, verificationRequestRateLimiter, async (req, res) => {
  let client;
  let inTransaction = false;

  try {
    if (!req.user.companyId || req.user.companyId !== req.params.id) {
      return res.status(403).json({ message: "Заявку может отправить только владелец компании." });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '3000ms'");

    const existing = await client.query(
      `SELECT verification_status AS status, inn, legal_name AS "legalName", ogrn, legal_address AS "legalAddress"
       FROM companies
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id],
    );
    const company = existing.rows[0];

    if (!company) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(404).json({ message: "Компания не найдена." });
    }

    if (company.status === "pending") {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(409).json({ message: "Заявка уже на проверке." });
    }

    const body = req.body || {};
    const readField = (key) => (Object.prototype.hasOwnProperty.call(body, key) ? body[key] : company[key]);
    const validation = validateVerificationPayload({
      inn: readField("inn"),
      legalName: readField("legalName"),
      ogrn: readField("ogrn"),
      legalAddress: readField("legalAddress"),
    });

    if (!validation.ok) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return sendValidationError(res, validation);
    }

    const value = validation.value;
    const duplicateInn = await client.query("SELECT id FROM companies WHERE inn = $1 AND id <> $2", [value.inn, req.params.id]);
    if (duplicateInn.rows[0]) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.status(409).json({ message: "Этот ИНН уже привязан к другой компании.", fields: { inn: "Этот ИНН уже привязан к другой компании." } });
    }

    await client.query(
      `UPDATE companies
       SET inn = $2,
           legal_name = $3,
           ogrn = $4,
           legal_address = $5,
           verification_status = 'pending',
           verification_reason = '',
           verification_requested_at = NOW(),
           verification_reviewed_at = NULL,
           verification_reviewed_by = NULL
       WHERE id = $1`,
      [req.params.id, value.inn, value.legalName, value.ogrn, value.legalAddress],
    );

    await client.query("COMMIT");
    inTransaction = false;
    await writeAuditLog(req, "company.verification_requested", {
      userId: req.user.id,
      companyId: req.params.id,
      details: { previousStatus: company.status },
    });

    const refreshed = await pool.query(COMPANY_VERIFICATION_SELECT, [req.params.id]);
    res.json({ ok: true, verification: refreshed.rows[0] });
  } catch (error) {
    if (inTransaction && client) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
    }
    if (isUniqueViolation(error)) {
      return res.status(409).json({ message: "Этот ИНН уже привязан к другой компании.", fields: { inn: "Этот ИНН уже привязан к другой компании." } });
    }
    serverError(res, "Не удалось отправить заявку на проверку.", error);
  } finally {
    client?.release();
  }
});

app.get("/api/admin/verifications", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const status = req.query.status === "all" ? "all" : "pending";
    const result = await pool.query(
      `SELECT c.id AS "companyId",
              c.name AS "companyName",
              c.inn,
              c.legal_name AS "legalName",
              c.ogrn,
              c.legal_address AS "legalAddress",
              c.verification_status AS status,
              c.verification_reason AS reason,
              c.verification_requested_at AS "requestedAt",
              c.verification_reviewed_at AS "reviewedAt",
              c.verification_reviewed_by AS "reviewedBy",
              COALESCE(cu.display_name, '') AS "contactName",
              COALESCE(cu.email, '') AS "contactEmail"
       FROM companies c
       LEFT JOIN LATERAL (
         SELECT u.display_name, u.email
         FROM users u
         WHERE u.company_id = c.id AND u.role = 'company'
         ORDER BY u.id ASC
         LIMIT 1
       ) cu ON TRUE
       WHERE ($1 = 'all' OR c.verification_status = 'pending')
       ORDER BY c.verification_requested_at DESC NULLS LAST, c.id ASC`,
      [status],
    );

    res.json({ items: result.rows });
  } catch (error) {
    serverError(res, "Не удалось получить заявки на проверку.", error);
  }
});

app.post("/api/admin/companies/:id/verification", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const validation = validateVerificationDecision(req.body || {});
    if (!validation.ok) return sendValidationError(res, validation);

    const { decision, reason } = validation.value;
    const existing = await pool.query(
      `SELECT verification_status AS status, inn FROM companies WHERE id = $1`,
      [req.params.id],
    );
    const company = existing.rows[0];

    if (!company) return res.status(404).json({ message: "Компания не найдена." });

    if (decision === "approved" && !isValidInn(company.inn)) {
      return res.status(400).json({
        message: "Нельзя подтвердить компанию без корректного ИНН.",
        fields: { inn: "У компании нет корректного ИНН." },
      });
    }

    await pool.query(
      `UPDATE companies
       SET verification_status = $2,
           verification_reason = $3,
           verification_reviewed_at = NOW(),
           verification_reviewed_by = $4
       WHERE id = $1`,
      [req.params.id, decision, decision === "rejected" ? reason : "", req.user.id],
    );

    await writeAuditLog(
      req,
      decision === "approved" ? "admin.verification_approved" : "admin.verification_rejected",
      { userId: req.user.id, companyId: req.params.id },
    );

    res.json({ ok: true, status: decision });
  } catch (error) {
    serverError(res, "Не удалось сохранить решение по проверке.", error);
  }
});

app.post("/api/dadata/party", authMiddleware, dadataRateLimiter, async (req, res) => {
  try {
    const inn = normalizeInn(req.body?.inn);

    if (!/^(?:\d{10}|\d{12})$/.test(inn) || !isValidInn(inn)) {
      return res.status(400).json({
        message: "Укажите корректный ИНН: 10 цифр для юрлица или 12 для ИП.",
        fields: { inn: "Укажите корректный ИНН." },
      });
    }

    if (isIndividualInn(inn)) {
      return res.json({ available: false, reason: "individual" });
    }

    const result = await lookupPartyByInn(inn);
    res.json(result);
  } catch (error) {
    serverError(res, "Не удалось проверить ИНН.", error);
  }
});

async function ensureSecuritySchema() {
  await pool.query("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ");
  await pool.query(
    `UPDATE sessions
     SET expires_at = created_at + ($1::int * INTERVAL '1 day')
     WHERE expires_at IS NULL`,
    [SESSION_TTL_DAYS],
  );
  await pool.query("CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS audit_log (
       id BIGSERIAL PRIMARY KEY,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       user_id TEXT,
       company_id TEXT,
       action TEXT NOT NULL,
       ip TEXT,
       details JSONB NOT NULL DEFAULT '{}'::jsonb
     )`,
  );
  await pool.query("CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC)");

  await pool.query("CREATE INDEX IF NOT EXISTS orders_company_id_idx ON orders (company_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS orders_sort_order_idx ON orders (sort_order, id)");
  await pool.query("CREATE INDEX IF NOT EXISTS chats_company_a_id_idx ON chats (company_a_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS chats_company_b_id_idx ON chats (company_b_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS chats_order_id_idx ON chats (order_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS chat_messages_chat_created_idx ON chat_messages (chat_id, created_at, id)");
  await pool.query("CREATE INDEX IF NOT EXISTS users_company_id_idx ON users (company_id)");

  const duplicateChats = await pool.query(
    `SELECT 1
     FROM chats
     GROUP BY LEAST(company_a_id, company_b_id), GREATEST(company_a_id, company_b_id), COALESCE(order_id, '')
     HAVING COUNT(*) > 1
     LIMIT 1`,
  );

  if (duplicateChats.rows[0]) {
    console.warn("Найдены дубли чатов: уникальный индекс не создан. Новые дубли блокируются транзакцией /chats/open.");
  } else {
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS chats_unique_pair_order_idx
       ON chats (LEAST(company_a_id, company_b_id), GREATEST(company_a_id, company_b_id), COALESCE(order_id, ''))`,
    );
  }
}

async function ensureVerificationSchema() {
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS inn TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_name TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS ogrn TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_address TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'none'");
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_reason TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE companies ADD COLUMN IF NOT EXISTS verification_reviewed_by TEXT");

  await pool.query(
    `DO $$
     BEGIN
       ALTER TABLE companies
         ADD CONSTRAINT companies_verification_status_check
         CHECK (verification_status IN ('none', 'pending', 'approved', 'rejected'));
     EXCEPTION
       WHEN duplicate_object THEN NULL;
     END $$`,
  );

  const duplicateInn = await pool.query(
    `SELECT 1 FROM companies WHERE inn <> '' GROUP BY inn HAVING COUNT(*) > 1 LIMIT 1`,
  );

  if (duplicateInn.rows[0]) {
    console.warn("Найдены дубли ИНН: уникальный индекс не создан. Заявки и профиль всё равно проверяют уникальность ИНН.");
  } else {
    try {
      await pool.query(
        "CREATE UNIQUE INDEX IF NOT EXISTS companies_inn_unique_idx ON companies (inn) WHERE inn <> ''",
      );
    } catch (error) {
      console.warn("Не удалось создать уникальный индекс ИНН.", error?.message || error);
    }
  }

  await pool.query(
    "CREATE INDEX IF NOT EXISTS companies_verification_status_idx ON companies (verification_status, verification_requested_at DESC)",
  );
}

async function cleanupExpiredSessions() {
  const result = await pool.query("DELETE FROM sessions WHERE expires_at IS NULL OR expires_at <= NOW()");
  return result.rowCount;
}

const DB_INIT_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];
let databaseInitPromise = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initializeDatabase() {
  if (databaseInitPromise) return databaseInitPromise;

  databaseInitPromise = (async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        markWaking();
        await testConnection();
        await ensureSecuritySchema();
        await ensureVerificationSchema();
        markSchemaReady(true);
        const removedSessions = await cleanupExpiredSessions();
        if (removedSessions) console.log(`Удалено просроченных сессий: ${removedSessions}`);
        markReady();
        console.log("База данных готова к работе.");
        return true;
      } catch (error) {
        console.error("База данных недоступна, повторная попытка.", error?.message || error);
        markDegraded();
        const delay = DB_INIT_BACKOFF_MS[Math.min(attempt, DB_INIT_BACKOFF_MS.length - 1)];
        await sleep(delay);
      }
    }
  })().finally(() => {
    databaseInitPromise = null;
  });

  return databaseInitPromise;
}

function ensureDatabaseReady() {
  return initializeDatabase();
}

// Слушаем порт до готовности БД: health-проверка Render не должна перезапускать сервис во время cold start.
app.listen(port, () => console.log(`API server started on http://localhost:${port}`));
void ensureDatabaseReady();

setInterval(() => {
  if (!isReady()) return;
  cleanupExpiredSessions().catch((error) => console.error("Не удалось очистить просроченные сессии.", error));
}, 6 * 60 * 60 * 1000).unref();
