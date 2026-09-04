/**
 * Агора Каталог V0 — схема БД.
 *
 * Источник истины по объёму — описание задачи от Стаса: шесть сущностей
 * Company → Category → Request → RequestCompany → SupplierResponse → CompanyClaim,
 * плюс CompanySource (пункт 3 его спеки).
 *
 * Чего здесь СОЗНАТЕЛЬНО нет:
 *  - MOQ, сроки, доставка, брендирование. Это свойства ОФФЕРА, а не компании
 *    (в xlsx они на листе «Общие поля оффера»), и Стас их вычеркнул. Мёртвых колонок не держим.
 *  - 226 категорийных тех-полей и EAV (spec_definitions/spec_options/offer_spec_values).
 *    V0 ищет поставщиков, а не товары. Это V1.
 *  - Аккаунты поставщиков и покупателей, оплата, чаты, AI-матчинг.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * У drizzle нет своего tsvector. Без него generated-колонка уезжает в text,
 * и Postgres падает на применении миграции: выражение возвращает tsvector,
 * а колонка объявлена text. Плюс GIN-индекс по text для `@@` бесполезен.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
})

/* ------------------------------------------------------------------ enums */

/**
 * Управляется ПАРСЕРОМ. Пункт 4 спеки: не нашли — не удаляем, а active → unknown,
 * и только после проверки unknown → inactive.
 */
export const companyStatus = pgEnum('company_status', ['active', 'unknown', 'inactive'])

export const requestStatus = pgEnum('request_status', [
  'new',
  'processing',
  'suppliers_found',
  'sent_to_suppliers',
  'supplier_interested',
  'completed',
  'cancelled',
])

export const requestCompanyStatus = pgEnum('request_company_status', [
  'selected',
  'contacted',
  'no_answer',
  'interested',
  'not_interested',
  'connected',
])

export const supplierResponseStatus = pgEnum('supplier_response_status', [
  'new',
  'reviewed',
  'connected',
  'rejected',
])

export const claimType = pgEnum('claim_type', ['update', 'delete', 'verify', 'add_info'])
export const claimStatus = pgEnum('claim_status', ['new', 'in_review', 'applied', 'rejected'])

export const sourceType = pgEnum('source_type', ['yandex_maps', 'dadata', 'manual', 'claim', 'call'])

