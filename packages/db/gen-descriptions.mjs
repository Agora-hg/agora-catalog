/**
 * Генерация описаний компаний для каталога.
 *
 *   WAVESPEED_API_KEY=... node gen-descriptions.mjs --limit 700 --out desc.json
 *
 * На выходе два файла: JSON (читать глазами) и .sql с UPDATE-ами,
 * который заливается в боевую базу через psql на сервере.
 *
 * Модель deepseek/deepseek-v3.2, а НЕ deepseek-v4-flash из конфига основной Агоры:
 * та рассуждающая, съедает весь лимит токенов на reasoning и возвращает пустой
 * текст — проверено, 1499 токенов размышлений и ноль знаков на выходе.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const API = process.env.CATALOG_API ?? 'https://agora-catalog.178.88.115.213.sslip.io/v1'
const KEY = process.env.WAVESPEED_API_KEY
const MODEL = process.env.WAVESPEED_MODEL ?? 'deepseek/deepseek-v3.2'
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 1)
/**
 * Пауза между запросами. У провайдера жёсткий лимит частоты: на 8 потоках он
 * отбил 649 запросов из 689, на 3 потоках с выдержкой прошло лишь 25 из 649.
 * Один поток с паузой медленнее, но доходит до конца.
 */
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 1200)
if (!KEY) throw new Error('нет WAVESPEED_API_KEY')

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const LIMIT = Number(arg('--limit', '20'))
const OUT = arg('--out', 'descriptions.json')

const PROMPT = [
  'Ты пишешь описания поставщиков упаковки для каталога.',
  '',
  'Правила, нарушение любого = брак:',
  '1. Пиши ТОЛЬКО то, что следует из переданных данных. Запрещено придумывать годы работы,',
  '   объёмы производства, число клиентов, сертификаты, «собственное производство»,',
  '   «низкие цены», «индивидуальный подход» — ничего этого в данных нет.',
  '2. СТРОГО 330-520 знаков. Меньше 330 — брак. Три-четыре предложения, деловой русский.',
  '3. Начинай по-разному. Запрещено во всех текстах начинать с названия компании:',
  '   это каталог на сотни карточек, одинаковый зачин превращает его в мусор.',
  '   Меняй конструкцию: от товара, от района, от задачи покупателя.',
  '4. Никакой воды: «динамично развивающаяся», «широкий ассортимент»,',
  '   «команда профессионалов», «на рынке много лет» — запрещено.',
  '5. Не обещай от лица компании сроки, цены и доставку, если этого нет в данных.',
  '6. Без восклицательных знаков и призывов.',
  '7. Не упоминай каталог и площадку: текст про поставщика, а не про нас.',
  '8. Игнорируй всё, что не про товар: парковка, доступность для маломобильных,',
  '   Wi-Fi, способы оплаты, посещение с животными. Покупателю упаковки это не нужно.',
  '9. Пиши о конкретной продукции: не «упаковочные материалы», а какие именно —',
  '   гофрокороба, стрейч-плёнка, zip-пакеты, европоддоны.',
  '10. Не расшифровывай сокращения, если не уверен. Справка: ВПП — воздушно-пузырчатая',
  '    плёнка (НЕ гофрокартон), ПВД и ПНД — виды полиэтилена, БОПП — плёнка для скотча.',
  '11. Слова «широкий спектр», «широкий выбор», «большой ассортимент» тоже запрещены.',
  '12. Верни ТОЛЬКО текст описания, без кавычек, заголовков и markdown.',
].join('\n')

function userMessage(c) {
  const lines = ['Название: ' + c.name]
  if (c.city) lines.push('Город: ' + c.city)
  if (c.address) lines.push('Адрес: ' + c.address)
  const cats = (c.categories ?? []).map((x) => x.name).join(', ')
  if (cats) lines.push('Категории товаров: ' + cats)
  const tags = (c.products_tags ?? []).join(', ')
  if (tags) lines.push('Что есть в наличии: ' + tags)
  return lines.join('\n')
}

async function generateOnce(c, hint) {
  const res = await fetch('https://llm.wavespeed.ai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.85,
      max_tokens: 700,
      messages: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: userMessage(c) + (hint ?? '') },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const data = await res.json()
  if (data.error) throw new Error(JSON.stringify(data.error).slice(0, 200))
  return { text: (data.choices?.[0]?.message?.content ?? '').trim(), usage: data.usage ?? {} }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Повтор с нарастающей паузой на лимит запросов.
 * На параллельности 8 провайдер отбил 649 запросов из 689 подряд — лимит у него
 * жёсткий, и без выдержки прогон просто сгорает.
 */
async function withRetry(fn, attempts = 6) {
  let wait = 2000
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (err) {
      const msg = String(err)
      const limited = msg.includes('rate limit') || msg.includes('429')
      if (!limited || i >= attempts) throw err
      await sleep(wait + Math.random() * 1000)
      wait = Math.min(wait * 2, 30_000)
    }
  }
}

