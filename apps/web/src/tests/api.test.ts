import { describe, expect, it } from 'vitest'
import './setup-env'
import { fetchAllCategorySlugs, fetchAllCompanySlugs, fetchCategories, fetchCompanies, fetchCompany } from '@/lib/api'
import { MOCK_DELETED_SLUG, RAW_TRAP } from '@/lib/mock'

describe('mock API', () => {
  it('каталог отдаёт карточки без description_raw', async () => {
    const list = await fetchCompanies()
    expect(list.items.length).toBeGreaterThan(0)
    expect(list.items.some((c) => c.slug === 'alinapak')).toBe(true)
    expect(JSON.stringify(list)).not.toContain(RAW_TRAP)
    expect(JSON.stringify(list)).not.toContain('description_raw')
  })

  it('удалённая компания не попадает в список и в карточку', async () => {
    const list = await fetchCompanies()
    expect(list.items.some((c) => c.slug === MOCK_DELETED_SLUG)).toBe(false)
    expect(await fetchCompany(MOCK_DELETED_SLUG)).toBeNull()
  })

  it('поиск по тегу находит компанию', async () => {
    const list = await fetchCompanies({ q: 'пакеты с логотипом' })
    expect(list.items.some((c) => c.slug === 'kraftpak')).toBe(true)
  })

  it('фильтр категории гофрокороба', async () => {
    const list = await fetchCompanies({ category: 'gofrokoroba' })
    expect(list.items.some((c) => c.slug === 'alinapak')).toBe(true)
    expect(list.items.every((c) => c.categories.some((cat) => cat.slug === 'gofrokoroba'))).toBe(true)
  })

  it('sitemap-источники: все живые компании и категории, без удалённых', async () => {
    const companies = await fetchAllCompanySlugs()
    const categories = await fetchAllCategorySlugs()
    expect(companies).toContain('alinapak')
    expect(companies).not.toContain(MOCK_DELETED_SLUG)
    expect(categories).toContain('gofrokoroba')
    expect(categories).toContain('chetyrehklapannye')
    expect((await fetchCategories()).length).toBeGreaterThan(10)
  })

  it('карточка компании содержит ИНН и не светит id', async () => {
    const company = await fetchCompany('alinapak')
    expect(company?.inn).toBe('7712345678')
    expect(company).not.toHaveProperty('id')
  })
})
