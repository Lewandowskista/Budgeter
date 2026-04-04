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

  it('requires an income source for income transactions', () => {
    expect(
      validateTransactionInput({
        amount: 1200,
        type: 'income',
        category: null,
        incomeSource: null,
        date: '2026-04-02',
        note: '',
      } as any),
    ).toEqual({ incomeSource: 'Select an income type.' })
  })

  it('requires a category for expense transactions', () => {
    expect(
      validateTransactionInput({
        amount: 45,
        type: 'expense',
        category: null,
        incomeSource: null,
        date: '2026-04-02',
        note: '',
      } as any),
    ).toEqual({ category: 'Select an expense category.' })
  })
})

describe('validateBudgetInput', () => {
  it('rejects zero-value budgets before submit', () => {
    expect(
      validateBudgetInput({
        category: 'Food & Dining',
        amount: 0,
        month: '2026-04',
        rolloverEnabled: false,
      }),
    ).toEqual({ amount: 'Enter a budget greater than 0.' })
  })
})
