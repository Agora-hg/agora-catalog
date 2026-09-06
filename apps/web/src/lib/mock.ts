import { flattenCategories } from './categories'
import type { CategoryNode, CompanyCard, CompanyDetail, CompanyListResponse } from './types'

/**
 * Фикстуры под docs/API.md. Бэк (TASK-008) пишется параллельно.
 * RAW_YANDEX_DESCRIPTION_DO_NOT_LEAK — ловушка: если description_raw утечёт в HTML, тест падает.
 */
export const RAW_TRAP = 'RAW_YANDEX_DESCRIPTION_DO_NOT_LEAK'

type Seed = { slug: string; name: string; children?: { slug: string; name: string }[] }

const TREE: Seed[] = [
  {
    slug: 'gofrokoroba',
    name: 'Гофрокороба',
    children: [
      { slug: 'chetyrehklapannye', name: 'Четырёхклапанные' },
      { slug: 'samosbornye', name: 'Самосборные' },
      { slug: 'kryshka-dno', name: 'Крышка-дно' },
      { slug: 'pochtovye-korobki', name: 'Почтовые коробки' },
      { slug: 'korobki-s-pechatyu', name: 'Коробки с печатью' },
    ],
  },
  {
    slug: 'gofrolist',
    name: 'Гофролист',
    children: [
      { slug: 'listy', name: 'Листы' },
      { slug: 'prokladki', name: 'Прокладки и заготовки' },
    ],
  },
  {
    slug: 'strech-plenka',
    name: 'Стрейч-плёнка',
    children: [
      { slug: 'ruchnaya', name: 'Ручная' },
      { slug: 'mashinnaya', name: 'Машинная' },
    ],
  },
  {
    slug: 'termousadochnaya-plenka',
    name: 'Термоусадочная плёнка',
    children: [
      { slug: 'pof', name: 'ПОФ' },
      { slug: 'pvh', name: 'ПВХ' },
    ],
  },
  {
    slug: 'vozdushno-puzyrchataya-plenka',
    name: 'Воздушно-пузырчатая плёнка',
    children: [
      { slug: 'vpp-rulon', name: 'Рулоны' },
      { slug: 'vpp-pakety', name: 'Пакеты из ВПП' },
    ],
  },
  {
    slug: 'vspenennyy-polietilen',
    name: 'Вспененный полиэтилен',
    children: [
      { slug: 'npe-rulon', name: 'Рулон и лист' },
      { slug: 'npe-profil', name: 'Профиль' },
    ],
  },
  {
    slug: 'skotch',
    name: 'Упаковочный скотч',
    children: [
      { slug: 'skotch-ruchnoy', name: 'Ручной' },
      { slug: 'skotch-s-logotipom', name: 'С логотипом' },
    ],
  },
  {
    slug: 'strepping',
    name: 'Стреппинг-лента',
    children: [
      { slug: 'strepping-pp', name: 'Полипропиленовая' },
      { slug: 'strepping-pet', name: 'ПЭТ' },
    ],
  },
  {
    slug: 'kurerskie-i-seyf-pakety',
    name: 'Курьерские и сейф-пакеты',
    children: [
      { slug: 'kurerskie', name: 'Курьерские пакеты' },
      { slug: 'seyf-pakety', name: 'Сейф-пакеты' },
    ],
  },
  {
    slug: 'zip-lock',
    name: 'Zip-lock пакеты',
    children: [{ slug: 'zip-struna', name: 'С замком-струной' }],
  },
  {
    slug: 'napolniteli',
    name: 'Наполнители',
    children: [{ slug: 'napolnitel-bumazhnyy', name: 'Бумажный' }],
  },
  {
    slug: 'termoetiketki',
    name: 'Термоэтикетки',
    children: [{ slug: 'etiketki-s-pechatyu', name: 'С печатью' }],
  },
  {
    slug: 'pallety',
    name: 'Паллеты',
    children: [
      { slug: 'pallety-derevo', name: 'Деревянные' },
      { slug: 'pallety-plastik', name: 'Пластиковые' },
    ],
  },
  {
    slug: 'plastikovaya-tara',
    name: 'Пластиковая тара',
    children: [
      { slug: 'kontejnery-dlya-edy', name: 'Контейнеры для еды' },
      { slug: 'banki-flakony', name: 'Банки и флаконы' },
    ],
  },
  {
    slug: 'polietilenovye-pakety',
    name: 'Полиэтиленовые пакеты',
    children: [
      { slug: 'pakety-majka', name: 'Майка' },
      { slug: 'pakety-s-printom', name: 'С принтом' },
    ],
  },
  {
    slug: 'bumazhnye-pakety',
    name: 'Бумажные пакеты',
    children: [
      { slug: 'kraft-pakety', name: 'Крафтовые' },
      { slug: 'bumazhnye-s-logotipom', name: 'С логотипом' },
    ],
  },
  { slug: 'steklyannaya-tara', name: 'Стеклянная тара', children: [{ slug: 'butylki', name: 'Бутылки' }] },
  { slug: 'derevyannaya-tara', name: 'Деревянная тара', children: [{ slug: 'yashchiki', name: 'Ящики' }] },
  {
    slug: 'podarochnaya-upakovka',
    name: 'Подарочная упаковка',
    children: [{ slug: 'podarochnye-korobki', name: 'Подарочные коробки' }],
  },
  { slug: 'odnorazovaya-posuda', name: 'Одноразовая посуда', children: [{ slug: 'stakany', name: 'Стаканы' }] },
  {
    slug: 'meshki',
    name: 'Мешки',
    children: [
      { slug: 'meshki-pp', name: 'Полипропиленовые' },
      { slug: 'big-begi', name: 'Биг-бэги' },
    ],
  },
  { slug: 'upakovochnoe-oborudovanie', name: 'Упаковочное оборудование' },
]

