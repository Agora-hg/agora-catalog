import {
  categories,
  companies,
  companyClaims,
  requests,
  supplierResponses,
  type Db,
} from '@agora/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { AppError } from '../errors.ts'
import { asString, isUuid } from '../http.ts'
import { requestMailText } from '../mail/queue.ts'
import type { MailQueue } from '../mail/queue.ts'

const PUBLIC_STATUSES = [
  'new',
  'processing',
  'suppliers_found',
  'sent_to_suppliers',
  'supplier_interested',
] as const

export type PublicRequest = {
  id: string
  title: string | null
  description: string
  delivery_city: string | null
  quantity: string | null
  deadline: string | null
  created_at: string
}

const CLAIM_TYPES = ['update', 'delete', 'verify', 'add_info'] as const
type ClaimType = (typeof CLAIM_TYPES)[number]

function nonempty(value: string): string | null {
  const t = value.trim()
  return t ? t : null
}

function requireContact(phone: string, email: string): void {
  if (!nonempty(phone) && !nonempty(email)) {
    throw new AppError(400, 'Укажите телефон или электронную почту')
  }
}

export async function listPublicRequests(db: Db): Promise<PublicRequest[]> {
  const rows = await db
    .select({
      id: requests.id,
      title: requests.title,
      description: requests.description,
      deliveryCity: requests.deliveryCity,
      quantity: requests.quantity,
      deadline: requests.deadline,
      createdAt: requests.createdAt,
    })
    .from(requests)
    .where(inArray(requests.status, [...PUBLIC_STATUSES]))
    .orderBy(desc(requests.createdAt))
    .limit(100)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    delivery_city: row.deliveryCity,
    quantity: row.quantity,
    deadline: row.deadline,
    created_at: row.createdAt.toISOString(),
  }))
}

export async function createRequest(
  db: Db,
  body: Record<string, unknown>,
  mail: { queue: MailQueue; operatorEmail: string },
): Promise<{ id: string }> {
  const description = asString(body.description).trim()
  if (!description) throw new AppError(400, 'Опишите, какая упаковка нужна')
  const phone = asString(body.customer_phone ?? body.phone)
  const email = asString(body.customer_email ?? body.email)
  requireContact(phone, email)

  let categoryId: string | null = null
  const categoryRaw = asString(body.category_id)
  const slug = asString(body.category_slug)
  if (categoryRaw && isUuid(categoryRaw)) {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryRaw)).limit(1)
    categoryId = cat?.id ?? null
  } else if (slug) {
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1)
    categoryId = cat?.id ?? null
  }

  const [row] = await db
    .insert(requests)
    .values({
      categoryId,
      title: nonempty(asString(body.title)),
      description,
      quantity: nonempty(asString(body.quantity)),
      dimensions: nonempty(asString(body.dimensions)),
      material: nonempty(asString(body.material)),
      branding: nonempty(asString(body.branding)),
      deliveryCity: nonempty(asString(body.delivery_city)),
      deadline: nonempty(asString(body.deadline)),
      customerName: nonempty(asString(body.customer_name)),
      customerPhone: nonempty(phone),
      customerEmail: nonempty(email),
      status: 'new',
    })
    .returning({
      id: requests.id,
      description: requests.description,
      customerName: requests.customerName,
      customerPhone: requests.customerPhone,
      customerEmail: requests.customerEmail,
      quantity: requests.quantity,
      deliveryCity: requests.deliveryCity,
      deadline: requests.deadline,
    })
  if (!row) throw new AppError(500, 'Не удалось сохранить заявку')

  try {
    await mail.queue.enqueue(
      {
        to: mail.operatorEmail,
        subject: `Новая заявка ${row.id}`,
        text: requestMailText({
          id: row.id,
          description: row.description,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          customerEmail: row.customerEmail,
          quantity: row.quantity,
          deliveryCity: row.deliveryCity,
          deadline: row.deadline,
        }),
      },
      { kind: 'request', requestId: row.id },
    )
  } catch {
    // очередь — не часть транзакции заявки; заявка уже в базе
  }

  return { id: row.id }
}

export async function createSupplierResponse(
  db: Db,
  requestId: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  if (!isUuid(requestId)) throw new AppError(404, 'Заявка не найдена')
  const [reqRow] = await db.select({ id: requests.id, status: requests.status }).from(requests).where(eq(requests.id, requestId)).limit(1)
  if (!reqRow) throw new AppError(404, 'Заявка не найдена')
  if (reqRow.status === 'cancelled') throw new AppError(400, 'Заявка отменена')

  const phone = asString(body.phone)
  const email = asString(body.email)
  requireContact(phone, email)
  const message = nonempty(asString(body.message))
  if (!message) throw new AppError(400, 'Напишите сообщение')

  let companyId: string | null = null
  const companyRaw = asString(body.company_id)
  if (companyRaw && isUuid(companyRaw)) {
    const [co] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyRaw)).limit(1)
    companyId = co?.id ?? null
  }

  const [row] = await db
    .insert(supplierResponses)
    .values({
      requestId,
      companyId,
      companyName: nonempty(asString(body.company_name)),
      name: nonempty(asString(body.name)),
      phone: nonempty(phone),
      email: nonempty(email),
      message,
    })
    .returning({ id: supplierResponses.id })
  if (!row) throw new AppError(500, 'Не удалось сохранить отклик')
  return { id: row.id }
}

export async function createClaim(
  db: Db,
  slug: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.slug, slug), eq(companies.isDeleted, false)))
    .limit(1)
  if (!company) throw new AppError(404, 'Компания не найдена')

  const type = asString(body.type) as ClaimType
  if (!(CLAIM_TYPES as readonly string[]).includes(type)) {
    throw new AppError(400, 'Тип обращения: update, delete, verify или add_info')
  }
  const message = nonempty(asString(body.message))
  if (!message) throw new AppError(400, 'Напишите, что исправить или добавить')
  const phone = asString(body.phone)
  const email = asString(body.email)
  requireContact(phone, email)

  const [row] = await db
    .insert(companyClaims)
    .values({
      companyId: company.id,
      type,
      name: nonempty(asString(body.name)),
      position: nonempty(asString(body.position)),
      phone: nonempty(phone),
      email: nonempty(email),
      message,
    })
    .returning({ id: companyClaims.id })
  if (!row) throw new AppError(500, 'Не удалось сохранить обращение')
  return { id: row.id }
}
