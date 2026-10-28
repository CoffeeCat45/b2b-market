import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

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
      const connectSources = ["'self'", ...(apiOrigin ? [apiOrigin] : []), ...(isDev ? ["ws:"] : [])];
      const csp = [
        "default-src 'self'",
        isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src ${connectSources.join(" ")}`,
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
    base: "/b2b-market/",
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.appVersion || packageJson.version),
    },
  };
});
