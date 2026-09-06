import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { companyClaims, requestCompanies, requests, supplierResponses } from '@agora/db'
import { eq } from 'drizzle-orm'
import { getFunnel } from '../admin/funnel.ts'
import { FUNNEL_EXPECTED, PII, seedFunnelData } from '../scripts/funnel-fixture.ts'
import {
  buildTestApp,
  loginCookie,
  oldForm,
  openTestDb,
  resetDb,
  seedAdmin,
  seedCompany,
} from './helpers.ts'

const { db, pool } = await openTestDb()
const { app, mailQueue, transport, limiter } = await buildTestApp(db)

before(async () => {
  await resetDb(db)
})

beforeEach(async () => {
  await resetDb(db)
  await seedAdmin(db)
  transport.reset()
  transport.failWith = new Error('SMTP down')
  mailQueue.reset()
  limiter.reset()
})

after(async () => {
  await app.close()
  await pool.end()
})

const LEAK_TOKENS = [PII.name, PII.phone, PII.email, PII.note, 'customer_name', 'customer_phone', 'customer_email', 'internal_note', 'customerName', 'customerPhone', 'customerEmail', 'internalNote']

describe('POST /v1/requests', () => {
  it('создаёт заявку по JSON: description + телефон', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
      payload: {
        description: 'Нужны гофрокороба 400x300x200',
        customer_phone: '+79001234567',
        customer_name: 'Иван',
        ...oldForm(),
      },
    })
    assert.equal(res.statusCode, 200)
    const body = JSON.parse(res.body) as { id: string }
    assert.match(body.id, /^[0-9a-f-]{36}$/)
    const [row] = await db.select().from(requests).where(eq(requests.id, body.id))
    assert.ok(row)
    assert.equal(row.description, 'Нужны гофрокороба 400x300x200')
    assert.equal(row.customerPhone, '+79001234567')
    assert.equal(row.status, 'new')
  })

  it('принимает application/x-www-form-urlencoded как фронт без JS', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'text/html',
        'x-forwarded-for': '10.0.0.2',
      },
      payload: new URLSearchParams({
        description: 'Пакеты с логотипом',
        customer_email: 'buyer@example.test',
        customer_name: 'Оля',
        quantity: '10000',
        delivery_city: 'Москва',
        form_started_at: String(Date.now() - 10_000),
      }).toString(),
    })
    assert.equal(res.statusCode, 200)
    assert.match(res.body, /Заявка отправлена/)
    const rows = await db.select().from(requests)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.customerEmail, 'buyer@example.test')
  })

  it('без description — 400, без телефона и почты — 400', async () => {
    const noDesc = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.3' },
      payload: { customer_phone: '+7900', ...oldForm() },
    })
    assert.equal(noDesc.statusCode, 400)

    const noContact = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.4' },
      payload: { description: 'нужна плёнка', ...oldForm() },
    })
    assert.equal(noContact.statusCode, 400)
    const rows = await db.select().from(requests)
    assert.equal(rows.length, 0)
  })

  it('SMTP выключен: заявка в базе, письмо в очереди', async () => {
    transport.failWith = new Error('SMTP down')
    const res = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.5' },
      payload: {
        description: 'Стрейч для паллет',
        customer_email: 'a@b.test',
        ...oldForm(),
      },
    })
    assert.equal(res.statusCode, 200)
    const { id } = JSON.parse(res.body) as { id: string }
    const [row] = await db.select().from(requests).where(eq(requests.id, id))
    assert.ok(row)
    assert.equal(mailQueue.pending().length, 1)
    assert.equal(mailQueue.pending()[0]!.meta?.requestId, id)
    assert.match(mailQueue.pending()[0]!.text, /Стрейч для паллет/)
    assert.equal(transport.sent.length, 0)

    const once = await mailQueue.processDue()
    assert.equal(once.sent, 0)
    assert.ok(once.retried + once.failed >= 1)
    assert.equal(mailQueue.pending().length, 1)
    const still = await db.select().from(requests).where(eq(requests.id, id))
    assert.equal(still.length, 1)
  })
})