function withSeo(seed: Seed, parentName?: string): CategoryNode {
  const inMoscow = parentName
    ? `${seed.name} в Москве — ${parentName.toLowerCase()}`
    : `${seed.name} в Москве — поставщики, каталог`
  const desc = parentName
    ? `${seed.name} от проверенных поставщиков в Москве. Категория: ${parentName}. Заявка без регистрации.`
    : `Проверенные поставщики: ${seed.name.toLowerCase()} в Москве. Каталог Агора — заявка без регистрации.`
  return {
    slug: seed.slug,
    name: seed.name,
    seo_title: inMoscow,
    seo_description: desc,
    children: seed.children?.map((ch) => withSeo(ch, seed.name)),
  }
}

export const MOCK_CATEGORIES: CategoryNode[] = TREE.map((c) => withSeo(c))

const today = () => new Date().toISOString().slice(0, 10)

function card(partial: Omit<CompanyCard, 'checked_at' | 'city'> & { city?: string }): CompanyCard {
  return {
    city: 'Москва',
    checked_at: today(),
    ...partial,
  }
}

export const MOCK_CARDS: CompanyCard[] = [
  card({
    slug: 'alinapak',
    name: 'АлинаПак',
    address: 'Москва, ул. Такая-то, 5',
    description: 'Производим четырёхклапанные гофрокороба и коробки с печатью для интернет-магазинов.',
    categories: [{ slug: 'gofrokoroba', name: 'Гофрокороба' }],
    products_tags: ['Четырёхклапанные', 'С печатью'],
    website: 'https://alinapak.ru',
    is_verified: true,
  }),
  card({
    slug: 'severpak',
    name: 'СеверПак',
    address: 'Москва, Варшавское шоссе, 125',
    description: 'Гофролист, четырёхклапанные короба и стретч-плёнка. Отгрузка со склада в Москве.',
    categories: [
      { slug: 'gofrokoroba', name: 'Гофрокороба' },
      { slug: 'gofrolist', name: 'Гофролист' },
      { slug: 'strech-plenka', name: 'Стрейч-плёнка' },
    ],
    products_tags: ['Четырёхклапанные', 'Ручная стрейч-плёнка'],
    website: 'https://severpak.example',
    is_verified: true,
  }),
  card({
    slug: 'kraftpak',
    name: 'КрафтПак',
    address: 'Москва, ул. Электродная, 12',
    description: 'Бумажные и крафтовые пакеты с логотипом, почтовые коробки, тираж от небольшой партии.',
    categories: [
      { slug: 'bumazhnye-pakety', name: 'Бумажные пакеты' },
      { slug: 'gofrokoroba', name: 'Гофрокороба' },
    ],
    products_tags: ['Крафтовые', 'С логотипом', 'Почтовые коробки'],
    website: 'https://kraftpak.example',
    is_verified: false,
  }),
  card({
    slug: 'upakregion',
    name: 'УпакРегион',
    address: 'Москва, Каширское шоссе, 3с2',
    description: 'Стрейч-плёнка, скотч с логотипом и воздушно-пузырчатая плёнка для складов и производства.',
    categories: [
      { slug: 'strech-plenka', name: 'Стрейч-плёнка' },
      { slug: 'skotch', name: 'Упаковочный скотч' },
      { slug: 'vozdushno-puzyrchataya-plenka', name: 'Воздушно-пузырчатая плёнка' },
    ],
    products_tags: ['Ручная', 'С логотипом'],
    website: null,
    is_verified: false,
  }),
  card({
    slug: 'palletprom',
    name: 'ПаллетПром',
    address: 'Москва, ул. Складочная, 1',
    description: 'Деревянные паллеты и полипропиленовые мешки. Поставки по Москве, работаем с юрлицами.',
    categories: [
      { slug: 'pallety', name: 'Паллеты' },
      { slug: 'meshki', name: 'Мешки' },
    ],
    products_tags: ['Деревянные', 'Полипропиленовые'],
    website: 'https://palletprom.example',
    is_verified: true,
  }),
  card({
    slug: 'ecoroll',
    name: 'ЭкоРолл',
    address: 'Москва, проспект Мира, 101',
    description: 'Термоусадочная плёнка ПОФ и ПВХ, термоэтикетки с печатью для пищевых производств.',
    categories: [
      { slug: 'termousadochnaya-plenka', name: 'Термоусадочная плёнка' },
      { slug: 'termoetiketki', name: 'Термоэтикетки' },
    ],
    products_tags: ['ПОФ', 'С печатью'],
    website: 'https://ecoroll.example',
    is_verified: false,
  }),
]

