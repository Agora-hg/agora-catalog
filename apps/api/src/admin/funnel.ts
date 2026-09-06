import { requestCompanies, requests, type Db } from '@agora/db'
import { count, eq, inArray } from 'drizzle-orm'

/**
 * Воронка по request_companies, пункт 7 спеки:
 * заявок → контактов → ответили → заинтересовались → дошли до клиента.
 *
 * contacts — строки, по которым оператор уже вышел на связь
 * (не просто выбрал в подборе).
 * answered — поставщик дал ответ (да/нет/свели).
 * interested — interested + connected.
 * connected — дошли до клиента.
 */
export type Funnel = {
  requests: number
  contacts: number
  answered: number
  interested: number
  connected: number
}

const CONTACTED = ['contacted', 'no_answer', 'interested', 'not_interested', 'connected'] as const
const ANSWERED = ['interested', 'not_interested', 'connected'] as const
const INTERESTED = ['interested', 'connected'] as const

export async function getFunnel(db: Db): Promise<Funnel> {
  const [reqRow] = await db.select({ n: count() }).from(requests)
  const [contactsRow] = await db
    .select({ n: count() })
    .from(requestCompanies)
    .where(inArray(requestCompanies.status, [...CONTACTED]))
  const [answeredRow] = await db
    .select({ n: count() })
    .from(requestCompanies)
    .where(inArray(requestCompanies.status, [...ANSWERED]))
  const [interestedRow] = await db
    .select({ n: count() })
    .from(requestCompanies)
    .where(inArray(requestCompanies.status, [...INTERESTED]))
  const [connectedRow] = await db
    .select({ n: count() })
    .from(requestCompanies)
    .where(eq(requestCompanies.status, 'connected'))
  return {
    requests: Number(reqRow?.n ?? 0),
    contacts: Number(contactsRow?.n ?? 0),
    answered: Number(answeredRow?.n ?? 0),
    interested: Number(interestedRow?.n ?? 0),
    connected: Number(connectedRow?.n ?? 0),
  }
}
