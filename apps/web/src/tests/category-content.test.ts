import { describe, expect, it } from 'vitest'
import { CATEGORY_CONTENT, getCategoryContent } from '@/lib/category-content'

describe('category SEO content', () => {
  it('все 22 основные категории имеют уникальный контент с текстами 500+ символов', () => {
    const keys = Object.keys(CATEGORY_CONTENT)
    expect(keys.length).toBe(22)

    for (const key of keys) {
      const item = CATEGORY_CONTENT[key]!
      expect(item.introText.length, `Категория ${key} introText меньше 500 знаков`).toBeGreaterThanOrEqual(500)
      expect(item.moscowIntroText.length, `Категория ${key} moscowIntroText меньше 500 знаков`).toBeGreaterThanOrEqual(500)
      expect(item.title.length, `Категория ${key} title пустой`).toBeGreaterThan(15)
      expect(item.metaDescription.length, `Категория ${key} metaDescription короткий`).toBeGreaterThan(40)
      expect(item.moscowTitle.length, `Категория ${key} moscowTitle пустой`).toBeGreaterThan(15)
      expect(item.moscowMetaDescription.length, `Категория ${key} moscowMetaDescription короткий`).toBeGreaterThan(40)
      expect(item.h1.length, `Категория ${key} h1 пустой`).toBeGreaterThan(5)
      expect(item.moscowH1.length, `Категория ${key} moscowH1 пустой`).toBeGreaterThan(5)
      expect(item.relatedSlugs.length, `Категория ${key} мало связанных категорий`).toBeGreaterThanOrEqual(3)

      // Заголовки Москвы и общие отличаются
      expect(item.title).not.toBe(item.moscowTitle)
      expect(item.metaDescription).not.toBe(item.moscowMetaDescription)
      expect(item.introText).not.toBe(item.moscowIntroText)
    }
  })

  it('подкатегории получают сгенерированный контент 500+ символов', () => {
    const sub = getCategoryContent('chetyrehklapannye', 'moskva')
    expect(sub.moscowIntroText.length).toBeGreaterThanOrEqual(500)
    expect(sub.moscowTitle).toContain('Москв')
    expect(sub.moscowH1).toContain('Москв')
  })
})
