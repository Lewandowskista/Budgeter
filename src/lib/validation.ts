import type { BudgetInput, TransactionInput } from '../../shared/types'

export interface ValidationErrors {
  amount?: string
}

export function validateTransactionInput(input: TransactionInput): ValidationErrors {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      amount: 'Enter an amount greater than 0.',
    }
  }

  return {}
}

export function validateBudgetInput(input: BudgetInput): ValidationErrors {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      amount: 'Enter a budget greater than 0.',
    }
  }

  return {}
}
