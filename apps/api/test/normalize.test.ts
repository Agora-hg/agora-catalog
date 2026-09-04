import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cityForQuery, isMoscow, normalizeCity, normalizeName } from '../src/enrich/normalize.ts'

describe('normalizeName', () => {
  it('folds case, ё and quotes, keeps ООО', () => {
    assert.equal(normalizeName('ООО «Пакмастер»'), 'ооо пакмастер')
    assert.equal(normalizeName('ООО ПАКМАСТЕР'), 'ооо пакмастер')
    assert.equal(normalizeName('ПакМастер'), 'пакмастер')
    assert.equal(normalizeName('ООО Пакмастер'), normalizeName('ООО «Пакмастер»'))
    assert.notEqual(normalizeName('ООО Пакмастер'), normalizeName('ПакМастер'))
  })
})

describe('normalizeCity', () => {
  it('treats Moscow spellings as one city', () => {
    assert.equal(normalizeCity('Москва'), 'москва')
    assert.equal(normalizeCity('г. Москва'), 'москва')
    assert.equal(normalizeCity('город Москва'), 'москва')
    assert.equal(normalizeCity('г Москва'), 'москва')
    assert.ok(isMoscow('г. Москва'))
    assert.equal(cityForQuery(null), 'Москва')
    assert.equal(cityForQuery('  '), 'Москва')
  })
})
