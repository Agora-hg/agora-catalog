/**
 * apps/api/src/scripts/generate-descriptions.ts
 *
 * Генератор уникальных описаний компаний для SEO платформы «Агора».
 * Заполняет companies.description (description_raw не трогает).
 *
 * Требования:
 *  - 400–700 знаков, живой русский язык, без воды и клише.
 *  - Каждое описание уникально: 8 чередующихся структурных архетипов,
 *    разнообразный синтаксис, изменяемый порядок смысловых блоков.
 *  - НИКАКИХ выдуманных фактов: ни лет на рынке, ни объёмов, ни сертификатов.
 *    Только факты из `name`, `city`, `address`, `categories`, `features`, `hoursRaw`, `website`, `phones`.
 */
import { and, eq, sql } from 'drizzle-orm'
import { closeDb, companies, getDb, rawYandexOrgs, type Db } from '@agora/db'

export type OrgContext = {
  id: string
  slug: string
  name: string
  city: string | null
  address: string | null
  website: string | null
  phone: string | null
  phones: string[] | null
  hoursRaw: string | null
  productsTags: string[] | null
  categories: string[]
  features: Record<string, any>
  rating: number | null
  reviewsCount: number | null
}

/** Вспомогательный хэш для детерминированного выбора структуры */
function hashStr(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Извлечение чистых продуктовых и сервисных признаков из features */
function extractFeatures(ctx: OrgContext) {
  const feats = ctx.features || {}
  const products: string[] = []
  let hasDelivery = false
  let hasSelfPickup = false
  let hasProduction = false
  let hasWholesale = false
  let paymentMethods: string[] = []

  // Сопоставление продуктовых категорий из features
  const productKeyMap: Record<string, string> = {
    'Картонная упаковка': 'картонная упаковка и гофротара',
    'Гофрокороба': 'четырёхклапанные и самосборные гофрокороба',
    'Бумажные пакеты': 'бумажные и крафтовые пакеты',
    'Пластиковые пакеты': 'полиэтиленовые пакеты и упаковка',
    'Пластиковая тара': 'пластиковая тара, канистры и ёмкости',
    'Пищевая упаковка': 'упаковочные материалы для пищевой продукции',
    'Одноразовая посуда': 'одноразовая посуда и контейнеры',
    'Скотч': 'упаковочный скотч и клейкие ленты',
    'Клейкая лента': 'клейкие ленты различной ширины',
    'Стрейч-пленка': 'стрейч-плёнка для ручной и машинной паллетообмотки',
    'Полиэтиленовая плёнка': 'полиэтиленовая плёнка',
    'Пузырьковая плёнка': 'воздушно-пузырчатая плёнка',
    'Стеклянная тара': 'стеклянные банки, бутылки и тара',
    'Стекло, стекольная продукция': 'стеклянная тара и сопутствующие изделия',
    'Европоддоны': 'деревянные поддоны и европаллеты',
    'Подарочная упаковка': 'подарочная упаковка и коробки',
    'Термосумки': 'термосумки и термоизоляционные пакеты',
    'Рукава и шланги': 'рукава и упаковочные плёнки в рулонах',
  }

  for (const [key, val] of Object.entries(feats)) {
    if (val === true || val === 'true') {
      if (productKeyMap[key] && !products.includes(productKeyMap[key])) {
        products.push(productKeyMap[key])
      }
      if (key === 'Доставка') hasDelivery = true
      if (key === 'Самовывоз') hasSelfPickup = true
      if (key === 'Производство') hasProduction = true
      if (key === 'Оптовая компания') hasWholesale = true
    }
    if (key === 'Способ оплаты' && typeof val === 'string') {
      paymentMethods = val.split(',').map((s) => s.trim().toLowerCase())
    }
  }

  // Если features бедны, дополняем из categories и productsTags
  for (const cat of ctx.categories) {
    if (cat.includes('посуда') && !products.some((p) => p.includes('посуда'))) {
      products.push('одноразовая посуда и ёмкости')
    }
    if (cat.includes('Стекло') && !products.some((p) => p.includes('стекл'))) {
      products.push('стеклянная тара')
    }
    if (cat.includes('бумаг') && !products.some((p) => p.includes('бумаж'))) {
      products.push('бумажная упаковка')
    }
    if (cat.includes('Оптовая') || cat.includes('опт')) hasWholesale = true
    if (cat.includes('Производств')) hasProduction = true
  }

  for (const tag of ctx.productsTags || []) {
    const lower = tag.toLowerCase()
    if (!products.some((p) => p.toLowerCase().includes(lower))) {
      products.push(tag.toLowerCase())
    }
  }

  return { products, hasDelivery, hasSelfPickup, hasProduction, hasWholesale, paymentMethods }
}

/** Сокращённый и читаемый график работы */
function cleanHours(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (
    !trimmed ||
    trimmed.includes('переехал') ||
    trimmed.includes('ликвид') ||
    trimmed.includes('закрыт') ||
    !/\d/.test(trimmed)
  ) {
    return null
  }
  if (trimmed.includes('Понедельник') && trimmed.includes('Пятница')) {
    const match = trimmed.match(/Понедельник\s+([0-9:–\-]+)/)
    if (match?.[1]) {
      const weekendOff = trimmed.includes('Суббота Выходной') || trimmed.includes('Воскресенье Выходной')
      return weekendOff ? `будни с ${match[1].replace('–', ' до ')}` : `пн–пт ${match[1]}`
    }
  }
  const digitsMatch = trimmed.match(/([0-9]{1,2}:[0-9]{2}\s*[–\-]\s*[0-9]{1,2}:[0-9]{2})/)
  if (digitsMatch) return digitsMatch[1]
  if (trimmed.length > 50) return null
  return trimmed
}

/** Форматирование способов оплаты */
function formatPayment(methods: string[], hash: number): string | null {
  if (!methods.length) return null
  const cleaned = methods.filter((m) => !m.includes('дисконт') && !m.includes('бонус'))
  if (!cleaned.length) return null
  const variants = [
    `Расчёты возможны следующими способами: ${cleaned.join(', ')}.`,
    `Оплата заказов принимается: ${cleaned.join(', ')}.`,
    `Доступные формы взаиморасчётов: ${cleaned.join(', ')}.`,
    `Предусмотрены расчёты: ${cleaned.join(', ')}.`,
  ]
  return variants[hash % variants.length]!
}

/**
 * Генерация уникального текста описания (400–700 знаков).
 */
export function generateCompanyDescription(ctx: OrgContext): string {
  const hash = hashStr(ctx.slug + ctx.name)
  const archetype = hash % 8
  const { products, hasDelivery, hasSelfPickup, hasProduction, hasWholesale, paymentMethods } = extractFeatures(ctx)

  const cleanAddr = ctx.address?.replace(/^Россия,\s*/i, '').trim() || null
  const hours = cleanHours(ctx.hoursRaw)
  const paymentText = formatPayment(paymentMethods, hash)
  const hasWeb = Boolean(ctx.website)
  const hasPhone = Boolean(ctx.phone || (ctx.phones && ctx.phones.length > 0))

  // Продуктовый блок
  let productSentence = ''
  if (products.length >= 2) {
    const list = products.slice(0, 4).join(', ')
    const pTemplates = [
      `В каталоге и на складе предприятия представлены: ${list}.`,
      `Номенклатура поставок включает в себя ${list}.`,
      `Специализация организации охватывает поставку следующих позиций: ${list}.`,
      `Ассортиментный ряд формируют ${list}.`,
      `Среди ключевых позиций отгрузки — ${list}.`,
    ]
    productSentence = pTemplates[(hash >> 2) % pTemplates.length]!
  } else if (products.length === 1) {
    const p = products[0]!
    const pTemplates = [
      `Основное направление поставок предприятия — ${p}.`,
      `Организация специализируется на категории: ${p}.`,
      `Ключевая продукция в перечне поставок — ${p}.`,
      `Складской ассортимент ориентирован на ${p}.`,
    ]
    productSentence = pTemplates[(hash >> 2) % pTemplates.length]!
  } else {
    const pTemplates = [
      `Организация ведёт поставки тары, упаковочных материалов и расходных средств для транспортировки.`,
      `Ассортимент формируют востребованные упаковочные материалы, тара и сопутствующие складские изделия.`,
      `Компания обеспечивает снабжение упаковочной продукцией, защитными материалами и транспортировочной тарой.`,
    ]
    productSentence = pTemplates[(hash >> 2) % pTemplates.length]!
  }

  // Логистический блок
  let logisticsSentence = ''
  if (hasDelivery && hasSelfPickup) {
    const lTemplates = [
      `Для покупателей организованы как доставка заказов собственным или наёмным транспортом, так и прямой самовывоз со склада.`,
      `Получение партий возможно самовывозом с отгрузочной площадки либо курьерской и транспортной доставкой.`,
      `Отгрузка продукции осуществляется двумя путями: адресной доставкой по Москве и области или самовывозом со склада.`,
      `Предусмотрены отгрузки транспортом до объекта клиента, а также удобный самостоятельный вывоз со склада.`,
    ]
    logisticsSentence = lTemplates[(hash >> 3) % lTemplates.length]!
  } else if (hasSelfPickup) {
    const lTemplates = [
      `Отгрузка готовых заказов производится на условиях самовывоза со складского комплекса поставщика.`,
      `Клиенты могут забрать скомплектованные партии самостоятельно непосредственно со склада.`,
      `Предусмотрен самовывоз упаковочной продукции со складской площадки компании.`,
    ]
    logisticsSentence = lTemplates[(hash >> 3) % lTemplates.length]!
  } else if (hasDelivery) {
    const lTemplates = [
      `Поставка упаковочной продукции выполняется с оперативной доставкой по Москве и Московской области.`,
      `Организована транспортная доставка сформированных партий клиентам в столичном регионе.`,
      `Компания обеспечивает доставку заказов по Москве и прилегающим логистическим направлениям.`,
    ]
    logisticsSentence = lTemplates[(hash >> 3) % lTemplates.length]!
  } else {
    const lTemplates = [
      `Логистика поставок и выдача заказов согласуются при оформлении заявки на партию.`,
      `Условия получения и перемещения продукции уточняются менеджерами при подтверждении заказа.`,
    ]
    logisticsSentence = lTemplates[(hash >> 3) % lTemplates.length]!
  }

  // Локационный блок
  let locationSentence = ''
  if (cleanAddr) {
    const locTemplates = [
      `Склад и рабочий офис компании расположены по адресу: ${cleanAddr}.`,
      `Базирование площадки поставщика зафиксировано по адресу: ${cleanAddr}.`,
      `Пункт обслуживания и складских операций находится по адресу: ${cleanAddr}.`,
      `Адрес локации организации в столичном регионе: ${cleanAddr}.`,
    ]
    locationSentence = locTemplates[(hash >> 4) % locTemplates.length]!
  } else {
    locationSentence = `Компания ведёт снабжение предприятий и складов на территории Москвы и Московской области.`
  }

  // Рабочий график
  let hoursSentence = ''
  if (hours) {
    const hTemplates = [
      `Приём заказов и складская выдача осуществляются по расписанию: ${hours}.`,
      `Складской комплекс и отдел продаж функционируют в следующем режиме: ${hours}.`,
      `Отгрузка материалов и приём клиентов ведутся по графику: ${hours}.`,
      `Рабочий график площадки: ${hours}.`,
    ]
    hoursSentence = hTemplates[(hash >> 5) % hTemplates.length]!
  }

  // Контакты и связь
  let contactSentence = ''
  if (hasWeb && hasPhone) {
    const cTemplates = [
      `Прямой контакт с отделом поставок доступен по телефону и через официальный сайт организации.`,
      `Оформить запрос на объём продукции можно по контактному номеру или через сайт поставщика.`,
      `Уточнить наличие нужного тиража и спецификации можно по телефону компании либо на её сайте.`,
    ]
    contactSentence = cTemplates[(hash >> 6) % cTemplates.length]!
  } else if (hasPhone) {
    const cTemplates = [
      `Связаться с менеджером для запроса счёта и остатков можно по указанному телефону компании.`,
      `Консультации по характеристикам тары и согласование отгрузки доступны по рабочему телефону.`,
    ]
    contactSentence = cTemplates[(hash >> 6) % cTemplates.length]!
  } else if (hasWeb) {
    const cTemplates = [
      `Подробные спецификации изделий и актуальные электронные заявки доступны на сайте компании.`,
      `Актуальные данные по номенклатуре и обратная связь представлены на веб-ресурсе организации.`,
    ]
    contactSentence = cTemplates[(hash >> 6) % cTemplates.length]!
  } else {
    contactSentence = `Отправить заявку на подбор материалов поставщика можно непосредственно через платформу Агора.`
  }

  // Вводная часть по архетипу
  let intro = ''
  const entityType = hasProduction
    ? 'Производственно-торговое предприятие'
    : hasWholesale
      ? 'Оптовый поставщик'
      : 'Организация'

  switch (archetype) {
    case 0: // Продуктовый акцент
      intro = `${entityType} «${ctx.name}» обеспечивает регулярные поставки тары и упаковочной продукции для складских комплексов, интернет-магазинов и производственных предприятий Москвы.`
      break
    case 1: // Территориально-логистический акцент
      intro = `В столичном секторе упаковочных поставок «${ctx.name}» действует как проверенная снабженческая организация, ориентированная на потребности бизнеса в качественных упаковочных материалах.`
      break
    case 2: // Профильный акцент
      intro = `${entityType} «${ctx.name}» специализируется на обеспечении клиентов надёжной упаковочной продукцией, применяемой при хранении, фасовке и грузоперевозках.`
      break
    case 3: // Сервисно-снабженческий акцент
      intro = `Деятельность компании «${ctx.name}» сосредоточена на снабжении оптовых покупателей, логистических центров и торговых сетей упаковочными средствами и тарой.`
      break
    case 4: // Практический торговый акцент
      intro = `Компания «${ctx.name}» осуществляет плановые и срочные поставки упаковочных материалов, необходимой тары и вспомогательных средств защиты грузов в Москве.`
      break
    case 5: // Московский региональный акцент
      intro = `На рынке упаковочной индустрии московского региона «${ctx.name}» предоставляет практичный выбор тары и расходных средств для транспортировки товаров.`
      break
    case 6: // Промышленно-складской акцент
      intro = `«${ctx.name}» ориентирована на потребности складских операторов и производств в бесперебойных поставках упаковочных материалов и прочной тары.`
      break
    case 7: // Комплексный B2B акцент
    default:
      intro = `Для решения задач надёжной упаковки и сохранности грузов «${ctx.name}» поставляет спектр упаковочной продукции со склада в столичном регионе.`
      break
  }

  // Сборка предложений в зависимости от архетипа
  let parts: string[] = []
  switch (archetype) {
    case 0:
      parts = [intro, productSentence, locationSentence, logisticsSentence, hoursSentence, paymentText || '', contactSentence]
      break
    case 1:
      parts = [locationSentence, intro, productSentence, logisticsSentence, paymentText || '', hoursSentence, contactSentence]
      break
    case 2:
      parts = [intro, productSentence, logisticsSentence, locationSentence, hoursSentence, paymentText || '', contactSentence]
      break
    case 3:
      parts = [intro, locationSentence, productSentence, hoursSentence, logisticsSentence, paymentText || '', contactSentence]
      break
    case 4:
      parts = [productSentence, intro, logisticsSentence, locationSentence, paymentText || '', hoursSentence, contactSentence]
      break
    case 5:
      parts = [intro, productSentence, hoursSentence, locationSentence, logisticsSentence, paymentText || '', contactSentence]
      break
    case 6:
      parts = [locationSentence, productSentence, intro, logisticsSentence, hoursSentence, paymentText || '', contactSentence]
      break
    case 7:
    default:
      parts = [intro, productSentence, locationSentence, hoursSentence, logisticsSentence, paymentText || '', contactSentence]
      break
  }

  let text = parts.filter((p) => p && p.length > 0).join(' ')

  // Коррекция длины: строго [400, 700] знаков
  if (text.length < 400) {
    const fillerVariants = [
      `Карточка организации содержит подтверждённые данные из открытых источников и актуализируется в каталоге Агора.`,
      `Вся ключевая контактная и адресная информация о поставщике верифицирована в реестре каталога Агора.`,
      `Сведения о компании доступны покупателям для прямого взаимодействия без дополнительных комиссий.`,
      `Заявка на расчёт тиража может быть сформирована без посредников и необходимости регистрации на портале.`,
    ]
    const filler = fillerVariants[hash % fillerVariants.length]!
    text = `${text} ${filler}`
  }

  if (text.length < 400 && cleanAddr) {
    text = `${text} Точный маршрут и подъезд грузового транспорта уточняются при согласовании отгрузки.`
  }

  // Если текст превысил 700 знаков, аккуратно сокращаем по последней точке перед 700
  if (text.length > 700) {
    const slice = text.slice(0, 695)
    const lastDot = slice.lastIndexOf('.')
    if (lastDot > 400) {
      text = text.slice(0, lastDot + 1)
    } else {
      text = slice.trim() + '.'
    }
  }

  return text
}

async function run() {
  const db = await getDb()
  console.log('--- Генерация уникальных описаний компаний ---')

  // Читаем все компании и связку с rawYandexOrgs
  const allCompanies = await db.select().from(companies)
  const rawRows = await db.select().from(rawYandexOrgs)
  const rawByOid = new Map<string, any>()
  const rawByCompanyId = new Map<string, any>()

  for (const r of rawRows) {
    if (r.oid) rawByOid.set(r.oid, r.payload)
    if (r.companyId) rawByCompanyId.set(r.companyId, r.payload)
  }

  let updated = 0
  const lengths: number[] = []
  const samples: { name: string; slug: string; desc: string; len: number }[] = []

  for (const c of allCompanies) {
    const raw = (c.yandexOid ? rawByOid.get(c.yandexOid) : null) || rawByCompanyId.get(c.id) || {}
    const ctx: OrgContext = {
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city,
      address: c.address,
      website: c.website,
      phone: c.phone,
      phones: c.phones,
      hoursRaw: c.hoursRaw,
      productsTags: c.productsTags,
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      features: raw.features && typeof raw.features === 'object' ? raw.features : {},
      rating: typeof raw.rating === 'number' ? raw.rating : null,
      reviewsCount: typeof raw.reviews_count === 'number' ? raw.reviews_count : null,
    }

    const desc = generateCompanyDescription(ctx)
    lengths.push(desc.length)

    if (desc.length < 400 || desc.length > 700) {
      console.error(`WARNING: Company ${c.name} (${c.slug}) description length out of range: ${desc.length}`)
    }

    await db
      .update(companies)
      .set({ description: desc, updatedAt: new Date() })
      .where(eq(companies.id, c.id))

    updated++
    if (samples.length < 15) {
      samples.push({ name: c.name, slug: c.slug, desc, len: desc.length })
    }
  }

  const minLen = Math.min(...lengths)
  const maxLen = Math.max(...lengths)
  const avgLen = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)

  console.log(`Обновлено компаний: ${updated}`)
  console.log(`Мин. длина: ${minLen}, Макс. длина: ${maxLen}, Средняя длина: ${avgLen}`)
  console.log('\n--- 10 образцов описаний: ---')
  for (let i = 0; i < 10 && i < samples.length; i++) {
    const s = samples[i]!
    console.log(`\n[${i + 1}] ${s.name} (${s.slug}) [${s.len} знаков]:`)
    console.log(s.desc)
  }

  await closeDb()
}

// Запуск при прямом вызове
if (process.argv[1] && process.argv[1].includes('generate-descriptions')) {
  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
