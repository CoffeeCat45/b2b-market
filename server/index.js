import crypto from "crypto";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { pool, testConnection } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const parsedPasswordSaltRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);
const PASSWORD_SALT_ROUNDS =
  Number.isFinite(parsedPasswordSaltRounds) && parsedPasswordSaltRounds >= 8 && parsedPasswordSaltRounds <= 15
    ? parsedPasswordSaltRounds
    : 10;

app.use(cors());
app.use(express.json({ limit: "15mb" }));

const CITY_OPTIONS = ["Екатеринбург", "Москва", "Казань", "Челябинск", "Тюмень", "Самара", "Санкт-Петербург", "Новосибирск", "Пермь", "Уфа"];
const ALLOWED_ATTACHMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

async function getUserByToken(token) {
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id, u.company_id AS "companyId", u.email, u.role, u.display_name AS "displayName", c.name AS company, c.city AS "companyCity", c.phone AS "companyPhone", c.industry, c.description, c.about, c.specializations
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN companies c ON c.id = u.company_id
     WHERE s.token = $1`,
    [token],
  );
  return result.rows[0] ?? null;
}

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const user = await getUserByToken(token);
    if (!user) return res.status(401).json({ message: "Требуется авторизация." });
    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "Ошибка авторизации.", error: error.message });
  }
}

function optionalAuthMiddleware(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

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

function composeLocation(cityMajor, locationDetail) {
  return locationDetail ? `${cityMajor}, ${locationDetail}` : cityMajor;
}

function mapOrderPayload(body) {
  const budgetFrom = Number(body.budgetFrom);
  const budgetTo = Number(body.budgetTo);
  const cityMajor = String(body.cityMajor || body.city || "").trim();
  const locationDetail = String(body.locationDetail || "").trim();

  if (!body.title || !body.category || !cityMajor || !body.summary || !body.description || !body.terms) {
    return { error: "Заполните все обязательные поля." };
  }

  if (Number.isNaN(budgetFrom) || Number.isNaN(budgetTo)) {
    return { error: "Бюджет должен быть числом." };
  }

  return {
    title: body.title.trim(),
    category: body.category.trim(),
    cityMajor,
    locationDetail,
    city: composeLocation(cityMajor, locationDetail),
    budgetFrom,
    budgetTo,
    budgetLabel: `от ${budgetFrom.toLocaleString("ru-RU")} ₽ до ${budgetTo.toLocaleString("ru-RU")} ₽`,
    summary: body.summary.trim(),
    description: body.description.trim(),
    terms: body.terms.trim(),
    tags: Array.isArray(body.tags) ? body.tags.filter(Boolean) : String(body.tags || "").split(",").map((item) => item.trim()).filter(Boolean),
    publishedAt: body.date?.trim() || new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }),
  };
}

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

function mapAttachments(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => ({
      name: String(item?.name || "").trim(),
      type: String(item?.type || "").trim().toLowerCase(),
      size: Number(item?.size || 0),
      dataUrl: String(item?.dataUrl || ""),
    }))
    .filter((item) => item.name && item.dataUrl && ALLOWED_ATTACHMENT_TYPES.has(item.type) && Number.isFinite(item.size) && item.size > 0 && item.size <= 5 * 1024 * 1024)
    .slice(0, 5);
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

async function getChatForUser(chatId, user) {
  const result = await pool.query(
    `SELECT id, company_a_id AS "companyAId", company_b_id AS "companyBId", CASE WHEN $3 = '' THEN FALSE ELSE EXISTS (SELECT 1 FROM chat_archives archive_state WHERE archive_state.chat_id = chats.id AND archive_state.company_id = $3) END AS "isArchived", lifecycle_status AS "lifecycleStatus", pending_status AS "pendingStatus", pending_status_requested_by_company_id AS "pendingStatusRequestedByCompanyId"
       FROM chats
       WHERE id = $1 AND ($2 = 'admin' OR company_a_id = $3 OR company_b_id = $3)`,
    [chatId, user.role, user.companyId || ""],
  );
  return result.rows[0] ?? null;
}

app.get("/api/health", async (_req, res) => {
  try {
    const dbOk = await testConnection();
    res.json({ ok: true, database: dbOk ? "connected" : "unavailable" });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/locations", (_req, res) => {
  res.json({ cities: CITY_OPTIONS });
});

app.post("/api/auth/register", async (req, res) => {
  const client = await pool.connect();

  try {
    const companyName = String(req.body.companyName || "").trim();
    const displayName = String(req.body.displayName || "").trim();
    const city = String(req.body.city || "").trim();
    const industry = String(req.body.industry || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!companyName || !displayName || !city || !industry || !email || !password) {
      return res.status(403).json({ message: "Только авторизованная компания или администратор может удалить чат." });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(403).json({ message: "Только авторизованная компания или администратор может удалить чат." });
    }

    if (password.length < 6) {
      return res.status(403).json({ message: "Только авторизованная компания или администратор может удалить чат." });
    }

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
        `${companyName} зарегистрирована на платформе B2B Connect.`,
        `${companyName} работает в категории "${industry}" и может публиковать объявления, искать поставщиков и вести переговоры в чатах.`,
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
    await client.query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, userId]);

    await client.query("COMMIT");

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
        description: `${companyName} зарегистрирована на платформе B2B Connect.`,
        about: `${companyName} работает в категории "${industry}" и может публиковать объявления, искать поставщиков и вести переговоры в чатах.`,
        specializations: [industry],
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Не удалось зарегистрировать аккаунт.", error: error.message });
  } finally {
    client.release();
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      `SELECT u.id, u.company_id AS "companyId", u.email, u.password, u.role, u.display_name AS "displayName", c.name AS company, c.city AS "companyCity"
       FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.email = $1`,
      [String(email || "").trim().toLowerCase()],
    );
    const user = result.rows[0];
    const normalizedPassword = String(password || "");
    const passwordOk = user ? await verifyPassword(user.password, normalizedPassword) : false;
    if (!user || !passwordOk) return res.status(401).json({ message: "Неверный email или пароль." });

    if (!isBcryptHash(user.password)) {
      const nextHash = await hashPassword(normalizedPassword);
      await pool.query("UPDATE users SET password = $2 WHERE id = $1", [user.id, nextHash]);
      user.password = nextHash;
    }

    const token = crypto.randomUUID();
    await pool.query("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, user.id]);
    delete user.password;
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ message: "Не удалось выполнить вход.", error: error.message });
  }
});

app.post("/api/auth/verify-password", authMiddleware, async (req, res) => {
  try {
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
    const storedPassword = result.rows[0]?.password || "";
    const ok = await verifyPassword(storedPassword, password);

    if (!ok) return res.status(401).json({ message: "Неверный пароль." });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Не удалось подтвердить пароль.", error: error.message });
  }
});

app.put("/api/auth/profile", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const currentPassword = String(req.body.currentPassword || "");
    const displayName = String(req.body.displayName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const companyName = String(req.body.companyName || "").trim();
    const city = String(req.body.city || "").trim();
    const phone = String(req.body.phone || "").trim();
    const industry = String(req.body.industry || "").trim();
    const description = String(req.body.description || "").trim();
    const about = String(req.body.about || "").trim();
    const specializations = Array.isArray(req.body.specializations)
      ? req.body.specializations.map((item) => String(item || "").trim()).filter(Boolean)
      : String(req.body.specializations || "").split(",").map((item) => item.trim()).filter(Boolean);

    if (!displayName) {
      return res.status(403).json({ message: "Только авторизованная компания или администратор может удалить чат." });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(403).json({ message: "Только авторизованная компания или администратор может удалить чат." });
    }

    const userResult = await client.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
    const storedPassword = userResult.rows[0]?.password || "";
    const passwordOk = await verifyPassword(storedPassword, currentPassword);

    if (!passwordOk) {
      return res.status(401).json({ message: "Неверный пароль." });
    }

    await client.query("BEGIN");

    const existingUser = await client.query("SELECT id FROM users WHERE email = $1 AND id <> $2", [email, req.user.id]);
    if (existingUser.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Пользователь с таким email уже существует." });
    }

    await client.query("UPDATE users SET display_name = $2, email = $3 WHERE id = $1", [req.user.id, displayName, email]);

    if (req.user.companyId) {
      if (!companyName || !city || !industry || !description || !about) {
        await client.query("ROLLBACK");
      return res.status(403).json({ message: "Только авторизованная компания или администратор может удалить чат." });
      }

      await client.query(
        "UPDATE companies SET name = $2, city = $3, phone = $4, industry = $5, description = $6, about = $7, specializations = $8::jsonb WHERE id = $1",
        [req.user.companyId, companyName, city, phone, industry, description, about, JSON.stringify(specializations)],
      );
    }

    await client.query("COMMIT");

    const refreshed = await getUserByToken((req.headers.authorization || "").startsWith("Bearer ") ? (req.headers.authorization || "").slice(7) : null);
    res.json({ ok: true, user: refreshed });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Не удалось обновить данные профиля.", error: error.message });
  } finally {
    client.release();
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => res.json({ user: req.user }));
app.post("/api/auth/logout", authMiddleware, async (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  await pool.query("DELETE FROM sessions WHERE token = $1", [token]);
  res.json({ ok: true });
});

app.get("/api/orders", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.id, o.title, o.category, o.city_major AS "cityMajor", o.location_detail AS "locationDetail", o.city,
              o.budget_from AS "budgetFrom", o.budget_to AS "budgetTo", o.budget_label AS budget,
              o.summary, o.description, o.terms, o.tags, o.published_at AS date,
              c.id AS "companyId", c.name AS company,
              COUNT(DISTINCT ov.user_id)::integer AS "viewsCount"
       FROM orders o
       JOIN companies c ON c.id = o.company_id
       LEFT JOIN order_views ov ON ov.order_id = o.id
       GROUP BY o.id, c.id, c.name
       ORDER BY o.sort_order ASC, o.id ASC`,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Не удалось получить список заказов.", error: error.message });
  }
});

