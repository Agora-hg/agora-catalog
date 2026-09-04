# Контракт публичного API — Агора Каталог V0

База: `https://api.<домен>.ru/v1` (московский VPS).
Публичные GET — без авторизации. Всё под `/admin` — только для операторской панели.

Правило, от которого зависит юридическая часть: **эндпоинты с персональными данными
живут только на московском VPS**. Публичный фронт (Next.js) может стоять где угодно,
но форма заявки постится прямо сюда, минуя хостинг фронта. 152-ФЗ.

## Чтение каталога (пункт 5 спеки)

    GET /companies
      ?category=<slug>&city=<slug>&verified=1&q=<строка>&page=1&per_page=24&sort=recommended|name
      → { items: CompanyCard[], total, page, per_page }

    GET /companies/{slug}          → CompanyDetail
    GET /categories                → CategoryNode[]   (дерево, 2 уровня)
    GET /categories/{slug}/companies?page=&per_page=  → как /companies
    GET /search?q=пакеты+с+логотипом&page=&per_page=  → как /companies

`is_deleted = true` и `is_active = false` не отдаются НИКОГДА и ни при каких фильтрах.
`status = 'inactive'` тоже скрыт; `unknown` показывается (мы просто не подтвердили).

### CompanyCard — то, что на карточке в списке
```json
{
  "slug": "alinapak",
  "name": "АлинаПак",
  "city": "Москва",
  "address": "Москва, ул. Такая-то, 5",
  "description": "наш текст, не с Я.Карт",
  "categories": [{ "slug": "gofrokoroba", "name": "Гофрокороба" }],
  "products_tags": ["Четырёхклапанные", "С печатью"],
  "website": "https://alinapak.ru",
  "is_verified": true,
  "checked_at": "2026-09-04"
}
```

`checked_at` — по спеке дата «Информация проверена» меняется каждый день и проверка
при этом не обязательна. Отдаём `max(last_checked_at, today)`, то есть фактически
сегодняшнюю дату. Врать про ручную проверку нельзя — за это отвечает `is_verified`.

`description_raw` не отдаётся наружу никогда: это чужой текст с Я.Карт, он только
для оператора и как вход для генерации нашего.

### CompanyDetail — мини-карточка по кнопке «Подробнее»
CompanyCard + `legal_name`, `inn`, `ogrn`, `kpp`, `okved`, `egrul_status`, `phone`,
`email`, `lat`, `lon`, `hours_raw`, `sources: [{ source_type, checked_at }]`.

Данные ЕГРЮЛ — из DaData (`suggest/party`), источник ФНС. С checko.ru не берём:
их пользовательское соглашение запрещает автосбор, а ст. 1333-1334 ГК РФ охраняет
их базу как совокупность (≥10 000 элементов, существенные затраты) — открытость
самих сведений ЕГРЮЛ от этого не спасает.

## Заявки (пункт 8 спеки)

    POST /requests            → { id }        приём заявки «Нужна упаковка»
    GET  /requests/public     → PublicRequest[]

`POST /requests` — обязателен только `description` + хотя бы один канал связи
(phone или email). Антиспам: honeypot-поле + rate limit по IP + минимальное время
заполнения формы. Капчу в V0 не ставим.

`GET /requests/public` НЕ отдаёт `customer_name`, `customer_phone`, `customer_email`,
`internal_note` — ни при каких условиях. Публичная версия: title, description,
delivery_city, quantity, deadline, created_at.

    POST /requests/{id}/responses   → { id }   отклик поставщика («Я поставщик — хочу откликнуться»)
    POST /companies/{slug}/claims   → { id }   «Я представитель компании»

`claims.type`: `update` | `delete` | `verify` | `add_info`.

## Аналитика

    POST /events   → 204

Батчами до 50 событий. Собираем `visitor_id` (cookie, 1 год), `session_id`,
`event`, `company_id`, `category_id`, `path`, `referrer`, `utm`.
IP не храним — только `ip_hash`. События: `page_view`, `card_view`, `card_expand`,
`website_click`, `filter_apply`, `search`, `request_form_open`, `request_submit`,
`claim_open`, `claim_submit`.

Сырые события живут 90 дней, дальше агрегаты. Без ретенции при 5k визитов/сутки
таблица съедает ~45 ГБ в год.

## Операторская панель

    POST   /admin/auth/login
    GET    /admin/companies?q=&status=&called=0|1&page=
    PATCH  /admin/companies/{id}
    POST   /admin/companies/{id}/delete   { reason }    → is_deleted=1, НЕ DELETE
    POST   /admin/companies/{id}/verify
    POST   /admin/companies/{id}/call     { note }      → called_at
    GET    /admin/requests, PATCH /admin/requests/{id}
    POST   /admin/requests/{id}/companies { company_ids[] }
    PATCH  /admin/request-companies/{id}  { status, comment }
    GET    /admin/claims, PATCH /admin/claims/{id}
    GET    /admin/categories, POST /admin/categories, PATCH /admin/categories/{id}
    GET    /admin/stats/funnel

Удаление компании — всегда мягкое: `is_deleted = 1` + `deleted_reason` + `deleted_at`
+ `deleted_by`. Физического DELETE в панели нет вообще. Причина: собираем статистику
по обзвону, а восстановить снесённую запись потом нечем.

`status` (active/unknown/inactive) трогает ТОЛЬКО парсер. Оператор трогает
`is_deleted`, `is_verified`, `called_at`. Если смешать — следующий прогон парсера
перезатрёт результаты обзвона.
