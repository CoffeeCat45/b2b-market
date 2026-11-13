// Прозрачный прокси Cloudflare Worker перед Render: браузер ходит на workers.dev,
// который доступен там, где *.render.com сбрасывается провайдером.
const UPSTREAM_ORIGIN = "https://b2b-market-api.onrender.com";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const upstream = new URL(incoming.pathname + incoming.search, UPSTREAM_ORIGIN);
    const headers = new Headers(request.headers);

    headers.delete("host");
    headers.delete("accept-encoding");

    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "follow",
    });

    // Статус и заголовки, включая CORS от Render, отдаём без изменений.
    return new Response(response.body, response);
  },
};
