import { describe, expect, it } from 'vitest'
import './setup-env'
import { MOCK_CATEGORIES } from '@/lib/mock'
import { categoryMeta, companyMeta, requestsMeta } from '@/lib/seo'
import { mockCompany } from '@/lib/mock'

describe('SEO meta', () => {
  it('title и description посадочной берутся из полей категории', () => {
    const cat = MOCK_CATEGORIES[0]!
    const meta = categoryMeta(cat, 'moskva')
    expect(meta.title).toEqual({ absolute: cat.seo_title })
    expect(meta.description).toBe(cat.seo_description)
    expect(meta.alternates).toEqual({ canonical: '/category/gofrokoroba/moskva' })
  })

  it('страница компании каноникал по slug, без внутреннего id', () => {
    const company = mockCompany('alinapak')!
    const meta = companyMeta(company)
    expect(JSON.stringify(meta)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
    expect(meta.alternates).toEqual({ canonical: '/company/alinapak' })
  })

  it('заглушка заявок закрыта от индекса', () => {
    const meta = requestsMeta()
    expect(meta.robots).toEqual({ index: false, follow: false })
  })
})