app.post("/api/orders", authMiddleware, async (req, res) => {
  try {
    const payload = mapOrderPayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });
    const id = `ord-${Date.now()}`;
    const companyId = req.user.role === "admin" ? req.body.companyId : req.user.companyId;
    await pool.query(
      `INSERT INTO orders (id, company_id, title, category, city_major, location_detail, city, budget_from, budget_to, budget_label, summary, description, terms, tags, published_at, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,COALESCE((SELECT MAX(sort_order)+1 FROM orders),1))`,
      [id, companyId, payload.title, payload.category, payload.cityMajor, payload.locationDetail, payload.city, payload.budgetFrom, payload.budgetTo, payload.budgetLabel, payload.summary, payload.description, payload.terms, JSON.stringify(payload.tags), payload.publishedAt],
    );
    res.status(201).json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ message: "Не удалось создать объявление.", error: error.message });
  }
});

app.put("/api/orders/:id", authMiddleware, async (req, res) => {
  try {
    const existing = await pool.query("SELECT company_id AS \"companyId\" FROM orders WHERE id = $1", [req.params.id]);
    const order = existing.rows[0];
    if (!order) return res.status(404).json({ message: "Объявление не найдено." });
    if (!(req.user.role === "admin" || req.user.companyId === order.companyId)) return res.status(403).json({ message: "Недостаточно прав." });
    const payload = mapOrderPayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });
    await pool.query(
      `UPDATE orders SET title=$2, category=$3, city_major=$4, location_detail=$5, city=$6, budget_from=$7, budget_to=$8, budget_label=$9, summary=$10, description=$11, terms=$12, tags=$13::jsonb, published_at=$14 WHERE id=$1`,
      [req.params.id, payload.title, payload.category, payload.cityMajor, payload.locationDetail, payload.city, payload.budgetFrom, payload.budgetTo, payload.budgetLabel, payload.summary, payload.description, payload.terms, JSON.stringify(payload.tags), payload.publishedAt],
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Не удалось обновить объявление.", error: error.message });
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
    res.status(500).json({ message: "Не удалось удалить объявление.", error: error.message });
  }
});

