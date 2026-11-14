# Прокси API на Koyeb

## Почему не Cloudflare

Замер с того же компьютера и той же сети (VPN выключен, 2026-11-14): `curl` получает
`https://b2b-market-api.cosmocats08.workers.dev/api/health` за 0.3 с, а Chrome в этот же момент
держит запросы к `*.workers.dev` и `speed.cloudflare.com` в pending бесконечно. Контроль в том же
Chrome: `coffeecat45.github.io` и произвольный `*.koyeb.app` открываются. То есть браузеры этой сети
до Cloudflare не проходят, и воркер на `workers.dev` для российских пользователей бесполезен —
он лечил блокировку Render и упирался в блокировку Cloudflare.

Koyeb выбран потому, что доступность браузера проверена до деплоя: `*.koyeb.app` открывается.

## Что делает прокси

`proxy/server.js` — прозрачный прокси без единой зависимости: сохраняет метод, путь, query, заголовки
и тело запроса, пересылает всё на Render и отдаёт ответ как есть, вместе с CORS-заголовками сервера.
Секретов нет, адрес origin публичный, база и бэкенд не трогаются.

Проверено локально на искусственном origin: путь и query сохраняются, `Authorization` доходит,
тело POST приходит целиком (включая кириллицу), `HEAD` возвращается без тела, `Access-Control-Allow-Origin`
проксируется. Отдельная ветка — ответ не дошёл за `UPSTREAM_TIMEOUT_MS` (75 с): прокси отдаёт
`504` с кодом `DB_WAKING`, и клиент ждёт пробуждения сервера общим health-опросом вместо красной ошибки.

Hop-by-hop заголовки (`transfer-encoding`, `connection` и остальные) не переносятся: они относятся к одному
соединению, и скопированный `chunked` ломает ответ в браузере.

## Настройка (10 минут, бесплатно)

1. Зайти на `https://app.koyeb.com` через GitHub.
2. **Create Service → Web service**.
3. Источник: **GitHub**, репозиторий `CoffeeCat45/b2b-market`, ветка `develop`.
   Builder — **Docker**, путь к Dockerfile — `proxy/Dockerfile`.
4. Регион и инстанс: любой европейский регион, тип инстанса — **Free**.
5. Порт: **3000** с включённым **Public domain**; имя сервиса, например `b2b-market-api`
   (если занято — любое другое, итоговый адрес всё равно брать из карточки сервиса).
6. Health check (рекомендую, заодно не даёт Render уснуть): HTTP, порт 3000, путь `/api/health`.
7. **Deploy Service** → скопировать адрес вида `https://<имя>.koyeb.app`.

Дальше адрес попадает в сборку:

```bash
gh variable set API_BASE_URL --repo CoffeeCat45/b2b-market --body "https://<имя>.koyeb.app/api"
gh workflow run "Deploy to GitHub Pages" --repo CoffeeCat45/b2b-market --ref develop
```

Переменная `API_BASE_URL` уходит в `VITE_API_BASE_URL` при сборке, а `connect-src` в CSP генерируется
из неё же (`vite.config.js`) — править код клиента для смены адреса не нужно.

## Проверка

```bash
curl -sS -o /dev/null -w 'code=%{http_code} t=%{time_total}s\n' https://<имя>.koyeb.app/api/health
curl -sS -o /dev/null -w 'code=%{http_code} size=%{size_download} acao=%header{access-control-allow-origin}\n' \
  -H 'Origin: https://coffeecat45.github.io' https://<имя>.koyeb.app/api/companies
```

Первый запрос может идти минуту — Render на бесплатном тарифе просыпается. Основной тест — не `curl`,
а браузер в той сети, где сайт не работал: открыть сайт без VPN и дождаться каталога.

## Запасной вариант

Если Koyeb не даст собрать из репозитория, тот же код публикуется как Docker-образ через GitHub Actions
(`ghcr.io`), а в Koyeb выбирается «Deploy from a public Docker image». Файлы для этого не меняются.
