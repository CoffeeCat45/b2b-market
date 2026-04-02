import crypto from "crypto";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { pool, testConnection } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "15mb" }));

const CITY_OPTIONS = ["Екатеринбург", "Москва", "Казань", "Челябинск", "Тюмень", "Самара", "Санкт-Петербург", "Новосибирск", "Пермь", "Уфа"];
const ALLOWED_ATTACHMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

async function getUserByToken(token) {
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id, u.company_id AS "companyId", u.email, u.role, u.display_name AS "displayName", c.name AS company
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

async function getChatForUser(chatId, user) {
  const result = await pool.query(
    `SELECT id, company_a_id AS "companyAId", company_b_id AS "companyBId"
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

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query(
      `SELECT u.id, u.company_id AS "companyId", u.email, u.password, u.role, u.display_name AS "displayName", c.name AS company
       FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.email = $1`,
      [String(email || "").trim().toLowerCase()],
    );
    const user = result.rows[0];
    const normalizedPassword = String(password || "");
    const passwordOk = user ? await verifyPassword(user.password, normalizedPassword) : false;
    if (!user || !passwordOk) return res.status(401).json({ message: "Неверный email или пароль." });

    if (!isBcryptHash(user.password)) {
      const nextHash = await bcrypt.hash(normalizedPassword, 10);
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
    if (!req.user.companyId) return res.status(400).json({ message: "Только компания может писать сообщения." });
    const otherCompanyId = String(req.body.companyId || "").trim();
    const orderId = String(req.body.orderId || "").trim() || null;

    if (!otherCompanyId) return res.status(400).json({ message: "Не выбрана компания для диалога." });
    if (otherCompanyId === req.user.companyId) return res.status(400).json({ message: "Нельзя открыть чат с собственной компанией." });

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

    if (req.body.message) {
      await pool.query(
        `INSERT INTO chat_messages (id, chat_id, sender_company_id, text, attachments)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [`msg-${crypto.randomUUID()}`, chatId, req.user.companyId, String(req.body.message), JSON.stringify([])],
      );
    }

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
              ch.is_archived AS "isArchived",
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
              (SELECT m.sender_company_id FROM chat_messages m WHERE m.chat_id = ch.id ORDER BY m.created_at DESC LIMIT 1) AS "lastSenderCompanyId",
              COALESCE((SELECT to_char(m.created_at, 'DD.MM.YYYY HH24:MI') FROM chat_messages m WHERE m.chat_id = ch.id ORDER BY m.created_at DESC LIMIT 1), to_char(ch.created_at, 'DD.MM.YYYY HH24:MI')) AS "lastActivityAt",
              COALESCE((SELECT json_agg(json_build_object('id', m.id, 'text', m.text, 'createdAt', to_char(m.created_at, 'DD.MM.YYYY HH24:MI'), 'senderCompanyId', m.sender_company_id, 'attachments', m.attachments) ORDER BY m.created_at) FROM chat_messages m WHERE m.chat_id = ch.id), '[]'::json) AS messages
       FROM chats ch
       JOIN companies ca ON ca.id = ch.company_a_id
       JOIN companies cb ON cb.id = ch.company_b_id
       LEFT JOIN orders o ON o.id = ch.order_id
       WHERE $1 = 'admin' OR ch.company_a_id = $2 OR ch.company_b_id = $2
       ORDER BY ch.is_archived ASC,
                COALESCE((SELECT MAX(m.created_at) FROM chat_messages m WHERE m.chat_id = ch.id), ch.created_at) DESC,
                ch.created_at DESC`,
      [req.user.role, req.user.companyId || ""],
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Не удалось получить чаты.", error: error.message });
  }
});

app.put("/api/chats/:id/archive", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "??? ?? ??????." });

    const isArchived = Boolean(req.body.isArchived);

    await pool.query(
      `UPDATE chats
       SET is_archived = $2
       WHERE id = $1`,
      [req.params.id, isArchived],
    );

    res.json({ ok: true, isArchived });
  } catch (error) {
    res.status(500).json({ message: "?? ??????? ???????? ????? ????.", error: error.message });
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

app.post("/api/chats/:id/messages", authMiddleware, async (req, res) => {
  try {
    const chat = await getChatForUser(req.params.id, req.user);
    if (!chat) return res.status(404).json({ message: "Чат не найден." });
    if (!req.user.companyId) return res.status(400).json({ message: "Только компания может писать сообщения." });

    const text = String(req.body.text || "").trim();
    const attachments = mapAttachments(req.body.attachments);

    if (!text && attachments.length === 0) {
      return res.status(400).json({ message: "Добавьте текст или вложение." });
    }

    await pool.query(
      `INSERT INTO chat_messages (id, chat_id, sender_company_id, text, attachments)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [`msg-${crypto.randomUUID()}`, req.params.id, req.user.companyId, text, JSON.stringify(attachments)],
    );

    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Не удалось отправить сообщение.", error: error.message });
  }
});

app.get("/api/companies", async (_req, res) => {
  try {
    const result = await pool.query(`SELECT id, name, city, industry, rating, description, about, specializations, reviews FROM companies ORDER BY id ASC`);
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
