import type { BudgetInput, TransactionInput } from '../../shared/types'

export interface ValidationErrors {
  amount?: string
  category?: string
  incomeSource?: string
}

export function validateTransactionInput(input: TransactionInput): ValidationErrors {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return {
      amount: 'Enter an amount greater than 0.',
    }
  }

  if (input.type === 'income' && !input.incomeSource) {
    return {
      incomeSource: 'Select an income type.',
    }
  }

  if (input.type === 'expense' && !input.category) {
    return {
      category: 'Select an expense category.',
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
