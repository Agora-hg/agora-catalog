import { CATEGORY_SEED, type CategorySeed } from '@agora/db'

function fold(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е')
}

/**
 * Substring match of CATEGORY_SEED[].match against maps rubrics + name + description.
 * A child hit also tags the parent so the company shows on the parent landing page.
 */
export function matchCategorySlugs(
  parts: Array<string | null | undefined>,
  seed: CategorySeed[] = CATEGORY_SEED,
): string[] {
  const text = fold(parts.filter(Boolean).join(' '))
  if (!text.trim()) return []
  const slugs = new Set<string>()

  const walk = (nodes: CategorySeed[], parentSlug: string | null) => {
    for (const node of nodes) {
      const hit = node.match.some((m) => text.includes(fold(m)))
      if (hit) {
        slugs.add(node.slug)
        if (parentSlug) slugs.add(parentSlug)
      }
      if (node.children?.length) walk(node.children, node.slug)
    }
  }

  walk(seed, null)
  return [...slugs]
}

export function namesForSlugs(slugs: string[], seed: CategorySeed[] = CATEGORY_SEED): string[] {
  const want = new Set(slugs)
  const names: string[] = []
  const walk = (nodes: CategorySeed[]) => {
    for (const node of nodes) {
      if (want.has(node.slug)) names.push(node.name)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(seed)
  return names
}
