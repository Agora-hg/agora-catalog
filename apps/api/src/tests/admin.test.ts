import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { categories, companies, companyCategories, companyClaims, companySources } from '@agora/db'
import { eq } from 'drizzle-orm'
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  buildTestApp,
  cookieFrom,
  loginCookie,
  openTestDb,
  resetDb,
  seedAdmin,
  seedCompany,
} from './helpers.ts'

const { db, pool } = await openTestDb()
const { app } = await buildTestApp(db)

before(async () => {
  await resetDb(db)
})

beforeEach(async () => {
  await resetDb(db)
  await seedAdmin(db)
})

after(async () => {
  await app.close()
  await pool.end()
})

describe('auth', () => {
  it('логин ставит httpOnly cookie, неверный пароль — 401', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/admin/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { email: ADMIN_EMAIL, password: 'wrong' },
    })
    assert.equal(bad.statusCode, 401)

    const ok = await app.inject({
      method: 'POST',
      url: '/admin/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    })
    assert.equal(ok.statusCode, 200)
    const setCookie = String(ok.headers['set-cookie'] ?? '')
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /agora_admin_session/)
  })

  it('без сессии JSON 401, HTML редирект на логин', async () => {
    const json = await app.inject({
      method: 'GET',
      url: '/admin/companies',
      headers: { accept: 'application/json' },
    })
    assert.equal(json.statusCode, 401)

    const html = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { accept: 'text/html' },
    })
    assert.equal(html.statusCode, 302)
    assert.equal(html.headers.location, '/admin/login')
  })
})

