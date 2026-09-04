import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cityMatches, decideMatch, mapEgrulStatus, nameMatches } from '../src/enrich/match.ts'
import { loadPartyFixture, party } from './helpers.ts'

const fx = loadPartyFixture()

describe('nameMatches', () => {
  it('accepts exact OPF name after light normalize', () => {
    const s = fx['ООО АлинаПак']!.suggestions[0]!
    assert.equal(nameMatches('ООО АлинаПак', s), true)
    assert.equal(nameMatches('ООО «АлинаПак»', s), true)
    assert.equal(nameMatches('ооо алинапак', s), true)
  })

  it('does not glue maps trade name to EGRUL legal name', () => {
    const s = fx['ПакМастер']!.suggestions[0]!
    assert.equal(nameMatches('ПакМастер', s), false)
    assert.equal(nameMatches('ООО Пакмастер', s), true)
    assert.equal(nameMatches('ПАКМАСТЕР', s), false)
  })
})

describe('cityMatches', () => {
  it('matches Moscow via region/kladr when city is null (federal city)', () => {
    const s = fx['ООО АлинаПак']!.suggestions[0]!
    assert.equal(cityMatches('Москва', s), true)
    assert.equal(cityMatches('г. Москва', s), true)
    assert.equal(cityMatches(null, s), true)
  })

  it('rejects another city', () => {
    const s = fx['ООО КазаньПак']!.suggestions[0]!
    assert.equal(cityMatches('Москва', s), false)
    assert.equal(cityMatches('Казань', s), true)
  })
})

describe('decideMatch on fixtures', () => {
  it('auto-accepts exact name + city + active', () => {
    const d = decideMatch(
      { name: 'ООО АлинаПак', city: 'Москва' },
      fx['ООО АлинаПак']!.suggestions,
    )
    assert.equal(d.status, 'accepted')
    assert.equal(d.reason, 'exact_active')
    assert.equal(d.suggestion?.data?.inn, '7701234567')
    assert.equal(mapEgrulStatus(d.suggestion?.data?.state?.status), 'ACTIVE')
  })

  it('sends trade-name vs ООО to manual review, does not pick that INN', () => {
    const d = decideMatch({ name: 'ПакМастер', city: 'Москва' }, fx['ПакМастер']!.suggestions)
    assert.equal(d.status, 'needs_review')
    assert.equal(d.reason, 'no_exact_name_city')
    assert.equal(d.suggestion, null)
  })

  it('does not auto-accept a liquidated exact match', () => {
    const d = decideMatch(
      { name: 'ООО МёртваяТара', city: 'Москва' },
      fx['ООО МёртваяТара']!.suggestions,
    )
    assert.equal(d.status, 'needs_review')
    assert.equal(d.reason, 'exact_liquidated')
    assert.equal(mapEgrulStatus(d.suggestion?.data?.state?.status), 'LIQUIDATED')
  })

  it('does not auto-accept when city does not match', () => {
    const d = decideMatch(
      { name: 'ООО КазаньПак', city: 'Москва' },
      fx['ООО КазаньПак']!.suggestions,
    )
    assert.equal(d.status, 'needs_review')
    assert.equal(d.reason, 'no_exact_name_city')
  })

  it('does not guess when two exact matches share the name', () => {
    const d = decideMatch(
      { name: 'ООО ДваБлизнеца', city: 'Москва' },
      fx['ООО ДваБлизнеца']!.suggestions,
    )
    assert.equal(d.status, 'needs_review')
    assert.equal(d.reason, 'ambiguous')
    assert.equal(d.suggestion, null)
  })

  it('auto-accepts REORGANIZING and maps egrul_status', () => {
    const d = decideMatch(
      { name: 'ООО Реорганизуемый', city: 'Москва' },
      fx['ООО Реорганизуемый']!.suggestions,
    )
    assert.equal(d.status, 'accepted')
    assert.equal(mapEgrulStatus(d.suggestion?.data?.state?.status), 'REORGANIZING')
  })

  it('marks empty suggestions as not_found', () => {
    const d = decideMatch({ name: 'НетВЕгрюл', city: 'Москва' }, fx['НетВЕгрюл']!.suggestions)
    assert.equal(d.status, 'not_found')
    assert.equal(d.reason, 'empty')
  })
})

describe('batch of 100 fixture companies', () => {
  it('auto-matches only exact name+city+active; 20-30% stay unmatched', () => {
    let matched = 0
    let review = 0
    let missing = 0

    for (let i = 1; i <= 70; i++) {
      const name = `ООО Автомат${String(i).padStart(3, '0')}`
      const inn = String(7700000000 + i)
      const d = decideMatch(
        { name, city: 'Москва' },
        [party({ value: name, inn, status: 'ACTIVE' })],
      )
      if (d.status === 'accepted') matched += 1
    }
    for (let i = 1; i <= 15; i++) {
      const name = `ПакМастер${i}`
      const legal = `ООО ПАКМАСТЕР${i}`
      const d = decideMatch(
        { name, city: 'Москва' },
        [party({ value: legal, inn: String(7700001000 + i), status: 'ACTIVE' })],
      )
      if (d.status === 'needs_review') review += 1
    }
    for (let i = 1; i <= 8; i++) {
      const name = `ООО Ликвидант${i}`
      const d = decideMatch(
        { name, city: 'Москва' },
        [party({ value: name, inn: String(7700002000 + i), status: 'LIQUIDATED' })],
      )
      if (d.status === 'needs_review') review += 1
    }
    for (let i = 1; i <= 7; i++) {
      const d = decideMatch({ name: `НетВЕгрюл${i}`, city: 'Москва' }, [])
      if (d.status === 'not_found') missing += 1
    }

    assert.equal(matched + review + missing, 100)
    assert.equal(matched, 70)
    assert.equal(review, 23)
    assert.equal(missing, 7)
    assert.ok(matched / 100 <= 0.8)
    assert.ok((100 - matched) / 100 >= 0.2)
  })
})
