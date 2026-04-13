import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Бэкенд всегда читает секреты из server/.env, чтобы фронтендовые env-файлы не влияли на API-процесс.
dotenv.config({ path: path.join(__dirname, ".env") });

const rawConnectionString = process.env.DATABASE_URL?.trim();
const poolMaxFromEnv = Number(process.env.PGPOOLMAX || "");

function shouldUseSsl(url) {
  if (!url) return false;
  return /sslmode=require/i.test(url) || !/(localhost|127.0.0.1)/i.test(url);
}

function normalizeConnectionString(url) {
  if (!url) return url;
  return url.replace(/[?&]sslmode=require/gi, "");
}

function shouldUseManagedPoolDefaults(url) {
  if (!url) return false;
  return /(pooler|pgbouncer|6543)/i.test(url);
}

// У managed pooler-ов обычно низкие лимиты соединений, поэтому по умолчанию держим pool консервативным.
function resolvePoolMax(url) {
  if (Number.isFinite(poolMaxFromEnv) && poolMaxFromEnv > 0) {
    return poolMaxFromEnv;
  }

  return shouldUseManagedPoolDefaults(url) ? 1 : 10;
}

const connectionString = normalizeConnectionString(rawConnectionString);
const max = resolvePoolMax(rawConnectionString);

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: shouldUseSsl(rawConnectionString) ? { rejectUnauthorized: false } : false,
      max,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      query_timeout: 10000,
      statement_timeout: 10000,
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "b2b_market",
      max,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      query_timeout: 10000,
      statement_timeout: 10000,
    };

export const pool = new Pool(poolConfig);

export async function testConnection() {
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}

