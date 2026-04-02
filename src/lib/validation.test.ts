import { describe, expect, it } from 'vitest'
import { validateBudgetInput, validateTransactionInput } from './validation'

describe('validateTransactionInput', () => {
  it('rejects zero-value transactions before submit', () => {
    expect(
      validateTransactionInput({
        amount: 0,
        type: 'expense',
        category: 'Food & Dining',
        date: '2026-04-02',
        note: '',
      }),
    ).toEqual({ amount: 'Enter an amount greater than 0.' })
  })
})

describe('validateBudgetInput', () => {
  it('rejects zero-value budgets before submit', () => {
    expect(
      validateBudgetInput({
        category: 'Food & Dining',
        amount: 0,
        month: '2026-04',
      }),
    ).toEqual({ amount: 'Enter a budget greater than 0.' })
  })
})
