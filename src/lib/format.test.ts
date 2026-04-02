import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate } from './format'

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
