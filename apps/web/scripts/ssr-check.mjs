#!/usr/bin/env node
/**
 * Приёмка TASK-012: curl по сырому HTML.
 * Запуск: node scripts/ssr-check.mjs http://localhost:3012
 */
const base = (process.argv[2] || 'http://localhost:3012').replace(/\/$/, '')

async function get(path) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'user-agent': 'agora-ssr-check/1.0' },
  })
  const text = await res.text()
  return { status: res.status, text, path }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function mustContain(html, snippets, path) {
  for (const s of snippets) {
    assert(html.includes(s), `${path}: нет «${s}»`)
  }
}

function mustNotContain(html, snippets, path) {
  for (const s of snippets) {
    assert(!html.includes(s), `${path}: неожиданно есть «${s}»`)
  }
}

const pages = await Promise.all([
  get('/'),
  get('/company/alinapak'),
  get('/category/gofrokoroba/moskva'),
  get('/sitemap.xml'),
  get('/robots.txt'),
  get('/requests'),
])

for (const p of pages) {
  assert(p.status === 200, `${p.path} → ${p.status}`)
  process.stdout.write(`OK ${p.status} ${p.path} (${p.text.length} bytes)\n`)
}

const [home, company, landing, sitemap, robots, requests] = pages

mustContain(
  home.text,
  [
    'АлинаПак',
    'СеверПак',
    'Производим четырёхклапанные гофрокороба',
    'application/ld+json',
    'LocalBusiness',
    'BreadcrumbList',
    'Информация проверена',
    'Нужна упаковка?',
    'Категория упаковки',
    'Тип продукции',
    'Город',
  ],
  '/',
)
mustNotContain(
  home.text,
  ['RAW_YANDEX_DESCRIPTION_DO_NOT_LEAK', 'description_raw', 'stanis.rum@gmail.com'],
  '/',
)
assert(!/MOQ/.test(home.text), '/: в HTML есть MOQ')
assert(!home.text.includes('__NEXT_DATA__') || home.text.includes('АлинаПак'), '/: имя не в HTML')

mustContain(
  company.text,
  [
    'АлинаПак',
    'Производим четырёхклапанные гофрокороба',
    'ИНН',
    '7712345678',
    'ОГРН',
    'ОКВЭД',
    'application/ld+json',
    'LocalBusiness',
    'Organization',
    'BreadcrumbList',
    'Вы представитель этой компании?',
  ],
  '/company/alinapak',
)
mustNotContain(company.text, ['hidden-should-not-be-required@alinapak.ru'], '/company/alinapak')

mustContain(
  landing.text,
  ['Гофрокороба', 'в Москве', 'АлинаПак', 'application/ld+json', 'canonical'],
  '/category/gofrokoroba/moskva',
)

mustContain(
  sitemap.text,
  [
    '/category/gofrokoroba',
    '/category/gofrokoroba/moskva',
    '/company/alinapak',
    '/company/severpak',
  ],
  '/sitemap.xml',
)
const expectedRule =
  process.env.PUBLIC_INDEXABLE === 'true' || process.env.PUBLIC_INDEXABLE === '1' ? 'Allow: /' : 'Disallow: /'
mustContain(robots.text, ['Sitemap:', expectedRule], '/robots.txt')

mustContain(
  requests.text,
  ['Заявок пока нет', 'отправьте описание запроса на почту', 'Нужна упаковка?'],
  '/requests',
)
mustNotContain(requests.text, ['stanis.rum@gmail.com', 'mailto:'], '/requests')

process.stdout.write('\nSSR-check passed\n')
