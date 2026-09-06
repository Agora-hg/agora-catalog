# Деплой V0

Решение владельца от 2026-09-06: **отдельный VPS не арендуем, живём на общем**
`178.88.115.213` (`visualmind.kz`) — там же, где мозг AmanAI, ~13 процессов PM2
чужих проектов, Postgres, MySQL, nginx-сайты `agora-*` и ollama.

Раскладка:

- **`apps/web`** — Vercel (решение владельца). Домена пока нет.
- **`apps/api`** + Postgres + операторская панель — общий VPS.
- **Парсер Я.Карт** — локально у владельца, на сервер не ставится.

## Адрес API до появления домена

```
https://agora-catalog.178.88.115.213.sslip.io/v1
```

Домен для этого не нужен: `sslip.io` резолвит IP из имени, certbot выдаёт на него
обычный сертификат. Так уже сделано для основной Агоры и для мозга — схема рабочая.

То есть `NEXT_PUBLIC_API_URL` можно прописывать **сегодня**, не дожидаясь домена.
Появится домен — меняются `server_name` в nginx и одна переменная окружения.

## Что занято на сервере, чтобы ни во что не въехать

| порт | чей |
|---|---|
| 8787 | мозг graphify, AmanAI |
| 8788 | мозг graphify, Агора |
| **8791** | **наш API** |
| 5432 | Postgres (общий) |
| 3306 | MySQL (чужой) |

PM2 не используем: наш процесс под systemd, чтобы не смешиваться с чужими
`trek`, `gemini-proxy`, `kz-ai-admin`, `ticket-bot`, `reply-bot`, `forum-monitor`,
`tg-sender`, `avito-parser`, `krisha-*`, `multi-parser`, `fcor-editor`.
**Ничего из этого списка не трогать** — это не наши проекты.

В юните стоит `MemoryMax=768M`. Сервер общий, и 3 сентября его уже приходилось
разгружать: погасили четыре чужих процесса, освободилось 4.5 ГБ (used 6221→1678 МБ).
Жёсткий лимит нужен, чтобы утечка у нас не уронила соседей.

## Порядок установки

```bash
# 1. база и роль
sudo -u postgres createuser agora_catalog --pwprompt
sudo -u postgres createdb agora_catalog -O agora_catalog

# 2. код
git clone https://github.com/Agora-hg/agora-catalog.git /opt/agora-catalog
cd /opt/agora-catalog && npm ci
# Сборки dist/ у API нет (noEmit): systemd стартует tsx apps/api/src/index.ts
cp .env.example .env && nano .env      # DATABASE_URL, CORS_ORIGINS, IP_HASH_SALT, SESSION_SECRET

# 3. схема и категории
npm run -w @agora/db setup             # миграции + 72 категории

# 4. сервис
mkdir -p /var/log/agora-catalog
cp deploy/agora-catalog-api.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now agora-catalog-api
systemctl status agora-catalog-api --no-pager

# 5. nginx и TLS
cp deploy/nginx-agora-catalog.conf /etc/nginx/sites-available/agora-catalog
ln -s /etc/nginx/sites-available/agora-catalog /etc/nginx/sites-enabled/
certbot certonly --webroot -w /var/www/html -d agora-catalog.178.88.115.213.sslip.io
nginx -t && systemctl reload nginx

# 6. бэкапы. На этом сервере crontab уже чужой — НЕ `echo | crontab -`,
# это затрёт trek/tg-tool/fcor/agora-backend. Только дописать строку.
(crontab -l 2>/dev/null; echo '15 4 * * * /opt/agora-catalog/deploy/backup.sh >> /var/log/agora-catalog/backup.log 2>&1') | crontab -
```

## Почему API запускается через tsx, а не из dist

Импорты внутри `apps/api` указывают на файлы с расширением `.ts`
(`from './admin/routes.ts'`). Для tsx это рабочая схема, но при компиляции в JS
она разваливается: в собранном коде импорт остаётся `.ts`, а файла рядом нет.
Проверено дорогой ценой — именно так упал первый деплой фронта на Vercel,
когда он по ошибке собрал `apps/api`:

