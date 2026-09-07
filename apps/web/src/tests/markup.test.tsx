import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import './setup-env'
import { ClaimForm } from '@/components/ClaimForm'
import { CompanyCard } from '@/components/CompanyCard'
import { Filters } from '@/components/Filters'
import { RequestForm } from '@/components/RequestForm'
import { MOCK_CARDS, MOCK_CATEGORIES, mockCompany } from '@/lib/mock'
import { formatCheckedAt } from '@/lib/format'

function html(node: ReactElement) {
  return renderToStaticMarkup(node)
}

describe('SSR-разметка карточки', () => {
  it('в сыром HTML есть имя, описание, дата проверки, ссылки Подробнее и Сайт', () => {
    const company = MOCK_CARDS[0]!
    const markup = html(<CompanyCard company={company} />)
    expect(markup).toContain('АлинаПак')
    expect(markup).toContain('Производим четырёхклапанные гофрокороба')
    expect(markup).toContain(`Информация проверена ${formatCheckedAt(company.checked_at)}`)
    expect(markup).toContain('Подробнее')
    expect(markup).toContain('Сайт')
    expect(markup).toContain('/company/alinapak')
    expect(markup).toContain('https://alinapak.ru')
    expect(markup).toContain('Вы представитель компании?')
    expect(markup).toContain('Сообщить об ошибке')
    expect(markup).not.toContain('RAW_YANDEX_DESCRIPTION_DO_NOT_LEAK')
    expect(markup).not.toContain('MOQ')
    expect(markup).not.toContain('description_raw')
  })

  it('мини-карточка на странице компании: ИНН, ОГРН, ОКВЭД, адрес, телефон, часы; почты компании нет', () => {
    const detail = mockCompany('alinapak')!
    const markup = html(<CompanyCard company={detail} detail={detail} expanded />)
    expect(markup).toContain('ИНН')
    expect(markup).toContain('7712345678')
    expect(markup).toContain('ОГРН')
    expect(markup).toContain('ОКВЭД')
    expect(markup).toContain('+7 495 123-45-67')
    expect(markup).toContain('пн–пт 09:00–18:00')
    expect(markup).not.toContain('hidden-should-not-be-required@alinapak.ru')
  })
})

describe('фильтры и форма', () => {
  it('фильтры — категория, тип, город; без MOQ, сроков, доставки и брендирования', () => {
    const markup = html(
      <Filters categories={MOCK_CATEGORIES} categorySlug="gofrokoroba" citySlug="moskva" />,
    )
    expect(markup).toContain('Категория упаковки')
    expect(markup).toContain('Тип продукции')
    expect(markup).toContain('Город')
    expect(markup).toContain('Гофрокороба')
    expect(markup).toContain('Четырёхклапанные')
    expect(markup).toContain('Москва')
    expect(markup).toContain('/category/gofrokoroba/moskva')
    expect(markup).not.toMatch(/MOQ|минимальн(ый|ая) заказ/i)
    expect(markup).not.toContain('Брендирование')
    expect(markup).not.toContain('Доставка')
  })

  it('форма заявки постится в api.<домен>, не на хостинг фронта', () => {
    const markup = html(<RequestForm categorySlug="gofrokoroba" compact />)
    expect(markup).toContain('action="https://api.example.ru/v1/requests"')
    expect(markup).toContain('method="post"')
    expect(markup).toContain('name="description"')
    expect(markup).toContain('name="fax"')
    expect(markup).toContain('Нужна упаковка?')
    expect(markup).not.toContain('stanis.rum')
    expect(markup).not.toContain('mailto:')
  })

  it('форма представителя идёт на /companies/{slug}/claims', () => {
    const markup = html(<ClaimForm slug="alinapak" />)
    expect(markup).toContain('action="https://api.example.ru/v1/companies/alinapak/claims"')
    // На странице компании формулировка полная. Укорочена только строка
    // в карточке списка: там она занимала три ряда и перевешивала содержимое.
    expect(markup).toContain('Вы представитель этой компании?')
  })
})