const DETAILS: Record<string, Omit<CompanyDetail, keyof CompanyCard>> = {
  alinapak: {
    legal_name: 'ООО «АлинаПак»',
    inn: '7712345678',
    ogrn: '1027700132195',
    kpp: '771201001',
    okved: '17.21 Производство гофрированной бумаги и картона',
    egrul_status: 'ACTIVE',
    phone: '+7 495 123-45-67',
    email: 'hidden-should-not-be-required@alinapak.ru',
    lat: 55.75,
    lon: 37.62,
    hours_raw: 'пн–пт 09:00–18:00',
    sources: [{ source_type: 'dadata', checked_at: today() }],
  },
  severpak: {
    legal_name: 'ООО «СеверПак»',
    inn: '7728123456',
    ogrn: '1037700082341',
    kpp: '772801001',
    okved: '17.21',
    egrul_status: 'ACTIVE',
    phone: '+7 495 222-33-44',
    email: null,
    lat: 55.61,
    lon: 37.62,
    hours_raw: 'пн–сб 08:00–20:00',
    sources: [{ source_type: 'yandex_maps', checked_at: today() }],
  },
  kraftpak: {
    legal_name: 'ООО «КрафтПак»',
    inn: '7703123456',
    ogrn: '1047700111223',
    kpp: '770301001',
    okved: '17.29',
    egrul_status: 'ACTIVE',
    phone: '+7 495 555-01-01',
    email: null,
    lat: 55.75,
    lon: 37.7,
    hours_raw: 'пн–пт 10:00–19:00',
    sources: [{ source_type: 'manual', checked_at: today() }],
  },
  upakregion: {
    legal_name: 'ООО «УпакРегион»',
    inn: '7725456789',
    ogrn: '1057700222334',
    kpp: '772501001',
    okved: '22.21',
    egrul_status: 'ACTIVE',
    phone: '+7 495 700-10-10',
    email: null,
    lat: 55.64,
    lon: 37.67,
    hours_raw: 'пн–пт 09:00–17:00',
    sources: [{ source_type: 'yandex_maps', checked_at: today() }],
  },
  palletprom: {
    legal_name: 'ООО «ПаллетПром»',
    inn: '7711987654',
    ogrn: '1067700333445',
    kpp: '771101001',
    okved: '16.24',
    egrul_status: 'ACTIVE',
    phone: '+7 495 321-00-00',
    email: null,
    lat: 55.8,
    lon: 37.59,
    hours_raw: 'пн–пт 08:00–18:00',
    sources: [{ source_type: 'dadata', checked_at: today() }],
  },
  ecoroll: {
    legal_name: 'ООО «ЭкоРолл»',
    inn: '7709876543',
    ogrn: '1077700444556',
    kpp: '770901001',
    okved: '22.22',
    egrul_status: 'ACTIVE',
    phone: '+7 495 404-40-40',
    email: null,
    lat: 55.78,
    lon: 37.64,
    hours_raw: 'пн–пт 09:00–18:00',
    sources: [{ source_type: 'dadata', checked_at: today() }],
  },
}

