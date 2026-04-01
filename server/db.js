import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const rawConnectionString = process.env.DATABASE_URL?.trim();

function shouldUseSsl(url) {
  if (!url) return false;
  return /sslmode=require/i.test(url) || !/(localhost|127\.0\.0\.1)/i.test(url);
}

function normalizeConnectionString(url) {
  if (!url) return url;
  return url.replace(/[?&]sslmode=require/gi, "");
}

const connectionString = normalizeConnectionString(rawConnectionString);

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: shouldUseSsl(rawConnectionString) ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "b2b_market",
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
