import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate, formatTransactionTypeLabel } from './format'

describe('formatCurrency', () => {
  it('preserves cents for financial values', () => {
    expect(formatCurrency(1234.56, 'USD', 'en-US')).toBe('$1,234.56')
  })

  it('uses the provided locale when formatting currency', () => {
    expect(formatCurrency(1234.56, 'EUR', 'de-DE')).toBe('1.234,56 €')
  })
})

describe('formatDate', () => {
  it('uses the provided locale when formatting dates', () => {
    expect(formatDate('2026-04-02', 'de-DE')).toBe('02.04.2026')
  })
})

describe('formatTransactionTypeLabel', () => {
  it('includes the income source in the ledger label', () => {
    expect(formatTransactionTypeLabel('income', 'Salary')).toBe('Income - Salary')
  })

  it('falls back to Unspecified for legacy income rows without a subtype', () => {
    expect(formatTransactionTypeLabel('income', null)).toBe('Income - Unspecified')
  })

  it('returns Expense for expense rows', () => {
    expect(formatTransactionTypeLabel('expense', null)).toBe('Expense')
  })
})