```
Cannot find module '/var/task/apps/api/src/admin/routes.ts'
imported from /var/task/apps/api/src/app.js
```

Node 22 плюс tsx выполняет TypeScript напрямую, `npm run build` для API не нужен.
Если когда-нибудь понадобится настоящая сборка — сначала переписать импорты
на расширение `.js` (так требует ESM после компиляции), это отдельная задача.
## Vercel: Root Directory обязателен

В настройках проекта на Vercel **Root Directory = `apps/web`**. Без этого Vercel
сканирует монорепо, находит `apps/api` и пытается поднять бэкенд как serverless-функцию —
получаем FUNCTION_INVOCATION_FAILED на всех маршрутах, включая `/robots.txt`.

Бэкенду на Vercel делать нечего и по существу: там персональные данные заявок
и операторская панель, они живут только на сервере в РФ (см. ниже).
## Журнал миграций: не накатывать SQL мимо мигратора

На сервере схему сначала подняли напрямую через `psql`, минуя drizzle. В итоге
таблицы были, а `drizzle.__drizzle_migrations` не существовало — мигратор считал,
что не применено НИЧЕГО. Из-за этого миграция 0004 (триггер `products_text`)
не встала, и воркеру пришлось вешать триггер руками, а 0005 не встала вовсе.

Журнал восстановлен 2026-09-06: записи перенесены с локальной базы, недостающая
0005 применена. Впредь схему на сервере трогать **только** через
`npm run -w @agora/db setup` — он идемпотентен и ведёт журнал сам.

Проверка состояния:

```sql
select count(*) from drizzle.__drizzle_migrations;              -- должно совпадать с числом файлов в migrations/
select count(*) from pg_trigger where tgname='companies_products_text';  -- 1
```

## CORS — не забыть, иначе фронт не увидит ответов

Фронт живёт на Vercel, API на sslip.io — это разные origin, значит нужен CORS.
В `.env` на сервере:

```
CORS_ORIGINS=https://<проект>.vercel.app,http://localhost:3000
```

Формы без JS от CORS не зависят (нативный POST `urlencoded` не делает preflight),
но `303` обязан вести обратно на origin фронта — см. `docs/API.md`, «Приём форм».

## Грабли этого сервера (из `_brain/operator/VPS.md`, проверены)

- Составные команды через SSH с кавычками и пайпами ломаются: гонять скрипт
  через `base64 -w0`, куски по ~500 символов.
- `scp` иногда молча не доезжает (RC=0, файла нет) — проверять `wc -c` после заливки.
- Вложенный heredoc внутри base64-скрипта падает молча.
- `journalctl` в составной команде подвешивает вызов — запускать отдельно.
- `sshpass` отбивает первые 1-2 попытки пароля, потом входит. Это не ошибка.
- В `curl`-тестах всегда `-o /dev/null`.

## Персональные данные — риск, который надо знать

Сервер физически в Казахстане. Заявки содержат имя, телефон и email граждан РФ,
а 152-ФЗ требует держать базу персональных данных на серверах в РФ и подать
уведомление в РКН. Раньше я предлагал под это отдельный VPS в Москве; решение
владельца — остаться на общем, риск принят осознанно.

Дешёвая страховка, которая ничего не ломает и не требует переезда:
**в V0 не хранить персональную часть заявки в базе.** Письмо оператору уходит
с полным содержимым, а в `requests` пишем только неперсональное — категорию,
город, объём, срок, текст запроса, — и оставляем `customer_*` пустыми.
Воронка `request_companies` от этого не страдает, метрики считаются полностью,
базы персональных данных при этом просто не существует.

Если так делаем — надо сказать: это меняет TASK-010, и `GET /admin/requests`
будет показывать оператору контакты только из письма, а не из панели.
Решение за владельцем, по умолчанию оставляю как в контракте (пишем в базу).