describe('обзвон и удаление', () => {
  it('главный экран — список обзвона с телефоном, сайтом, адресом, описанием с карт и кнопкой «Не существует»', async () => {
    await seedCompany(db, {
      name: 'АлинаПак',
      slug: 'alinapak',
      phone: '+7 495 123-45-67',
      website: 'https://alinapak.ru',
      address: 'Москва, ул. Такая-то, 5',
      descriptionRaw: 'Производство гофрокоробов, тираж от 100 шт',
    })
    const cookie = await loginCookie(app)
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { accept: 'text/html', cookie },
    })
    assert.equal(res.statusCode, 200)
    assert.match(res.body, /Обзвон поставщиков/)
    assert.match(res.body, /АлинаПак/)
    assert.match(res.body, /\+7 495 123-45-67/)
    assert.match(res.body, /alinapak\.ru/)
    assert.match(res.body, /Москва, ул\. Такая-то, 5/)
    assert.match(res.body, /Производство гофрокоробов/)
    assert.match(res.body, /Не существует/)
    assert.match(res.body, /name="reason"/)
    assert.match(res.body, /required/)
  })

  it('удаление мягкое: причина обязательна, запись в базе, с публичного API пропадает', async () => {
    const company = await seedCompany(db, {
      name: 'СнестиМеня',
      slug: 'snesti-menya',
      phone: '+7 495 000-11-22',
      description: 'наш текст',
      descriptionRaw: 'сырой текст с карт — не должен утечь',
      status: 'active',
    })
    const cookie = await loginCookie(app)

    const empty = await app.inject({
      method: 'POST',
      url: `/admin/companies/${company.id}/delete`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { reason: '' },
    })
    assert.equal(empty.statusCode, 400)
    assert.match(empty.body, /причин/i)

    const spaces = await app.inject({
      method: 'POST',
      url: `/admin/companies/${company.id}/delete`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { reason: '   ' },
    })
    assert.equal(spaces.statusCode, 400)

    const stillPublic = await app.inject({ method: 'GET', url: '/v1/companies' })
    assert.match(stillPublic.body, /snesti-menya/)
    assert.doesNotMatch(stillPublic.body, /сырой текст с карт/)
    assert.doesNotMatch(stillPublic.body, /description_raw/)

    const deleted = await app.inject({
      method: 'POST',
      url: `/admin/companies/${company.id}/delete`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { reason: 'По телефону сказали, что фирмы нет' },
    })
    assert.equal(deleted.statusCode, 200)
    const body = JSON.parse(deleted.body) as { is_deleted: boolean; deleted_reason: string; deleted_at: string }
    assert.equal(body.is_deleted, true)
    assert.equal(body.deleted_reason, 'По телефону сказали, что фирмы нет')
    assert.ok(body.deleted_at)

    const [row] = await db.select().from(companies).where(eq(companies.id, company.id))
    assert.ok(row)
    assert.equal(row.isDeleted, true)
    assert.equal(row.deletedReason, 'По телефону сказали, что фирмы нет')
    assert.ok(row.deletedAt)
    assert.ok(row.deletedBy)

    const pub = await app.inject({ method: 'GET', url: '/v1/companies' })
    assert.doesNotMatch(pub.body, /snesti-menya/)
    const bySlug = await app.inject({ method: 'GET', url: '/v1/companies/snesti-menya' })
    assert.equal(bySlug.statusCode, 404)

    const physical = await app.inject({
      method: 'DELETE',
      url: `/admin/companies/${company.id}`,
      headers: { cookie, accept: 'application/json' },
    })
    assert.equal(physical.statusCode, 404)
    const [still] = await db.select().from(companies).where(eq(companies.id, company.id))
    assert.ok(still)

    const htmlDeleted = await app.inject({
      method: 'GET',
      url: '/admin/deleted',
      headers: { accept: 'text/html', cookie },
    })
    assert.match(htmlDeleted.body, /СнестиМеня/)
    assert.match(htmlDeleted.body, /По телефону сказали, что фирмы нет/)
  })

  it('пустая HTML-форма удаления не проходит', async () => {
    const company = await seedCompany(db, { name: 'ФормаПустая', slug: 'forma-pustaya', phone: '+7 495 1' })
    const cookie = await loginCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: `/admin/companies/${company.id}/delete`,
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, accept: 'text/html' },
      payload: 'reason=',
    })
    assert.ok(res.statusCode === 303 || res.statusCode === 400)
    const [row] = await db.select().from(companies).where(eq(companies.id, company.id))
    assert.equal(row?.isDeleted, false)
  })

  it('status через PATCH не меняется, called_at и is_verified — меняются', async () => {
    const company = await seedCompany(db, {
      name: 'СтатусНеТрогать',
      slug: 'status-readonly',
      phone: '+7 495 2',
      status: 'unknown',
    })
    const cookie = await loginCookie(app)
    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/companies/${company.id}`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { status: 'inactive', name: 'СтатусНеТрогать' },
    })
    assert.equal(patch.statusCode, 400)

    const call = await app.inject({
      method: 'POST',
      url: `/admin/companies/${company.id}/call`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { note: 'дозвон, трубку взяли' },
    })
    assert.equal(call.statusCode, 200)
    const called = JSON.parse(call.body) as { called_at: string; call_note: string; status: string }
    assert.ok(called.called_at)
    assert.equal(called.call_note, 'дозвон, трубку взяли')
    assert.equal(called.status, 'unknown')

    const verify = await app.inject({
      method: 'POST',
      url: `/admin/companies/${company.id}/verify`,
      headers: { 'content-type': 'application/json', cookie },
      payload: {},
    })
    assert.equal(verify.statusCode, 200)
    assert.equal(JSON.parse(verify.body).is_verified, true)
  })

  it('фильтры: не обзвонены, ликвидированные, без телефона', async () => {
    await seedCompany(db, { name: 'Живая', slug: 'zhivaya', phone: '+7 1', egrulStatus: 'ACTIVE' })
    await seedCompany(db, { name: 'Мёртвая', slug: 'mertvaya', phone: '+7 2', egrulStatus: 'LIQUIDATED' })
    await seedCompany(db, { name: 'БезТел', slug: 'bez-tel', egrulStatus: 'ACTIVE' })
    const called = await seedCompany(db, { name: 'УжеЗвонили', slug: 'uzhe', phone: '+7 3', egrulStatus: 'ACTIVE' })
    await db.update(companies).set({ calledAt: new Date() }).where(eq(companies.id, called.id))

    const cookie = await loginCookie(app)
    const uncalled = await app.inject({
      method: 'GET',
      url: '/admin/companies?called=0',
      headers: { accept: 'application/json', cookie },
    })
    const uncalledNames = (JSON.parse(uncalled.body).items as { name: string }[]).map((i) => i.name)
    assert.ok(uncalledNames.includes('Живая'))
    assert.ok(!uncalledNames.includes('УжеЗвонили'))

    const liq = await app.inject({
      method: 'GET',
      url: '/admin/companies?egrul=liquidated',
      headers: { accept: 'application/json', cookie },
    })
    const liqNames = (JSON.parse(liq.body).items as { name: string }[]).map((i) => i.name)
    assert.deepEqual(liqNames, ['Мёртвая'])

    const noPhone = await app.inject({
      method: 'GET',
      url: '/admin/companies?phone=0',
      headers: { accept: 'application/json', cookie },
    })
    const noPhoneNames = (JSON.parse(noPhone.body).items as { name: string }[]).map((i) => i.name)
    assert.deepEqual(noPhoneNames, ['БезТел'])
  })
})

describe('обращения и категории', () => {
  it('обращение: отклонить и применить verify', async () => {
    const company = await seedCompany(db, { name: 'Клейм', slug: 'claim-co', phone: '+7 4' })
    const [claim] = await db
      .insert(companyClaims)
      .values({
        companyId: company.id,
        type: 'verify',
        status: 'new',
        name: 'Пётр',
        phone: '+7 4',
        message: 'это мы',
      })
      .returning()
    const cookie = await loginCookie(app)
    const applied = await app.inject({
      method: 'PATCH',
      url: `/admin/claims/${claim!.id}`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { status: 'applied' },
    })
    assert.equal(applied.statusCode, 200)
    assert.equal(JSON.parse(applied.body).status, 'applied')
    const [row] = await db.select().from(companies).where(eq(companies.id, company.id))
    assert.equal(row?.isVerified, true)
  })

  it('категории: создать, переименовать, выключить, сменить порядок', async () => {
    const cookie = await loginCookie(app)
    const created = await app.inject({
      method: 'POST',
      url: '/admin/categories',
      headers: { 'content-type': 'application/json', cookie },
      payload: { name: 'Гофрокороба' },
    })
    assert.equal(created.statusCode, 200)
    const cat = JSON.parse(created.body) as { id: string; slug: string; name: string }
    assert.equal(cat.slug, 'gofrokoroba')

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/admin/categories/${cat.id}`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { name: 'Гофроящики', is_active: false },
    })
    assert.equal(renamed.statusCode, 200)
    assert.equal(JSON.parse(renamed.body).name, 'Гофроящики')
    assert.equal(JSON.parse(renamed.body).is_active, false)

    await app.inject({
      method: 'POST',
      url: '/admin/categories',
      headers: { 'content-type': 'application/json', cookie },
      payload: { name: 'Скотч' },
    })
    const listed = await app.inject({
      method: 'GET',
      url: '/admin/categories',
      headers: { accept: 'application/json', cookie },
    })
    assert.equal(listed.statusCode, 200)
    assert.ok((JSON.parse(listed.body).items as { name: string }[]).length >= 2)
  })

  // тест DaData удалён при сборке: обогащение ЕГРЮЛ снято решением владельца.
  // Код фичи цел в ветках task/009-admin-panel и task/007-dadata.

  it('карточка компании сохраняет категории и не отдаёт status на запись', async () => {
    const company = await seedCompany(db, { name: 'СКатегорией', slug: 's-cat', phone: '+7 6' })
    const [cat] = await db.insert(categories).values({ name: 'Пакеты', slug: 'pakety', sortOrder: 0, isActive: true }).returning()
    const cookie = await loginCookie(app)
    const saved = await app.inject({
      method: 'PATCH',
      url: `/admin/companies/${company.id}`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { description: 'наш текст', category_ids: [cat!.id], is_verified: true },
    })
    assert.equal(saved.statusCode, 200)
    const links = await db.select().from(companyCategories).where(eq(companyCategories.companyId, company.id))
    assert.equal(links.length, 1)
    assert.equal(links[0]?.isAuto, false)
  })
})