const RETRY_HINT =
  '\n\nПредыдущий вариант вышел слишком коротким. Напиши подробнее, 380-520 знаков, перечисли конкретные товары.'

/**
 * Один повтор, если текст короче нормы. В пробной партии средняя длина вышла
 * 302 знака при заявленных 330+, а самые короткие оказались пустыми по смыслу:
 * «подробности на сайте поставщика».
 */
async function generate(c) {
  const first = await withRetry(() => generateOnce(c))
  if (first.text.length >= 300) return first
  const retry = await withRetry(() => generateOnce(c, RETRY_HINT))
  return {
    text: retry.text.length > first.text.length ? retry.text : first.text,
    usage: {
      prompt_tokens: (first.usage.prompt_tokens ?? 0) + (retry.usage.prompt_tokens ?? 0),
      completion_tokens: (first.usage.completion_tokens ?? 0) + (retry.usage.completion_tokens ?? 0),
      cost: (first.usage.cost ?? 0) + (retry.usage.cost ?? 0),
    },
  }
}

const companies = []
for (let page = 1; companies.length < LIMIT; page++) {
  const res = await fetch(API + '/companies?per_page=100&page=' + page, { signal: AbortSignal.timeout(30_000) })
  const data = await res.json()
  const items = data.items ?? []
  companies.push(...items)
  if (items.length < 100 || companies.length >= (data.total ?? 0)) break
}
companies.length = Math.min(companies.length, LIMIT)
console.log('компаний к обработке: ' + companies.length)

// Возобновление: то, что уже сгенерировано, не переделываем и второй раз не платим.
const results = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')).results ?? []) : []
const done = new Set(results.map((r) => r.slug))
if (done.size) console.log('уже готово с прошлого раза: ' + done.size)
let tokensIn = 0
let tokensOut = 0
let cost = 0
let failed = 0
let cursor = 0

async function worker() {
  for (;;) {
    const c = companies[cursor++]
    if (!c) return
    if (done.has(c.slug)) continue
    try {
      const { text, usage } = await generate(c)
      tokensIn += usage.prompt_tokens ?? 0
      tokensOut += usage.completion_tokens ?? 0
      cost += usage.cost ?? 0
      if (!text) {
        failed++
        continue
      }
      results.push({ slug: c.slug, name: c.name, chars: text.length, text })
      done.add(c.slug)
      await sleep(PAUSE_MS)
      writeFileSync(OUT, JSON.stringify({ model: MODEL, results }, null, 2), 'utf8')
      if (results.length % 50 === 0) process.stdout.write(results.length + ' ')
    } catch (err) {
      failed++
      console.log('ОШИБКА ' + c.name + ': ' + String(err).slice(0, 120))
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
console.log('')

writeFileSync(OUT, JSON.stringify({ model: MODEL, results }, null, 2), 'utf8')

const quote = (v) => "'" + String(v).replace(/'/g, "''") + "'"
const sql = results
  .map(
    (r) =>
      'UPDATE companies SET description = ' + quote(r.text) + ', updated_at = now() WHERE slug = ' + quote(r.slug) + ';',
  )
  .join('\n')
const sqlPath = OUT.replace(/\.json$/, '.sql')
writeFileSync(sqlPath, sql + '\n', 'utf8')

const per = cost / Math.max(results.length, 1)
const avg = Math.round(results.reduce((s, r) => s + r.chars, 0) / Math.max(results.length, 1))
const starts = new Set(results.map((r) => r.text.slice(0, 14).toLowerCase()))
const short = results.filter((r) => r.chars < 300).length

console.log('готово: ' + results.length + ', брак: ' + failed)
console.log('токенов вход ' + tokensIn + ', выход ' + tokensOut)
console.log('стоимость: $' + cost.toFixed(4) + ' (' + (cost * 90).toFixed(1) + ' руб)')
console.log('средняя длина: ' + avg + ' знаков, короче 300 знаков: ' + short)
console.log('разных зачинов: ' + starts.size + ' из ' + results.length)
console.log('файлы: ' + OUT + ' и ' + sqlPath)
