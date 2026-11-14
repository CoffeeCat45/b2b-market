// Прозрачный прокси Cloudflare Worker перед Render: браузер ходит на workers.dev,
// который доступен там, где *.render.com сбрасывается провайдером.
const UPSTREAM_ORIGIN = "https://b2b-market-api.onrender.com";

// Заголовки одного соединения (hop-by-hop) нельзя переносить через прокси: они относятся
// к конкретному TCP-соединению, а не к ответу. `transfer-encoding` здесь главный виновник:
// с ним воркер отдаёт клиенту чужую chunked-разметку, и ответы больше 16 КБ обрываются.
const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const upstream = new URL(incoming.pathname + incoming.search, UPSTREAM_ORIGIN);
    const headers = new Headers(request.headers);

    headers.delete("host");
    // Ответ забираем целиком, поэтому сжатие от origin не нужно: кодировка остаётся identity,
    // и длина тела всегда совпадает с тем, что получит браузер.
    headers.delete("accept-encoding");

    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "follow",
    });

    const body = await response.arrayBuffer();
    const forwarded = new Headers(response.headers);

    for (const name of HOP_BY_HOP_HEADERS) {
      forwarded.delete(name);
    }

    // Длину считает Cloudflare по буферу: руки origin тут только запутают клиента.
    forwarded.delete("content-length");

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: forwarded,
    });
  },
};
