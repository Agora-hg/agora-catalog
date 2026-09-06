import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findDuplicate } from '../src/import/dedup.ts'
import type { ExistingCompany } from '../src/import/types.ts'

const a: ExistingCompany = {
  id: 'a',
  yandexOid: '1001',
  inn: '7701234567',
  domain: 'alinapak.ru',
  nameNorm: 'алинапак',
  phone: '+74951111111',
  phones: ['+74951111111'],
  slug: 'alinapak',
}

const b: ExistingCompany = {
  id: 'b',
  yandexOid: '1007',
  inn: null,
  domain: 'bubblepack.ru',
  nameNorm: 'bubblepack',
  phone: '+74954444444',
  phones: ['+74954444444'],
  slug: 'bubblepack',
}

const c: ExistingCompany = {
  id: 'c',
  yandexOid: '1011',
  inn: null,
  domain: null,
  nameNorm: 'пакетмаркет',
  phone: '+74951234567',
  phones: ['+74951234567'],
  slug: 'paketmarket',
}

describe('findDuplicate order: oid → inn → domain → name+phone', () => {
  it('matches the same yandex oid first', () => {
    const hit = findDuplicate(
      { yandexOid: '1001', inn: '999', domain: 'other.ru', nameNorm: 'x', phone: '+7999' },
      [a, b, c],
    )
    assert.equal(hit?.id, 'a')
  })

  it('matches by INN and does not fall through to domain', () => {
    const hit = findDuplicate(
      {
        yandexOid: '1002',
        inn: '7701234567',
        domain: 'bubblepack.ru',
        nameNorm: 'другое',
        phone: '+74954444444',
      },
      [a, b, c],
    )
    assert.equal(hit?.id, 'a')
  })

  it('does not merge different INNs that share a domain', () => {
    const hit = findDuplicate(
      {
        yandexOid: '9999',
        inn: '7700000000',
        domain: 'alinapak.ru',
        nameNorm: 'алинапак',
        phone: '+74951111111',
      },
      [a, b, c],
    )
    assert.equal(hit, undefined)
  })

  it('matches by domain when INN is absent', () => {
    const hit = findDuplicate(
      {
        yandexOid: '1008',
        inn: null,
        domain: 'bubblepack.ru',
        nameNorm: 'bubblepack опт',
        phone: '+74954444445',
      },
      [a, b, c],
    )
    assert.equal(hit?.id, 'b')
  })

  it('matches by name+phone when INN and domain are absent', () => {
    const hit = findDuplicate(
      {
        yandexOid: '1012',
        inn: null,
        domain: null,
        nameNorm: 'пакетмаркет',
        phone: '+74951234567',
      },
      [a, b, c],
    )
    assert.equal(hit?.id, 'c')
  })

  it('creates a new company when there are no contacts', () => {
    const hit = findDuplicate(
      {
        yandexOid: '1015',
        inn: null,
        domain: null,
        nameNorm: 'упаковка без контактов',
        phone: null,
      },
      [a, b, c],
    )
    assert.equal(hit, undefined)
  })
})