app.post("/api/orders/:id/view", optionalAuthMiddleware, async (req, res) => {
  try {
    const orderId = req.params.id;
    const existingOrder = await pool.query("SELECT id FROM orders WHERE id = $1", [orderId]);
    if (!existingOrder.rows[0]) return res.status(404).json({ message: "Объявление не найдено." });

    if (req.user?.id) {
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
    res.status(500).json({ message: "Не удалось сохранить просмотр.", error: error.message });
  }
});

app.post("/api/chats/open", authMiddleware, async (req, res) => {
  try {
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может открывать чаты." });
    }

    const otherCompanyId = String(req.body.companyId || "").trim();
    const orderId = String(req.body.orderId || "").trim() || null;

    if (!otherCompanyId) {
      return res.status(400).json({ message: "Не указана компания для чата." });
    }

    if (otherCompanyId === req.user.companyId) {
      return res.status(400).json({ message: "Нельзя открыть чат со своей компанией." });
    }

    let subject = String(req.body.subject || "").trim();
    let orderDetails = null;

    if (orderId) {
      const orderResult = await pool.query(
        `SELECT id, title, budget_label AS budget, summary, terms
         FROM orders
         WHERE id = $1`,
        [orderId],
      );
      orderDetails = orderResult.rows[0] ?? null;
      if (!orderDetails) return res.status(404).json({ message: "Объявление не найдено." });
      if (!subject) subject = `Отклик по объявлению: ${orderDetails.title}`;
    }

    if (!subject) {
      subject = "Обсуждение сотрудничества";
    }

    const existing = orderId
      ? await pool.query(
          `SELECT id
           FROM chats
           WHERE ((company_a_id = $1 AND company_b_id = $2) OR (company_a_id = $2 AND company_b_id = $1))
             AND order_id = $3
           LIMIT 1`,
          [req.user.companyId, otherCompanyId, orderId],
        )
      : await pool.query(
          `SELECT id
           FROM chats
           WHERE ((company_a_id = $1 AND company_b_id = $2) OR (company_a_id = $2 AND company_b_id = $1))
             AND order_id IS NULL
           LIMIT 1`,
          [req.user.companyId, otherCompanyId],
        );

    const chatId = existing.rows[0]?.id || `chat-${Date.now()}`;

    if (!existing.rows[0]) {
      await pool.query(
        `INSERT INTO chats (id, company_a_id, company_b_id, order_id, subject)
         VALUES ($1, $2, $3, $4, $5)`,
        [chatId, req.user.companyId, otherCompanyId, orderId, subject],
      );
    }

    await pool.query(
      `INSERT INTO chat_reads (chat_id, company_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (chat_id, company_id)
       DO UPDATE SET last_read_at = EXCLUDED.last_read_at`,
      [chatId, req.user.companyId],
    );

    res.json({ ok: true, chatId });
  } catch (error) {
    res.status(500).json({ message: "Не удалось открыть чат.", error: error.message });
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
              to_char(cr.last_read_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastReadAtIso",
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
              COALESCE(o.title, ch.subject) AS "contractTitle",
              o.title AS "orderTitle",
              o.budget_label AS "orderBudget",
              o.summary AS "orderSummary",
              o.terms AS "orderTerms",
              o.company_id AS "orderCompanyId",
              (SELECT m.sender_company_id FROM chat_messages m WHERE m.chat_id = ch.id ORDER BY m.created_at DESC LIMIT 1) AS "lastSenderCompanyId",
              COALESCE((SELECT to_char(m.created_at, 'DD.MM.YYYY HH24:MI') FROM chat_messages m WHERE m.chat_id = ch.id ORDER BY m.created_at DESC LIMIT 1), to_char(ch.created_at, 'DD.MM.YYYY HH24:MI')) AS "lastActivityAt",
              COALESCE((SELECT json_agg(json_build_object('id', m.id, 'text', m.text, 'createdAt', to_char(m.created_at, 'DD.MM.YYYY HH24:MI'), 'senderCompanyId', m.sender_company_id, 'attachments', m.attachments, 'createdAtIso', to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY m.created_at) FROM chat_messages m WHERE m.chat_id = ch.id), '[]'::json) AS messages
       FROM chats ch
       JOIN companies ca ON ca.id = ch.company_a_id
       JOIN companies cb ON cb.id = ch.company_b_id
       LEFT JOIN orders o ON o.id = ch.order_id
       LEFT JOIN chat_reads cr ON cr.chat_id = ch.id AND cr.company_id = NULLIF($2, '')
       WHERE $1 = 'admin' OR ch.company_a_id = $2 OR ch.company_b_id = $2
       ORDER BY CASE WHEN $2 = '' THEN FALSE ELSE EXISTS (SELECT 1 FROM chat_archives archive_state WHERE archive_state.chat_id = ch.id AND archive_state.company_id = $2) END ASC,
                COALESCE((SELECT MAX(m.created_at) FROM chat_messages m WHERE m.chat_id = ch.id), ch.created_at) DESC,
                ch.created_at DESC`,
      [req.user.role, req.user.companyId || ""],
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Не удалось получить чаты.", error: error.message });
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
    res.status(500).json({ message: "Не удалось отметить чат как прочитанный.", error: error.message });
  }
});

app.delete("/api/chats/:id", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!(req.user.role === "admin" || req.user.companyId)) {
      return res.status(403).json({ message: "Только авторизованная компания или администратор может удалить чат." });
    }

    await pool.query("DELETE FROM chats WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Не удалось удалить чат.", error: error.message });
  }
});

app.put("/api/chats/:id/details", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });

    const offeredDetails = String(req.body.offeredDetails || "").trim();
    const agreementDetails = String(req.body.agreementDetails || "").trim();

    await pool.query(
      `UPDATE chats
       SET offered_details = $2,
           agreement_details = $3
       WHERE id = $1`,
      [req.params.id, offeredDetails, agreementDetails],
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Не удалось обновить данные чата.", error: error.message });
  }
});

app.put("/api/chats/:id/archive", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может архивировать чат." });
    }

    const isArchived = Boolean(req.body.isArchived);

    if (isArchived) {
      if (normalizeLifecycleStatus(chat.lifecycleStatus) !== "closed") {
        return res.status(400).json({ message: "Перенести чат в архив можно только после статуса Закрыто." });
      }

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
    res.status(500).json({ message: "Не удалось обновить архив чата.", error: error.message });
  }
});

app.put("/api/chats/:id/status-request", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может менять статус переговоров." });
    }

    const nextStatus = String(req.body.status || "").trim();
    const allowedStatuses = ["negotiation", "closed"];
    if (!allowedStatuses.includes(nextStatus)) {
      return res.status(400).json({ message: "Некорректный статус переговоров." });
    }

    const currentStatus = normalizeLifecycleStatus(chat.lifecycleStatus);
    if (nextStatus === currentStatus && !chat.pendingStatus) {
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
    res.status(500).json({ message: "Не удалось отправить запрос на смену статуса.", error: error.message });
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

    const accepted = Boolean(req.body.accepted);

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
    res.status(500).json({ message: "Не удалось обработать запрос на смену статуса.", error: error.message });
  }
});

app.post("/api/chats/:id/messages", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может отправлять сообщения." });
    }

    const text = String(req.body.text || "").trim();
    const attachments = mapAttachments(req.body.attachments);

    if (!text && attachments.length === 0) {
      return res.status(400).json({ message: "Добавьте текст сообщения или вложение." });
    }

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
    res.status(500).json({ message: "Не удалось отправить сообщение.", error: error.message });
  }
});
app.post("/api/companies/:id/reviews", authMiddleware, async (req, res) => {
  try {
    if (!req.user.companyId) {
      return res.status(403).json({ message: "Только компания может оставить отзыв." });
    }

    if (req.user.companyId === req.params.id) {
      return res.status(403).json({ message: "О своей компании отзыв оставить нельзя." });
    }

    const textValue = String(req.body.text || "").trim();
    const ratingValue = Number(req.body.rating);

    if (!textValue) {
      return res.status(400).json({ message: "Введите текст отзыва." });
    }

    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ message: "Выберите оценку от 1 до 5." });
    }

    const companyResult = await pool.query("SELECT reviews FROM companies WHERE id = $1", [req.params.id]);
    const company = companyResult.rows[0];
    if (!company) {
      return res.status(404).json({ message: "Профиль компании не найден." });
    }

    const nextReview = {
      id: "rev-" + crypto.randomUUID(),
      author: req.user.displayName || req.user.company || "Пользователь",
      authorCompanyId: req.user.companyId,
      authorCompanyName: req.user.company || "",
      rating: ratingValue,
      text: textValue,
      createdAt: new Date().toISOString(),
    };

    const currentReviews = Array.isArray(company.reviews) ? company.reviews : [];
    const nextReviews = [nextReview, ...currentReviews];
    const ratingSource = nextReviews
      .map((review) => Number(review?.rating))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
    const nextRating = ratingSource.length
      ? Number((ratingSource.reduce((sum, value) => sum + value, 0) / ratingSource.length).toFixed(1))
      : 0;

    await pool.query(
      "UPDATE companies SET reviews = $2::jsonb, rating = $3 WHERE id = $1",
      [req.params.id, JSON.stringify(nextReviews), nextRating],
    );

    res.status(201).json({ ok: true, review: nextReview, rating: nextRating });
  } catch (error) {
    res.status(500).json({ message: "Не удалось сохранить отзыв.", error: error.message });
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
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Не удалось получить список компаний.", error: error.message });
  }
});
app.get("/api/suppliers", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, company_id AS "companyId", name, city, industry, rating, summary, description, skills,
              to_char(created_at, 'DD.MM.YYYY HH24:MI') AS "createdAt"
       FROM suppliers
       ORDER BY created_at DESC, id ASC`,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Не удалось получить список поставщиков.", error: error.message });
  }
});

app.listen(port, () => console.log(`API server started on http://localhost:${port}`));