/** Не отдаётся ни одним публичным методом мока. */
export const MOCK_DELETED_SLUG = 'deleted-firma'

export function mockCompany(slug: string): CompanyDetail | null {
  if (slug === MOCK_DELETED_SLUG) return null
  const base = MOCK_CARDS.find((c) => c.slug === slug)
  const extra = DETAILS[slug]
  if (!base || !extra) return null
  return { ...base, ...extra }
}

export function mockCategories(): CategoryNode[] {
  return MOCK_CATEGORIES
}

export function mockCompanies(params: {
  category?: string
  city?: string
  q?: string
  page?: number
  per_page?: number
  sort?: string
}): CompanyListResponse {
  const perPage = params.per_page ?? 24
  const page = params.page ?? 1
  const slugs = new Set(flattenCategories(MOCK_CATEGORIES).map((c) => c.slug))
  let items = MOCK_CARDS.slice()

  if (params.category && slugs.has(params.category)) {
    const node = flattenCategories(MOCK_CATEGORIES).find((n) => n.slug === params.category)
    const childSlugs = new Set((node?.children ?? []).map((c) => c.slug))
    items = items.filter((c) => {
      if (c.categories.some((cat) => cat.slug === params.category)) return true
      if (c.categories.some((cat) => childSlugs.has(cat.slug))) return true
      if (!node) return false
      const hay = `${c.products_tags.join(' ')} ${c.description ?? ''}`.toLowerCase()
      return hay.includes(node.name.toLowerCase())
    })
  }

  if (params.city === 'moskva' || params.city === 'Москва') {
    items = items.filter((c) => c.city === 'Москва')
  }

  if (params.q) {
    const q = params.q.toLowerCase()
    items = items.filter((c) => {
      const hay = `${c.name} ${c.description ?? ''} ${c.products_tags.join(' ')} ${c.categories.map((x) => x.name).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }

  if (params.sort === 'name') {
    items = items.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  const total = items.length
  const start = (page - 1) * perPage
  return {
    items: items.slice(start, start + perPage),
    total,
    page,
    per_page: perPage,
  }
}

export function mockGet(pathWithQuery: string): unknown {
  const url = new URL(pathWithQuery, 'http://mock.local')
  const path = url.pathname.replace(/\/$/, '') || '/'
  const q = url.searchParams

  if (path === '/categories') return mockCategories()

  const companyMatch = /^\/companies\/([^/]+)$/.exec(path)
  if (companyMatch) return mockCompany(decodeURIComponent(companyMatch[1] ?? ''))

  const catCompanies = /^\/categories\/([^/]+)\/companies$/.exec(path)
  if (catCompanies) {
    return mockCompanies({
      category: decodeURIComponent(catCompanies[1] ?? ''),
      page: Number(q.get('page') ?? '1'),
      per_page: Number(q.get('per_page') ?? '24'),
      sort: q.get('sort') ?? undefined,
    })
  }

  if (path === '/companies' || path === '/search') {
    return mockCompanies({
      category: q.get('category') ?? undefined,
      city: q.get('city') ?? undefined,
      q: q.get('q') ?? undefined,
      page: Number(q.get('page') ?? '1'),
      per_page: Number(q.get('per_page') ?? '24'),
      sort: q.get('sort') ?? undefined,
    })
  }

  throw new Error(`mock: unknown path ${pathWithQuery}`)
}