describe('антиспам', () => {
  it('honeypot fax не создаёт заявку, отвечает как успех', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.1.1' },
      payload: {
        description: 'спам',
        customer_phone: '+7900',
        fax: 'я бот',
        ...oldForm(),
      },
    })
    assert.equal(res.statusCode, 200)
    JSON.parse(res.body)
    const rows = await db.select().from(requests)
    assert.equal(rows.length, 0)
    assert.equal(mailQueue.pending().length, 0)
  })

  it('слишком быстрая форма — 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.1.2' },
      payload: {
        description: 'гофрокороба',
        customer_phone: '+7900',
        form_started_at: Date.now() - 200,
      },
    })
    assert.equal(res.statusCode, 400)
    assert.match(res.body, /быстро/)
    const rows = await db.select().from(requests)
    assert.equal(rows.length, 0)
  })

  it('без form_started_at заявка принимается (нативная форма TASK-012)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '10.0.1.3' },
      payload: new URLSearchParams({
        description: 'короба без таймера',
        customer_phone: '+79005556677',
      }).toString(),
    })
    assert.equal(res.statusCode, 200)
    const rows = await db.select().from(requests)
    assert.equal(rows.length, 1)
  })

  it('rate limit по IP — 429', async () => {
    const ip = '10.0.1.9'
    for (let i = 0; i < 8; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        payload: { description: `заявка ${i}`, customer_phone: `+7900000000${i}`, ...oldForm() },
      })
      assert.equal(res.statusCode, 200, `ok ${i}`)
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      payload: { description: 'лишняя', customer_phone: '+79009999999', ...oldForm() },
    })
    assert.equal(blocked.statusCode, 429)
    const other = await app.inject({
      method: 'POST',
      url: '/v1/requests',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.1.10' },
      payload: { description: 'другой ip', customer_phone: '+79001111111', ...oldForm() },
    })
    assert.equal(other.statusCode, 200)
  })
})

describe('GET /v1/requests/public', () => {
  it('в сыром ответе нет ПД: ни имени, ни телефона, ни email, ни внутренней заметки', async () => {
    const [row] = await db
      .insert(requests)
      .values({
        title: 'Гофрокороба тираж',
        description: 'Нужны гофрокороба 400x300x200, тираж 3000, с печатью',
        quantity: '3000',
        deliveryCity: 'Москва',
        deadline: 'через 2 недели',
        customerName: PII.name,
        customerPhone: PII.phone,
        customerEmail: PII.email,
        internalNote: PII.note,
        status: 'new',
      })
      .returning()
    assert.ok(row)

    const res = await app.inject({ method: 'GET', url: '/v1/requests/public' })
    assert.equal(res.statusCode, 200)
    const raw = res.body
    for (const token of LEAK_TOKENS) {
      assert.equal(raw.includes(token), false, `утечка ${token} в сыром ответе: ${raw}`)
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>[]
    assert.equal(parsed.length, 1)
    assert.deepEqual(Object.keys(parsed[0]!).sort(), [
      'created_at',
      'deadline',
      'delivery_city',
      'description',
      'id',
      'quantity',
      'title',
    ])
    assert.equal(parsed[0]!.description, 'Нужны гофрокороба 400x300x200, тираж 3000, с печатью')
    assert.equal(parsed[0]!.id, row.id)
  })

  it('cancelled не попадает в публичный список', async () => {
    await db.insert(requests).values({
      description: 'отменённая заявка видна не должна',
      customerPhone: '+7900',
      status: 'cancelled',
    })
    const res = await app.inject({ method: 'GET', url: '/v1/requests/public' })
    assert.doesNotMatch(res.body, /отменённая заявка/)
  })
})

describe('отклики и обращения', () => {
  it('POST /v1/requests/:id/responses', async () => {
    const [reqRow] = await db
      .insert(requests)
      .values({ description: 'нужна плёнка', customerPhone: '+7900' })
      .returning()
    const res = await app.inject({
      method: 'POST',
      url: `/v1/requests/${reqRow!.id}/responses`,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.2.1' },
      payload: {
        company_name: 'АлинаПак',
        name: 'Пётр',
        phone: '+74951230000',
        message: 'Можем поставить на следующей неделе',
        ...oldForm(),
      },
    })
    assert.equal(res.statusCode, 200)
    const { id } = JSON.parse(res.body) as { id: string }
    const [row] = await db.select().from(supplierResponses).where(eq(supplierResponses.id, id))
    assert.equal(row?.requestId, reqRow!.id)
    assert.equal(row?.message, 'Можем поставить на следующей неделе')
  })

  it('POST /v1/companies/:slug/claims JSON и urlencoded', async () => {
    await seedCompany(db, { name: 'АлинаПак', slug: 'alinapak', phone: '+7495' })
    const json = await app.inject({
      method: 'POST',
      url: '/v1/companies/alinapak/claims',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.2.2' },
      payload: {
        type: 'update',
        name: 'Мария',
        phone: '+79001230000',
        message: 'Неверный адрес',
        ...oldForm(),
      },
    })
    assert.equal(json.statusCode, 200)
    const form = await app.inject({
      method: 'POST',
      url: '/v1/companies/alinapak/claims',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '10.0.2.3' },
      payload: new URLSearchParams({
        type: 'verify',
        name: 'Игорь',
        email: 'igor@alinapak.test',
        message: 'Это наша карточка',
        form_started_at: String(Date.now() - 8000),
      }).toString(),
    })
    assert.equal(form.statusCode, 200)
    const rows = await db.select().from(companyClaims)
    assert.equal(rows.length, 2)
    assert.deepEqual(rows.map((r) => r.type).sort(), ['update', 'verify'])

    const missing = await app.inject({
      method: 'POST',
      url: '/v1/companies/no-such/claims',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.2.4' },
      payload: { type: 'update', phone: '+7900', message: 'x', ...oldForm() },
    })
    assert.equal(missing.statusCode, 404)
  })
})

