import { describe, expect, it } from 'vitest'
import './setup-env'
import { MOCK_CARDS, mockCompany } from '@/lib/mock'
import { breadcrumbJsonLd, companyJsonLd, itemListJsonLd } from '@/lib/schema-org'

describe('schema.org', () => {
  it('карточка компании — Organization и LocalBusiness, имя и описание в JSON-LD', () => {
    const company = mockCompany('alinapak')
    expect(company).not.toBeNull()
    const json = companyJsonLd(company!)
    const types = json['@type'] as string[]
    expect(types).toContain('Organization')
    expect(types).toContain('LocalBusiness')
    expect(json.name).toBe('АлинаПак')
    expect(String(json.description)).toContain('гофрокороба')
    expect(json.taxID).toBe('7712345678')
    expect(json['@id']).toBe('https://catalog.example.ru/company/alinapak')
    expect(JSON.stringify(json)).not.toContain('RAW_YANDEX')
  })

  it('список компаний содержит названия в ItemList', () => {
    const json = itemListJsonLd(MOCK_CARDS, '/')
    expect(json['@type']).toBe('ItemList')
    const names = (json.itemListElement as { name: string }[]).map((x) => x.name)
    expect(names).toContain('АлинаПак')
    expect(names).toContain('СеверПак')
    expect(names).toContain('КрафтПак')
  })

  it('хлебные крошки — BreadcrumbList с позициями', () => {
    const json = breadcrumbJsonLd([
      { name: 'Каталог', href: '/' },
      { name: 'Гофрокороба', href: '/category/gofrokoroba' },
      { name: 'Москва', href: '/category/gofrokoroba/moskva' },
    ])
    expect(json['@type']).toBe('BreadcrumbList')
    const els = json.itemListElement as { position: number; name: string; item: string }[]
    expect(els[0]?.position).toBe(1)
    expect(els[2]?.name).toBe('Москва')
    expect(els[2]?.item).toContain('/category/gofrokoroba/moskva')
  })
})
