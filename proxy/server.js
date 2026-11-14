// Прозрачный прокси API: браузер ходит сюда, а отсюда запрос уходит на Render.
// Нужен потому, что провайдеры в России режут и *.render.com, и Cloudflare, а браузеры
// до этого хостинга доходят. Секретов здесь нет: адрес origin публичный.
import { createServer } from "node:http";

const UPSTREAM_ORIGIN = process.env.UPSTREAM_ORIGIN || "https://b2b-market-api.onrender.com";
const PORT = Number(process.env.PORT) || 3000;
// Холодный старт Render длится около минуты, поэтому ждём дольше, чем браузер.
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 75000;
const MAX_BODY_BYTES = 25 * 1024 * 1024;

// Hop-by-hop заголовки относятся к одному соединению: скопированный через прокси
// `transfer-encoding` ломает разметку ответа на стороне браузера.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("REQUEST_BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function copyHeaders(source, target, omit) {
  for (const [name, value] of source.entries()) {
    if (HOP_BY_HOP.has(name.toLowerCase()) || omit?.has(name.toLowerCase())) continue;
    target.append(name, value);
  }
}

function sendJson(res, status, payload, headers) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...Object.fromEntries(headers.entries()),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const incoming = new URL(req.url, "http://localhost");
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, UPSTREAM_ORIGIN);
  const method = String(req.method || "GET").toUpperCase();
  const withBody = method !== "GET" && method !== "HEAD";

  const requestHeaders = new Headers();
  copyHeaders(new Headers(req.headers), requestHeaders, new Set(["accept-encoding"]));

  let body;
  if (withBody) {
    try {
      const buffer = await readBody(req);
      body = buffer.length ? buffer : undefined;
    } catch {
      sendJson(res, 413, { ok: false, message: "Запрос слишком большой." }, new Headers());
      return;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstream, {
      method,
      headers: requestHeaders,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    // Ответ не пришёл: сервер спит или сеть не прошла. Код DB_WAKING заставляет клиента
    // дождаться пробуждения общим health-опросом и повторить запрос, а не показать ошибку.
    const headers = new Headers();
    headers.append("Access-Control-Allow-Origin", req.headers.origin || "*");
    sendJson(res, 504, { ok: false, code: "DB_WAKING", message: "Сервер не ответил вовремя." }, headers);
    return;
  } finally {
    clearTimeout(timer);
  }

  const payload = Buffer.from(await upstreamResponse.arrayBuffer());
  const responseHeaders = new Headers();
  copyHeaders(upstreamResponse.headers, responseHeaders);

  res.writeHead(upstreamResponse.status, {
    ...Object.fromEntries(responseHeaders.entries()),
    "Content-Length": payload.length,
  });
  res.end(req.method === "HEAD" ? undefined : payload);
});

server.listen(PORT, () => {
  console.log(`api-proxy слушает ${PORT}, upstream ${UPSTREAM_ORIGIN}`);
});
