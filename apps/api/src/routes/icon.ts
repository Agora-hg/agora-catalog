import { companies } from '@agora/db'
import type { Db } from '@agora/db'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

/**
 * Иконка поставщика: `GET /v1/companies/:slug/icon`.
 *
 * Забираем favicon с сайта самого поставщика — **нашим сервером**, а не браузером
 * посетителя. Если вставить на страницу 24 картинки с 24 чужих доменов, мы
 * сольём IP каждого посетителя всем этим сайтам и поставим скорость каталога
 * в зависимость от их хостинга. Здесь запрос делается один раз, кэшируется,
 * и наружу отдаётся уже с нашего домена.
 *
 * Когда favicon нет (а это будет часто: 108 компаний вообще без сайта, часть
 * сайтов отдаёт заглушку), возвращаем нарисованную монограмму. Важно именно
 * возвращать картинку, а не 404: иначе в вёрстке появится «битое изображение»,
 * что хуже отсутствия логотипа.
 */

type Cached = { body: Buffer; type: string; at: number }

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_BYTES = 200 * 1024
const FETCH_TIMEOUT_MS = 3000
const cache = new Map<string, Cached>()

/** Те же шесть оттенков, что и в вёрстке карточки, чтобы вид не разъезжался. */
const TONES = [
  ['#e0f2fe', '#075985'],
  ['#ecfdf5', '#047857'],
  ['#fef2f2', '#b91c1c'],
  ['#fffbeb', '#b45309'],
  ['#eef2ff', '#4338ca'],
  ['#f1f5f9', '#334155'],
] as const

function monogram(name: string): string {
  const words = name
    .replace(/^(ООО|АО|ЗАО|ИП|ПАО|ТД)\s+/i, '')
    .replace(/[«»"']/g, '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

function toneOf(name: string): (typeof TONES)[number] {
  let sum = 0
  for (const ch of name) sum = (sum + ch.charCodeAt(0)) % 997
  return TONES[sum % TONES.length]!
}

function escapeXml(v: string): string {
  return v.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function monogramSvg(name: string): Buffer {
  const [bg, fg] = toneOf(name)
  const text = escapeXml(monogram(name))
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img">` +
      `<rect width="96" height="96" rx="22" fill="${bg}"/>` +
      `<text x="48" y="49" fill="${fg}" font-family="Inter, system-ui, sans-serif" font-size="38"` +
      ` font-weight="700" text-anchor="middle" dominant-baseline="central">${text}</text>` +
      `</svg>`,
    'utf8',
  )
}

/** Кандидаты в порядке качества: apple-touch-icon обычно крупнее и без обрезки. */
function candidates(website: string): string[] {
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return []
    const origin = url.origin
    return [`${origin}/apple-touch-icon.png`, `${origin}/apple-touch-icon-precomposed.png`, `${origin}/favicon.ico`]
  } catch {
    return []
  }
}

async function fetchIcon(website: string): Promise<Cached | null> {
  for (const href of candidates(website)) {
    try {
      const res = await fetch(href, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'image/*' },
      })
      if (!res.ok) continue
      const type = res.headers.get('content-type') ?? ''
      if (!type.startsWith('image/')) continue
      const buf = Buffer.from(await res.arrayBuffer())
      // Пустой или подозрительно большой файл не берём: часть сайтов отдаёт
      // HTML-заглушку с картиночным content-type.
      if (buf.byteLength < 64 || buf.byteLength > MAX_BYTES) continue
      return { body: buf, type, at: Date.now() }
    } catch {
      // недоступный сайт поставщика — не наша проблема, идём к следующему кандидату
    }
  }
  return null
}

export function registerIconRoute(app: FastifyInstance, db: Db): void {
  app.get<{ Params: { slug: string } }>('/companies/:slug/icon', async (req, reply) => {
    const slug = req.params.slug
    const hit = cache.get(slug)
    if (hit && Date.now() - hit.at < TTL_MS) {
      return reply.type(hit.type).header('cache-control', 'public, max-age=86400').send(hit.body)
    }

    const rows = await db
      .select({ name: companies.name, website: companies.website, isDeleted: companies.isDeleted })
      .from(companies)
      .where(eq(companies.slug, slug))
      .limit(1)

    const row = rows[0]
    if (!row || row.isDeleted) return reply.code(404).send({ error: 'not found' })

    const found = row.website ? await fetchIcon(row.website) : null
    const value: Cached = found ?? { body: monogramSvg(row.name), type: 'image/svg+xml', at: Date.now() }
    cache.set(slug, value)

    return reply.type(value.type).header('cache-control', 'public, max-age=86400').send(value.body)
  })
}
