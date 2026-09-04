import '../src/load-env.js'
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { sql } from 'drizzle-orm'
import { categories, companies, companyCategories, companySources, seedCategories } from '@agora/db'
import { buildApp, invalidateCatalogCache } from '../src/app.js'
import { createDb, createPool } from '../src/db.js'
import { todayCheckedAt } from '../src/catalog/serialize.js'

process.env.CACHE_TTL_MS = '0'

const RAW = {
  visible: 'RAW_LEAK_VISIBLE_YANDEX_TEXT',
  deleted: 'RAW_LEAK_DELETED_YANDEX_TEXT',
  inactiveFlag: 'RAW_LEAK_INACTIVE_FLAG_YANDEX_TEXT',
  inactiveStatus: 'RAW_LEAK_INACTIVE_STATUS_YANDEX_TEXT',
  unknown: 'RAW_LEAK_UNKNOWN_YANDEX_TEXT',
  tags: 'RAW_LEAK_TAGS_YANDEX_TEXT',
  unverified: 'RAW_LEAK_UNVERIFIED_YANDEX_TEXT',
}

const HIDDEN_SLUGS = ['hidden-deleted', 'hidden-inactive-flag', 'hidden-inactive-status']
const VISIBLE_SLUGS = ['alinapak', 'tags-search', 'unknown-co', 'unverified-co']

const CARD_KEYS = [
  'slug',
  'name',
  'city',
  'address',
  'description',
  'categories',
  'products_tags',
  'website',
  'is_verified',
  'checked_at',
]
const DETAIL_KEYS = [
  ...CARD_KEYS,
  'legal_name',
  'inn',
  'ogrn',
  'kpp',
  'okved',
  'egrul_status',
  'phone',
  'email',
  'lat',
  'lon',
  'hours_raw',
  'sources',
]
const LIST_KEYS = ['items', 'total', 'page', 'per_page']

const pool = createPool()
const db = createDb(pool)
const app = await buildApp(db)

function keysOf(value: object): string[] {
  return Object.keys(value)
}

function assertExactKeys(value: object, expected: string[], label: string) {
  assert.deepEqual(keysOf(value).sort(), [...expected].sort(), label)
}

function assertNoLeak(raw: string, label: string) {
  assert.equal(raw.includes('description_raw'), false, `${label}: key description_raw`)
  assert.equal(raw.includes('descriptionRaw'), false, `${label}: key descriptionRaw`)
  for (const token of Object.values(RAW)) {
    assert.equal(raw.includes(token), false, `${label}: token ${token}`)
  }
}

function slugsOf(body: { items: { slug: string }[] }): string[] {
  return body.items.map((item) => item.slug)
}

async function insertCompany(
  values: Partial<typeof companies.$inferInsert> & Pick<typeof companies.$inferInsert, 'name' | 'slug'>,
) {
  const [row] = await db.insert(companies).values(values).returning({ id: companies.id, slug: companies.slug })
  return row
}

