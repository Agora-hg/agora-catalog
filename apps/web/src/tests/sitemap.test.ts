import { describe, expect, it } from 'vitest'
import './setup-env'
import { MOCK_DELETED_SLUG } from '@/lib/mock'
import { buildSitemapEntries } from '@/lib/sitemap-data'

describe('sitemap', () => {
  it('отдаёт все категории, посадочные /moskva и живые компании, без удалённых', async () => {
    const entries = await buildSitemapEntries()
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://catalog.example.ru/')
    expect(urls).toContain('https://catalog.example.ru/category/gofrokoroba')
    expect(urls).toContain('https://catalog.example.ru/category/gofrokoroba/moskva')
    expect(urls).toContain('https://catalog.example.ru/category/chetyrehklapannye/moskva')
    expect(urls).toContain('https://catalog.example.ru/company/alinapak')
    expect(urls).toContain('https://catalog.example.ru/company/severpak')
    expect(urls.some((u) => u.includes(MOCK_DELETED_SLUG))).toBe(false)
    const categoryLandings = urls.filter((u) => u.includes('/category/'))
    expect(categoryLandings.length).toBeGreaterThan(40)
  })
})
