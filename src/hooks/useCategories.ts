import { useEffect, useState } from 'react'
import type { CategoryListResult } from '../../shared/types'
import { BUDGET_CATEGORIES, CATEGORY_COLORS } from '@/lib/constants'
import { ipc } from '@/lib/ipc'

const FALLBACK: CategoryListResult = {
  builtin: BUDGET_CATEGORIES,
  custom: [],
  all: [...BUDGET_CATEGORIES],
  colors: CATEGORY_COLORS,
}

export function useCategories(): CategoryListResult {
  const [result, setResult] = useState<CategoryListResult>(FALLBACK)

  useEffect(() => {
    void ipc.getCategories().then(setResult)
  }, [])

  return result
}
