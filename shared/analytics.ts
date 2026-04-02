import type { CategoryTrendDatum } from './types'

export function collectTrendCategories(data: CategoryTrendDatum[]) {
  const categories = new Set<string>()

  for (const bucket of data) {
    for (const key of Object.keys(bucket)) {
      if (key !== 'label') {
        categories.add(key)
      }
    }
  }

  return Array.from(categories).sort((left, right) => left.localeCompare(right))
}