async function seedFixtures() {
  const gofro = await db.select().from(categories).where(sql`${categories.slug} = 'gofrokoroba'`).then((r) => r[0])
  const child = await db
    .select()
    .from(categories)
    .where(sql`${categories.slug} = 'chetyrehklapannye'`)
    .then((r) => r[0])
  assert.ok(gofro && child, 'categories must be seeded')

  const alinapak = await insertCompany({
    name: 'АлинаПак',
    slug: 'alinapak',
    legalName: 'ООО АлинаПак',
    inn: '7700000001',
    ogrn: '1027700000001',
    kpp: '770001001',
    okved: '17.21',
    egrulStatus: 'ACTIVE',
    city: 'Москва',
    address: 'Москва, ул. Такая-то, 5',
    lat: 55.75,
    lon: 37.62,
    website: 'https://alinapak.ru',
    email: 'info@alinapak.ru',
    phone: '+7 495 000-00-01',
    description: 'наш текст, не с Я.Карт',
    descriptionRaw: RAW.visible,
    productsTags: ['Четырёхклапанные', 'С печатью'],
    status: 'active',
    isActive: true,
    isVerified: true,
    isDeleted: false,
    hoursRaw: 'пн-пт 9:00-18:00',
    lastCheckedAt: new Date('2020-01-15T00:00:00Z'),
  })

  const tags = await insertCompany({
    name: 'ООО ТегПоиск',
    slug: 'tags-search',
    city: 'Москва',
    address: 'Москва, склад 1',
    description: 'производитель упаковки для склада',
    descriptionRaw: RAW.tags,
    productsTags: ['пакеты с логотипом'],
    status: 'active',
    isActive: true,
    isVerified: false,
    isDeleted: false,
  })

  await insertCompany({
    name: 'Неизвестная фирма',
    slug: 'unknown-co',
    city: 'Москва',
    description: 'статус unknown должен быть виден',
    descriptionRaw: RAW.unknown,
    productsTags: ['скотч'],
    status: 'unknown',
    isActive: true,
    isVerified: false,
    isDeleted: false,
  })

  await insertCompany({
    name: 'Без проверки',
    slug: 'unverified-co',
    city: 'Москва',
    description: 'не проверяли вручную',
    descriptionRaw: RAW.unverified,
    status: 'active',
    isActive: true,
    isVerified: false,
    isDeleted: false,
  })

  const deleted = await insertCompany({
    name: 'Удалённая',
    slug: 'hidden-deleted',
    city: 'Москва',
    description: 'не должна отдаваться',
    descriptionRaw: RAW.deleted,
    productsTags: ['пакеты с логотипом'],
    status: 'active',
    isActive: true,
    isVerified: true,
    isDeleted: true,
    deletedReason: 'не существует',
  })

  const inactiveFlag = await insertCompany({
    name: 'Выключенная',
    slug: 'hidden-inactive-flag',
    city: 'Москва',
    description: 'is_active=0',
    descriptionRaw: RAW.inactiveFlag,
    productsTags: ['пакеты с логотипом'],
    status: 'active',
    isActive: false,
    isVerified: true,
    isDeleted: false,
  })

  const inactiveStatus = await insertCompany({
    name: 'Неактивный статус',
    slug: 'hidden-inactive-status',
    city: 'Москва',
    description: "status=inactive",
    descriptionRaw: RAW.inactiveStatus,
    productsTags: ['пакеты с логотипом'],
    status: 'inactive',
    isActive: true,
    isVerified: true,
    isDeleted: false,
  })

  await db.insert(companyCategories).values([
    { companyId: alinapak.id, categoryId: gofro.id, isAuto: false },
    { companyId: alinapak.id, categoryId: child.id, isAuto: false },
    { companyId: tags.id, categoryId: gofro.id, isAuto: true },
    { companyId: deleted.id, categoryId: gofro.id, isAuto: true },
    { companyId: inactiveFlag.id, categoryId: gofro.id, isAuto: true },
    { companyId: inactiveStatus.id, categoryId: gofro.id, isAuto: true },
  ])

  await db.insert(companySources).values({
    companyId: alinapak.id,
    sourceType: 'yandex_maps',
    sourceUrl: 'https://yandex.ru/maps/org/1',
    payload: { description: RAW.visible, secret: 'should-not-leak' },
    checkedAt: new Date('2026-01-10T00:00:00Z'),
  })
}

const FILTER_URLS = [
  '/v1/companies',
  '/v1/companies?city=moskva',
  '/v1/companies?verified=1',
  '/v1/companies?category=gofrokoroba',
  '/v1/companies?q=пакеты',
  '/v1/companies?city=moskva&category=gofrokoroba&verified=1&q=пакеты&sort=name',
  '/v1/search?q=пакеты с логотипом',
  '/v1/categories/gofrokoroba/companies',
  '/v1/categories/chetyrehklapannye/companies',
]