/* -------------------------------------------------------------- companies */

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // --- витрина
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    legalName: text('legal_name'),

    // --- ЕГРЮЛ, приходит из DaData (suggest/party), НЕ из checko
    inn: text('inn'),
    ogrn: text('ogrn'),
    kpp: text('kpp'),
    okved: text('okved'),
    /** ACTIVE / LIQUIDATED / REORGANIZING из ЕГРЮЛ. Размечает ликвидированных до обзвона. */
    egrulStatus: text('egrul_status'),

    // --- гео. V0 — только Москва, но схема сразу под регионы (справочником, не миграцией)
    region: text('region'),
    city: text('city'),
    address: text('address'),
    lat: doublePrecision('lat'),
    lon: doublePrecision('lon'),

    // --- контакты
    website: text('website'),
    email: text('email'),
    phone: text('phone'),
    /** Все телефоны с карт; phone — основной для витрины. */
    phones: text('phones').array(),

    /**
     * НАШ текст, идёт на сайт. Генерим/редактируем у себя — и авторские права,
     * и уникальность под SEO (300 копипаст с Я.Карт поисковик склеит в дубли).
     */
    description: text('description'),
    /** Сырое с Я.Карт. Наружу НЕ отдаём, только оператору и как вход для генерации. */
    descriptionRaw: text('description_raw'),

    /** Обобщённо, какие товары есть. Плоские теги, не характеристики. Пополняет Стас в панели. */
    productsTags: text('products_tags').array(),
    /**
     * Те же теги строкой — ТОЛЬКО чтобы попасть в поиск.
     * Обязан заполняться везде, где меняются productsTags: импортёр, панель, обогащение.
     * Почему не array_to_string прямо в generated-колонке: она помечена STABLE
     * (`provolatile = 's'`), а generated-выражение требует IMMUTABLE — Postgres падает
     * с `generation expression is not immutable`. Проверено на живом движке, не гипотеза.
     */
    productsText: text('products_text'),

    status: companyStatus('status').notNull().default('unknown'),
    isActive: boolean('is_active').notNull().default(true),
    /** Проверяли ли компанию вручную (обзвон Стаса). */
    isVerified: boolean('is_verified').notNull().default(false),

    // --- мягкое удаление по итогам обзвона (задача Рауана).
    // ОТДЕЛЬНО от status: тем управляет парсер и иначе перезатрёт результат обзвона.
    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedReason: text('deleted_reason'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by'),
    /** Чтобы оператор знал, где остановился в списке из 1000. */
    calledAt: timestamp('called_at', { withTimezone: true }),
    callNote: text('call_note'),

    sourceUrl: text('source_url'),
    /** Яндекс.Карты oid — ключ дедупликации парсера. */
    yandexOid: text('yandex_oid'),
    yandexRating: doublePrecision('yandex_rating'),
    yandexReviewsCount: integer('yandex_reviews_count'),
    hoursRaw: text('hours_raw'),

    /**
     * «Информация проверена 04.09.2026» на карточке. Спека: дата меняется каждый день,
     * проверка при этом не обязательна — значит на витрине показываем
     * greatest(last_checked_at, сегодня), а в это поле пишем реальную проверку.
     */
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * Поиск «пакеты с логотипом» по name + description + products_tags.
     * PG FTS с русской морфологией, для V0 этого хватает с запасом (пункт 6 спеки).
     */
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('russian'::regconfig, coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(products_text,''))`,
    ),
  },
  (t) => [
    uniqueIndex('companies_slug_key').on(t.slug),
    // ИНН — первый ключ дедупа (пункт 3 спеки). Partial: у половины компаний с карт ИНН нет.
    uniqueIndex('companies_inn_key').on(t.inn).where(sql`${t.inn} is not null`),
    uniqueIndex('companies_yandex_oid_key').on(t.yandexOid).where(sql`${t.yandexOid} is not null`),
    index('companies_status_idx').on(t.status),
    index('companies_city_idx').on(t.city),
    index('companies_search_idx').using('gin', sql`${t.searchVector}`),
  ],
)

/* ------------------------------------------------------------- categories */

/**
 * Дерево из xlsx Стаса — ТОЛЬКО названия, два уровня. 14 категорий верхнего уровня
 * + типы продукции как подкатегории/теги. Технические характеристики не сюда.
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    parentId: uuid('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    /** Для посадочных «гофрокороба в Москве» — там весь SEO-объём. */
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_slug_key').on(t.slug), index('categories_parent_idx').on(t.parentId)],
)

/** Одна компания может быть сразу в нескольких категориях (пункт 2 спеки). */
export const companyCategories = pgTable(
  'company_categories',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    /** true — проставил автомэппинг по рубрикам Я.Карт, false — подтвердил человек. */
    isAuto: boolean('is_auto').notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.categoryId] }),
    index('company_categories_category_idx').on(t.categoryId),
  ],
)

/* ---------------------------------------------------------- company_sources */

/** Пункт 3 спеки: откуда получили, когда получили, когда последний раз проверяли. */
export const companySources = pgTable(
  'company_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    sourceType: sourceType('source_type').notNull(),
    sourceUrl: text('source_url'),
    /** Сырой ответ источника — чтобы можно было перепрогнать нормализацию, не парся заново. */
    payload: jsonb('payload'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('company_sources_company_idx').on(t.companyId)],
)

/* ---------------------------------------------------------------- requests */

/** «Самая важная часть» по спеке. Необязательные поля — NULL. */
export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),

    title: text('title'),
    description: text('description').notNull(),

    quantity: text('quantity'),
    dimensions: text('dimensions'),
    material: text('material'),
    branding: text('branding'),
    deliveryCity: text('delivery_city'),
    deadline: text('deadline'),

    // ПД. Наружу (/requests/public) НЕ отдаются никогда.
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerEmail: text('customer_email'),

    status: requestStatus('status').notNull().default('new'),
    /** Внутренние заметки оператора. Тоже не наружу. */
    internalNote: text('internal_note'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('requests_status_idx').on(t.status), index('requests_created_idx').on(t.createdAt)],
)

/**
 * Пункт 7 спеки. Именно эта таблица даёт бизнес-метрики:
 * 100 заявок → 680 контактов → 430 ответили → 120 заинтересовались → 35 дошли.
 */
export const requestCompanies = pgTable(
  'request_companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    status: requestCompanyStatus('status').notNull().default('selected'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    responseAt: timestamp('response_at', { withTimezone: true }),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('request_companies_pair_key').on(t.requestId, t.companyId),
    index('request_companies_status_idx').on(t.status),
  ],
)

/* ------------------------------------------------------- supplier_responses */

/** Пункт 9: поставщик просто заполняет форму, аккаунт не нужен. */
export const supplierResponses = pgTable(
  'supplier_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    companyName: text('company_name'),
    name: text('name'),
    phone: text('phone'),
    email: text('email'),
    message: text('message'),
    status: supplierResponseStatus('status').notNull().default('new'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('supplier_responses_request_idx').on(t.requestId)],
)

/* ----------------------------------------------------------- company_claims */

/** Пункт 10: «Я представитель компании». Проверяется вручную. */
export const companyClaims = pgTable(
  'company_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    type: claimType('type').notNull(),
    status: claimStatus('status').notNull().default('new'),
    name: text('name'),
    position: text('position'),
    phone: text('phone'),
    email: text('email'),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('company_claims_company_idx').on(t.companyId), index('company_claims_status_idx').on(t.status)],
)

/* -------------------------------------------------------------------- admin */

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admin_users_email_key').on(t.email)],
)

/* ------------------------------------------------------------------ events */

/**
 * Аналитика поведения — просьба Рауана, в спеке Стаса этого нет.
 * Ценность не в счётчике визитов, а в том, КАКИЕ карточки смотрят: это лист для продаж.
 * Сырые события живём 90 дней (ретенция крон-джобой), дальше только агрегаты —
 * иначе при 5k визитов/сутки таблица съедает ~45 ГБ в год.
 * ip_hash, а не ip: для аналитики хватает, а ПД не храним.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitorId: text('visitor_id').notNull(),
    sessionId: text('session_id'),
    event: text('event').notNull(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    path: text('path'),
    referrer: text('referrer'),
    utm: jsonb('utm'),
    payload: jsonb('payload'),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_created_idx').on(t.createdAt),
    index('events_visitor_idx').on(t.visitorId),
    index('events_event_idx').on(t.event),
    index('events_company_idx').on(t.companyId),
  ],
)

/* ------------------------------------------------------------------- staging */

/**
 * Пункт 3 спеки: «парсер не должен напрямую хаотично писать в основную БД».
 * JSONL от парсера сначала падает сюда как есть, потом нормализация → дедуп → companies.
 * Если правила дедупа окажутся кривыми — перепрогоняем отсюда, не парся Яндекс заново.
 */
export const rawYandexOrgs = pgTable(
  'raw_yandex_orgs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oid: text('oid').notNull(),
    payload: jsonb('payload').notNull(),
    batch: text('batch').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    error: text('error'),
    scrapedAt: timestamp('scraped_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('raw_yandex_orgs_oid_batch_key').on(t.oid, t.batch),
    index('raw_yandex_orgs_processed_idx').on(t.processedAt),
  ],
)
