# Прокси API

## Что измерено (2026-11-14, Mac, VPN выключен, реальный Chrome)

`curl` в этом классе задач врёт: он ходит по TCP и не видит помех, которые ловит браузер.
Поэтому проверяли браузером — навигация и запросы `fetch` из страницы без CSP:

| Адрес | Браузер | `curl` |
| --- | --- | --- |
| `coffeecat45.github.io` (сам сайт) | 0.40 с | 0.51 с |
| `speed.cloudflare.com` | 0.30 с | 0.38 с |
| `*.netlify.app` | 0.30 с | — |
| `app.netlify.com` (панель Netlify) | 0.40 с | — |
| `*.koyeb.app` | 0.42 с | 0.48 с |
| `supabase.co` | 0.21 с | — |
| **`*.workers.dev` (нынешний прод-прокси)** | **не доходит, висит** | 0.30 с |
| **`*.onrender.com` (база)** | **не доходит, висит** | таймаут |
| `app.supabase.com` (панель Supabase) | не доходит, висит | — |
| `*.vercel.app` | не доходит, висит | — |

Вывод: блокируется не «весь Cloudflare», а именно `*.workers.dev` — то есть воркер из `cloudflare/`
не мог заработать для этой аудитории ни при каких правках. Нужен хостинг, до которого доходит
браузер и открывается панель управления. По замерам это **Netlify**.

## Основной вариант: Netlify, прокси = конфиг

`netlify.toml` в корне репозитория уже описывает прокси:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://b2b-market-api.onrender.com/api/:splat"
  status = 200
  force = true
```

Редирект со статусом 200 — это прозрачное проксирование: Netlify пересылает метод, query и тело
запроса и отдаёт ответ сервера как есть, вместе с CORS-заголовками Render. Своего кода нет,
зависимостей нет, лимит бесплатного тарифа — 100 ГБ трафика в месяц.

### Шаги (5–7 минут)

1. Открыть `https://app.netlify.com` → войти через GitHub (карта не нужна).
2. **Add new site → Import an existing project** → GitHub → репозиторий `CoffeeCat45/b2b-market`,
   ветка `develop`.
3. Build command `npm run build`, publish directory `dist` — подхватятся из `netlify.toml`,
   менять ничего не нужно.
4. **Deploy site** и дождаться сборки (первая — пара минут).
5. Site details → **Change site name** → например `b2b-market-api` → адрес станет
   `https://b2b-market-api.netlify.app`.
6. Прийти сюда и сказать этот адрес. Дальше я меняю репозиторную переменную `API_BASE_URL` на
   `https://b2b-market-api.netlify.app/api`, перезапускаю сборку Pages и проверяю сайт в браузере
   без VPN. Переменная уходит в `VITE_API_BASE_URL`, а `connect-src` в CSP генерируется из неё
   (`vite.config.js`) — правки в коде клиента не нужны.

### Что обязательно проверим после деплоя

- `https://<сайт>.netlify.app/api/health` — что прокси вообще отвечает;
- `https://<сайт>.netlify.app/api/companies` с заголовком `Origin: https://coffeecat45.github.io` —
  что CORS-заголовок от Render пришёл через прокси. Если Netlify съест `Access-Control-Allow-Origin`,
  лечится в одну строку: `[redirects.headers] Access-Control-Allow-Origin = "https://coffeecat45.github.io"`.

## Запасной вариант: Node-приложение

`proxy/server.js` — прозрачный прокси на чистом Node (без зависимостей) + `proxy/Dockerfile` для
любого хостинга контейнеров (Koyeb, Fly, Railway). Годится, если Netlify не устроит.
Локально проверено на искусственном origin: метод, путь, query, `Authorization`, тело POST с кириллицей
и `HEAD` проходят как надо, CORS-заголовки сервера переносятся, hop-by-hop (`transfer-encoding` и
прочие, относящиеся к одному соединению) отбрасываются. Если ответ не дошёл за `UPSTREAM_TIMEOUT_MS`
(75 с), прокси отдаёт `504` с кодом `DB_WAKING` — клиент ждёт пробуждения сервера общим health-опросом,
а не показывает красную ошибку.

```bash
cd proxy && PORT=3999 UPSTREAM_ORIGIN=https://b2b-market-api.onrender.com node server.js
```

## Почему не «перенести всё с Render»

Это тоже решает холодный старт, но трогает прод: перенос переменных, секретов и пулера Supabase.
Как отдельное решение — после того как сайт заработает без VPN.
