import type { CategoryNode } from './types'

export function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  const out: CategoryNode[] = []
  const walk = (list: CategoryNode[]) => {
    for (const node of list) {
      out.push(node)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

export function findCategory(nodes: CategoryNode[], slug: string): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.slug === slug) return node
    if (node.children?.length) {
      const found = findCategory(node.children, slug)
      if (found) return found
    }
  }
  return undefined
}

export function findParent(nodes: CategoryNode[], slug: string): CategoryNode | undefined {
  for (const node of nodes) {
    if (node.children?.some((c) => c.slug === slug)) return node
    if (node.children?.length) {
      const found = findParent(node.children, slug)
      if (found) return found
    }
  }
  return undefined
}

export function isTopLevel(nodes: CategoryNode[], slug: string): boolean {
  return nodes.some((n) => n.slug === slug)
}