describe('операторская панель заявок', () => {
  it('без сессии 401, со сессией — список с ПД', async () => {
    await db.insert(requests).values({
      description: 'нужны короба',
      customerName: PII.name,
      customerPhone: PII.phone,
      customerEmail: PII.email,
      internalNote: PII.note,
    })
    const anon = await app.inject({
      method: 'GET',
      url: '/admin/requests',
      headers: { accept: 'application/json' },
    })
    assert.equal(anon.statusCode, 401)

    const cookie = await loginCookie(app)
    const res = await app.inject({
      method: 'GET',
      url: '/admin/requests',
      headers: { accept: 'application/json', cookie },
    })
    assert.equal(res.statusCode, 200)
    assert.match(res.body, new RegExp(PII.name))
    assert.match(res.body, new RegExp(PII.phone.replace('+', '\\+')))
    assert.match(res.body, new RegExp(PII.email.replace('.', '\\.')))
  })

  it('подбор компаний, смена статусов контакта и заявки', async () => {
    const cookie = await loginCookie(app)
    const [reqRow] = await db
      .insert(requests)
      .values({ description: 'тираж коробов', customerPhone: '+7900', status: 'new' })
      .returning()
    const co = await seedCompany(db, { name: 'ПакМир', slug: 'pakmir', phone: '+74951112233' })

    const add = await app.inject({
      method: 'POST',
      url: `/admin/requests/${reqRow!.id}/companies`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { company_ids: [co.id] },
    })
    assert.equal(add.statusCode, 200)
    const [rc] = await db.select().from(requestCompanies)
    assert.equal(rc?.status, 'selected')
    const [afterAdd] = await db.select().from(requests).where(eq(requests.id, reqRow!.id))
    assert.equal(afterAdd?.status, 'suppliers_found')

    const contacted = await app.inject({
      method: 'PATCH',
      url: `/admin/request-companies/${rc!.id}`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { status: 'contacted', comment: 'позвонил, ждут КП' },
    })
    assert.equal(contacted.statusCode, 200)
    const body = JSON.parse(contacted.body) as { status: string; comment: string; sent_at: string }
    assert.equal(body.status, 'contacted')
    assert.equal(body.comment, 'позвонил, ждут КП')
    assert.ok(body.sent_at)

    const interested = await app.inject({
      method: 'PATCH',
      url: `/admin/request-companies/${rc!.id}`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { status: 'interested' },
    })
    assert.equal(interested.statusCode, 200)
    const [req2] = await db.select().from(requests).where(eq(requests.id, reqRow!.id))
    assert.equal(req2?.status, 'supplier_interested')

    const complete = await app.inject({
      method: 'PATCH',
      url: `/admin/requests/${reqRow!.id}`,
      headers: { 'content-type': 'application/json', cookie },
      payload: { status: 'completed', internal_note: 'свели, закрыли' },
    })
    assert.equal(complete.statusCode, 200)
    const done = JSON.parse(complete.body) as { status: string; internal_note: string }
    assert.equal(done.status, 'completed')
    assert.equal(done.internal_note, 'свели, закрыли')

    const html = await app.inject({
      method: 'GET',
      url: `/admin/requests/${reqRow!.id}`,
      headers: { accept: 'text/html', cookie },
    })
    assert.equal(html.statusCode, 200)
    assert.match(html.body, /ПакМир/)
    assert.match(html.body, /тираж коробов/)
    assert.match(html.body, /Подобрать компанию/)
  })
})

describe('GET /admin/stats/funnel', () => {
  it('на 10 посеянных request_companies числа совпадают с руками', async () => {
    await seedFunnelData(db)
    const sqlFunnel = await getFunnel(db)
    assert.deepEqual(sqlFunnel, { ...FUNNEL_EXPECTED })

    const cookie = await loginCookie(app)
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats/funnel',
      headers: { accept: 'application/json', cookie },
    })
    assert.equal(res.statusCode, 200)
    assert.deepEqual(JSON.parse(res.body), { ...FUNNEL_EXPECTED })

    const html = await app.inject({
      method: 'GET',
      url: '/admin/stats/funnel',
      headers: { accept: 'text/html', cookie },
    })
    assert.match(html.body, />4</)
    assert.match(html.body, />8</)
    assert.match(html.body, />5</)
    assert.match(html.body, /заявок/)
    assert.match(html.body, /дошли до клиента/)
  })
})
