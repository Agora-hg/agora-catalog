import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  featureTags,
  innFromPayload,
  normalizeInn,
  normalizeOrg,
  normalizePhone,
  normalizeWebsite,
  splitAddress,
  websiteDomain,
} from '../src/import/normalize.ts'

describe('normalizePhone', () => {
  it('converts 8 (495) to E.164', () => {
    assert.equal(normalizePhone('8 (495) 123-45-67'), '+74951234567')
  })
  it('converts +7 with spaces', () => {
    assert.equal(normalizePhone('+7 999 123-45-67'), '+79991234567')
  })
  it('converts 11-digit starting with 7', () => {
    assert.equal(normalizePhone('74959876543'), '+74959876543')
  })
  it('converts 10-digit local', () => {
    assert.equal(normalizePhone('4951234567'), '+74951234567')
  })
  it('returns null for garbage', () => {
    assert.equal(normalizePhone('нет телефона'), null)
    assert.equal(normalizePhone(''), null)
  })
})

describe('normalizeWebsite', () => {
  it('unwraps yandex away redirect and strips slash', () => {
    assert.equal(
      normalizeWebsite('https://yandex.ru/away/?to=https%3A%2F%2Falinapak.ru%2F'),
      'https://alinapak.ru',
    )
  })
  it('strips utm and yclid, upgrades http, drops www for domain', () => {
    const url = normalizeWebsite(
      'http://www.bubblepack.ru/about?utm_source=yandex&yclid=1&keep=1',
    )
    assert.equal(url, 'https://www.bubblepack.ru/about?keep=1')
    assert.equal(websiteDomain(url), 'bubblepack.ru')
  })
  it('drops leftover yandex hosts', () => {
    assert.equal(normalizeWebsite('https://yandex.ru/maps/org/x/1/'), null)
  })
  it('adds https to bare domain', () => {
    assert.equal(normalizeWebsite('tapeworld.ru'), 'https://tapeworld.ru')
  })
})

describe('splitAddress', () => {
  it('strips leading Москва, and fills city/region', () => {
    const a = splitAddress('Москва, ул. Такая-то, 5')
    assert.equal(a.city, 'Москва')
    assert.equal(a.region, 'Москва')
    assert.equal(a.address, 'ул. Такая-то, 5')
  })
  it('strips г. Москва', () => {
    const a = splitAddress('г. Москва, Каширское ш., 1')
    assert.equal(a.address, 'Каширское ш., 1')
    assert.equal(a.city, 'Москва')
  })
  it('strips город Москва', () => {
    const a = splitAddress('город Москва, Варшавское ш., 10')
    assert.equal(a.address, 'Варшавское ш., 10')
  })
})

describe('innFromPayload', () => {
  it('accepts 10-digit inn', () => {
    assert.equal(normalizeInn('7701234567'), '7701234567')
  })
  it('reads ИНН from features', () => {
    assert.equal(innFromPayload({ oid: '1', features: { ИНН: '7704567890' } }), '7704567890')
  })
})

describe('featureTags', () => {
  it('keeps product keys and drops payment/delivery/inn', () => {
    const tags = featureTags({
      'Бумажные пакеты': true,
      Скотч: true,
      Доставка: true,
      'Способ оплаты': 'карта',
      ИНН: '7701234567',
      Лифт: true,
    })
    assert.deepEqual(tags, ['Бумажные пакеты', 'Скотч'])
  })
})

describe('normalizeOrg', () => {
  it('requires oid and name', () => {
    const a = normalizeOrg({ oid: '', name: 'X' })
    assert.ok('error' in a)
    const b = normalizeOrg({ oid: '1' })
    assert.ok('error' in b)
  })

  it('copies product features into featureTags', () => {
    const org = normalizeOrg({
      oid: '1',
      name: 'Пак',
      features: { 'Бумажные пакеты': true, Доставка: true },
    })
    assert.ok(!('error' in org))
    if ('error' in org) return
    assert.deepEqual(org.featureTags, ['Бумажные пакеты'])
  })
})
