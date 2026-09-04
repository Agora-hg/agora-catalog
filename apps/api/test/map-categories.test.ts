import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matchCategorySlugs } from '../src/import/map-categories.ts'

describe('matchCategorySlugs', () => {
  it('maps гофрокороба from rubrics + description', () => {
    const slugs = matchCategorySlugs([
      'Тара и упаковка',
      'Гофрокороба',
      'АлинаПак',
      'Производство гофрокоробов и коробок с печатью',
    ])
    assert.ok(slugs.includes('gofrokoroba'))
    assert.ok(slugs.includes('korobki-s-pechatyu'))
  })

  it('tags parent when only a child keyword hits', () => {
    const slugs = matchCategorySlugs(['четырёхклапанные короба 0201'])
    assert.ok(slugs.includes('chetyrehklapannye'))
    assert.ok(slugs.includes('gofrokoroba'))
  })

  it('does not force a category on unrelated text', () => {
    const slugs = matchCategorySlugs([
      'Грузоперевозки',
      'Упаковка без контактов',
      'Консалтинг логистики, контактов на карточке нет',
    ])
    assert.equal(slugs.length, 0)
  })
})