describe('public catalog API', () => {
  before(async () => {
    await seedCategories(db)
  })

  beforeEach(async () => {
    invalidateCatalogCache()
    await db.execute(sql`truncate table company_sources, company_categories, companies cascade`)
    await seedFixtures()
  })

  after(async () => {
    await app.close()
    await pool.end()
  })

  test('hidden companies never appear on any list endpoint or filter', async () => {
    for (const url of FILTER_URLS) {
      const res = await app.inject({ method: 'GET', url })
      assert.equal(res.statusCode, 200, url)
      const body = res.json() as { items: { slug: string }[] }
      const slugs = slugsOf(body)
      for (const hidden of HIDDEN_SLUGS) {
        assert.equal(slugs.includes(hidden), false, `${url} leaked ${hidden}`)
      }
      assertNoLeak(res.body, url)
    }
  })

  test('hidden slugs 404 on detail and do not leak description_raw', async () => {
    for (const slug of HIDDEN_SLUGS) {
      const res = await app.inject({ method: 'GET', url: `/v1/companies/${slug}` })
      assert.equal(res.statusCode, 404, slug)
      assertNoLeak(res.body, `/v1/companies/${slug}`)
    }
  })

  test('status=unknown is visible; is_deleted / is_active=0 / inactive are not', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/companies' })
    const slugs = slugsOf(res.json())
    assert.equal(slugs.includes('unknown-co'), true)
    for (const hidden of HIDDEN_SLUGS) assert.equal(slugs.includes(hidden), false)
  })

  test('search by products_tags only: пакеты с логотипом', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=' + encodeURIComponent('пакеты с логотипом'),
    })
    assert.equal(res.statusCode, 200)
    const body = res.json() as { items: { slug: string; products_tags: string[] }[] }
    const slugs = slugsOf(body)
    assert.equal(slugs.includes('tags-search'), true, `got slugs: ${slugs.join(',')}`)
    for (const hidden of HIDDEN_SLUGS) assert.equal(slugs.includes(hidden), false)
    const card = body.items.find((item) => item.slug === 'tags-search')
    assert.ok(card)
    assert.deepEqual(card.products_tags, ['пакеты с логотипом'])
    assertNoLeak(res.body, '/v1/search')
  })

  test('search does not match description_raw', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/search?q=' + encodeURIComponent(RAW.visible),
    })
    assert.equal(res.statusCode, 200)
    const slugs = slugsOf(res.json())
    assert.equal(slugs.includes('alinapak'), false)
    assert.equal(slugs.length, 0)
    assertNoLeak(res.body, 'search raw token')
  })

  test('checked_at is today; is_verified comes from the database', async () => {
    const today = todayCheckedAt()
    const list = await app.inject({ method: 'GET', url: '/v1/companies' })
    const items = (list.json() as { items: { slug: string; is_verified: boolean; checked_at: string }[] }).items
    for (const item of items) {
      assert.equal(item.checked_at, today, item.slug)
    }
    assert.equal(items.find((i) => i.slug === 'alinapak')?.is_verified, true)
    assert.equal(items.find((i) => i.slug === 'unverified-co')?.is_verified, false)

    const detail = await app.inject({ method: 'GET', url: '/v1/companies/alinapak' })
    const company = detail.json() as { is_verified: boolean; checked_at: string }
    assert.equal(company.is_verified, true)
    assert.equal(company.checked_at, today)
  })

  test('CompanyCard / CompanyDetail / list shapes match docs/API.md', async () => {
    const listRes = await app.inject({ method: 'GET', url: '/v1/companies?sort=name' })
    const list = listRes.json() as { items: Record<string, unknown>[]; total: number; page: number; per_page: number }
    assertExactKeys(list, LIST_KEYS, 'list')
    assert.equal(list.page, 1)
    assert.equal(list.per_page, 24)
    assert.equal(list.total, VISIBLE_SLUGS.length)

    const card = list.items.find((item) => item.slug === 'alinapak') as Record<string, unknown>
    assert.ok(card)
    assertExactKeys(card, CARD_KEYS, 'card')
    const cats = card.categories as { slug: string; name: string }[]
    for (const cat of cats) assertExactKeys(cat, ['slug', 'name'], 'card.categories[]')
    assert.equal(card.description, 'наш текст, не с Я.Карт')
    assert.equal(card.city, 'Москва')
    assert.equal(card.website, 'https://alinapak.ru')
    assert.deepEqual(card.products_tags, ['Четырёхклапанные', 'С печатью'])

    const detailRes = await app.inject({ method: 'GET', url: '/v1/companies/alinapak' })
    assert.equal(detailRes.statusCode, 200)
    const detail = detailRes.json() as Record<string, unknown>
    assertExactKeys(detail, DETAIL_KEYS, 'detail')
    assert.equal(detail.legal_name, 'ООО АлинаПак')
    assert.equal(detail.inn, '7700000001')
    assert.equal(detail.ogrn, '1027700000001')
    assert.equal(detail.kpp, '770001001')
    assert.equal(detail.okved, '17.21')
    assert.equal(detail.egrul_status, 'ACTIVE')
    assert.equal(detail.phone, '+7 495 000-00-01')
    assert.equal(detail.email, 'info@alinapak.ru')
    assert.equal(detail.lat, 55.75)
    assert.equal(detail.lon, 37.62)
    assert.equal(detail.hours_raw, 'пн-пт 9:00-18:00')
    const sources = detail.sources as Record<string, unknown>[]
    assert.equal(sources.length, 1)
    assertExactKeys(sources[0], ['source_type', 'checked_at'], 'sources[]')
    assert.equal(sources[0].source_type, 'yandex_maps')
    assert.equal(sources[0].checked_at, '2026-01-10')
    assertNoLeak(detailRes.body, 'detail')
  })

  test('categories tree is two levels without extra fields', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/categories' })
    assert.equal(res.statusCode, 200)
    const tree = res.json() as { slug: string; name: string; children: { slug: string; name: string; children: unknown[] }[] }[]
    assert.ok(tree.length > 0)
    const gofro = tree.find((n) => n.slug === 'gofrokoroba')
    assert.ok(gofro)
    assertExactKeys(gofro, ['slug', 'name', 'children'], 'category node')
    assert.equal(gofro.name, 'Гофрокороба')
    assert.ok(gofro.children.some((c) => c.slug === 'chetyrehklapannye'))
    for (const child of gofro.children) {
      assertExactKeys(child, ['slug', 'name', 'children'], 'child node')
      assert.deepEqual(child.children, [])
    }
    assertNoLeak(res.body, '/v1/categories')
  })

  test('GET /v1/categories/{slug}/companies filters by category and descendants', async () => {
    const parent = await app.inject({ method: 'GET', url: '/v1/categories/gofrokoroba/companies' })
    const parentSlugs = slugsOf(parent.json())
    assert.equal(parentSlugs.includes('alinapak'), true)
    assert.equal(parentSlugs.includes('tags-search'), true)
    for (const hidden of HIDDEN_SLUGS) assert.equal(parentSlugs.includes(hidden), false)

    const child = await app.inject({ method: 'GET', url: '/v1/categories/chetyrehklapannye/companies' })
    const childSlugs = slugsOf(child.json())
    assert.equal(childSlugs.includes('alinapak'), true)
    assert.equal(childSlugs.includes('tags-search'), false)

    const missing = await app.inject({ method: 'GET', url: '/v1/categories/no-such-cat/companies' })
    assert.equal(missing.statusCode, 404)
  })

  test('verified=1 returns only is_verified companies', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/companies?verified=1' })
    const items = (res.json() as { items: { slug: string; is_verified: boolean }[] }).items
    assert.ok(items.length >= 1)
    for (const item of items) assert.equal(item.is_verified, true)
    assert.equal(items.some((i) => i.slug === 'unverified-co'), false)
    assert.equal(items.some((i) => i.slug === 'alinapak'), true)
  })

  test('sort=name is alphabetical; pagination uses page/per_page/total', async () => {
    const named = await app.inject({ method: 'GET', url: '/v1/companies?sort=name' })
    const names = (named.json() as { items: { name: string }[] }).items.map((i) => i.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'ru'))
    assert.deepEqual(names, sorted)

    const page1 = await app.inject({ method: 'GET', url: '/v1/companies?sort=name&per_page=1&page=1' })
    const body1 = page1.json() as { items: { slug: string }[]; total: number; page: number; per_page: number }
    assert.equal(body1.page, 1)
    assert.equal(body1.per_page, 1)
    assert.equal(body1.items.length, 1)
    assert.equal(body1.total, VISIBLE_SLUGS.length)

    const page2 = await app.inject({ method: 'GET', url: '/v1/companies?sort=name&per_page=1&page=2' })
    const body2 = page2.json() as { items: { slug: string }[] }
    assert.equal(body2.items.length, 1)
    assert.notEqual(body1.items[0].slug, body2.items[0].slug)
  })

  test('search without q is 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/search' })
    assert.equal(res.statusCode, 400)
  })

  test('catalog cache hit returns the same JSON object, not a stringified string', async () => {
    process.env.CACHE_TTL_MS = '60000'
    invalidateCatalogCache()
    const miss = await app.inject({ method: 'GET', url: '/v1/companies?per_page=2' })
    const hit = await app.inject({ method: 'GET', url: '/v1/companies?per_page=2' })
    process.env.CACHE_TTL_MS = '0'
    invalidateCatalogCache()
    assert.equal(miss.headers['x-cache'], 'MISS')
    assert.equal(hit.headers['x-cache'], 'HIT')
    assert.equal(miss.body, hit.body)
    const body = hit.json() as { items: unknown[]; total: number }
    assert.equal(Array.isArray(body.items), true)
    assert.equal(typeof body.total, 'number')
    assertNoLeak(hit.body, 'cache hit')
  })
})
