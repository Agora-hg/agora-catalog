import { companies, requestCompanies, requests, type Db } from '@agora/db'

/** 4 заявки + 10 request_companies с известными статусами. */
export const FUNNEL_EXPECTED = {
  requests: 4,
  contacts: 8,
  answered: 5,
  interested: 4,
  connected: 2,
} as const

const RC_STATUSES = [
  'selected',
  'selected',
  'contacted',
  'contacted',
  'no_answer',
  'interested',
  'interested',
  'not_interested',
  'connected',
  'connected',
] as const

export const PII = {
  name: 'СекретныйПокупательПетров',
  phone: '+79001112233',
  email: 'secret.buyer.leak@pii.test',
  note: 'внутренняя заметка LEAK_NOTE_999',
} as const

export async function seedFunnelData(db: Db) {
  const reqRows = await db
    .insert(requests)
    .values([
      {
        description: 'Нужны гофрокороба 400x300x200, тираж 3000, с печатью',
        customerName: PII.name,
        customerPhone: PII.phone,
        customerEmail: PII.email,
        internalNote: PII.note,
        deliveryCity: 'Москва',
        quantity: '3000',
        deadline: 'через 2 недели',
        title: 'Гофрокороба тираж',
        status: 'new',
      },
      {
        description: 'Пакеты с логотипом, 10 тысяч штук',
        customerName: 'Другой клиент',
        customerPhone: '+79002223344',
        deliveryCity: 'Москва',
        status: 'processing',
      },
      {
        description: 'Стрейч-плёнка для склада',
        customerEmail: 'sklad@example.test',
        status: 'suppliers_found',
      },
      {
        description: 'Мешки полипропиленовые',
        customerPhone: '+79003334455',
        status: 'cancelled',
      },
    ])
    .returning({ id: requests.id })

  const coRows = await db
    .insert(companies)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        name: `Поставщик ${i + 1}`,
        slug: `funnel-co-${i + 1}`,
        city: 'Москва',
        phone: `+7 495 100-00-0${i + 1}`,
        status: 'active' as const,
        isActive: true,
        isDeleted: false,
      })),
    )
    .returning({ id: companies.id })

  const pairs = RC_STATUSES.map((status, i) => ({
    requestId: reqRows[i % reqRows.length]!.id,
    companyId: coRows[i % coRows.length]!.id,
    status,
  }))

  await db.insert(requestCompanies).values(pairs)
  return { requests: reqRows, companies: coRows, expected: FUNNEL_EXPECTED }
}
