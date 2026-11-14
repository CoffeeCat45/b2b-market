import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { DIRECT_API_BASE } from "./shared/apiEndpoints.js";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

function getApiOrigin(apiBase) {
  if (!/^https?:\/\//i.test(apiBase)) return "";

  try {
    return new URL(apiBase).origin;
  } catch {
    return "";
  }
}

function cspPlugin(apiBase) {
  let isDev = false;

  return {
    name: "csp-meta",
    configResolved(config) {
      isDev = config.command === "serve";
    },
    transformIndexHtml(html) {
      const apiOrigin = getApiOrigin(apiBase);
      // Прямой адрес API остаётся разрешённым и в сборке с прокси: без переменной API_BASE_URL
      // клиент обращается именно к нему, и такая сборка не должна ловить блокировку CSP.
      const apiOrigins = [...new Set([apiOrigin, getApiOrigin(DIRECT_API_BASE)].filter(Boolean))];
      // Модель и WASM-движок скачиваются с Hugging Face и jsDelivr, а ONNX Runtime
      // кэширует WASM-фабрику как blob. Отсюда script-src blob: и worker-src blob:.
      const modelOrigins = [
        "https://huggingface.co",
        "https://*.huggingface.co",
        "https://*.hf.co",
        "https://cdn.jsdelivr.net",
      ];
      const connectSources = [
        "'self'",
        ...apiOrigins,
        ...(isDev ? ["ws:"] : []),
        ...modelOrigins,
      ];
      const scriptSources = [
        "'self'",
        "blob:",
        "'wasm-unsafe-eval'",
        ...(isDev ? ["'unsafe-inline'"] : []),
      ];
      const csp = [
        "default-src 'self'",
        `script-src ${scriptSources.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src ${connectSources.join(" ")}`,
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");

      return html.replace("%CSP_CONTENT%", csp);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE_URL || "http://localhost:3000/api";

  return {
    plugins: [react(), cspPlugin(apiBase)],
    // GitHub Pages раздаёт проект из подпапки /b2b-market/, Netlify — из корня: без этой переменной
    // копия сайта на Netlify ссылается на несуществующие ассеты и показывает пустую страницу.
    base: env.VITE_BASE_PATH || "/b2b-market/",
    worker: {
      format: "es",
    },
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.appVersion || packageJson.version),
    },
  };
});
