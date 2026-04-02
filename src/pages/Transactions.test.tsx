import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, RecurringTransaction, Transaction, TransactionFilters } from '../../shared/types'
import { TransactionsPage } from './Transactions'

const mockIpc = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getRecurringTransactions: vi.fn(),
  getTransactions: vi.fn(),
  addTransaction: vi.fn(),
  upsertPayeeRule: vi.fn(),
  deleteTransactions: vi.fn(),
  deleteRecurringTransaction: vi.fn(),
  saveRecurringTransaction: vi.fn(),
  updateTransaction: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({
  ipc: mockIpc,
}))

vi.mock('@/components/ui/select', async () => await import('@/test/selectMock'))

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

const settings: AppSettings = {
  currency: 'USD',
  city: '',
  country: '',
  geminiApiKey: '',
  theme: 'system',
}

const salaryTransaction: Transaction = {
  id: 'income-salary',
  amount: 3200,
  type: 'income',
  category: null,
  incomeSource: 'Salary',
  payee: 'Employer',
  date: '2026-04-02',
  note: null,
  recurringTransactionId: null,
  createdAt: '2026-04-02T10:00:00.000Z',
}

const legacyIncomeTransaction: Transaction = {
  id: 'income-legacy',
  amount: 100,
  type: 'income',
  category: 'Savings',
  incomeSource: null,
  payee: 'Legacy',
  date: '2026-04-01',
  note: null,
  recurringTransactionId: null,
  createdAt: '2026-04-01T10:00:00.000Z',
}

const expenseTransaction: Transaction = {
  id: 'expense-1',
  amount: 45,
  type: 'expense',
  category: 'Food & Dining',
  incomeSource: null,
  payee: 'Cafe',
  date: '2026-04-03',
  note: null,
  recurringTransactionId: null,
  createdAt: '2026-04-03T10:00:00.000Z',
}

const recurringIncome: RecurringTransaction = {
  id: 'recurring-income',
  payee: 'Employer',
  amount: 3200,
  type: 'income',
  category: null,
  incomeSource: 'Salary',
  note: null,
  dayOfMonth: 5,
  startMonth: '2026-04',
  lastPostedMonth: null,
  active: true,
  createdAt: '2026-04-01T10:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    mockIpc.getSettings.mockReset()
    mockIpc.getRecurringTransactions.mockReset()
    mockIpc.getTransactions.mockReset()
    mockIpc.addTransaction.mockReset()
    mockIpc.upsertPayeeRule.mockReset()
    mockIpc.deleteTransactions.mockReset()
    mockIpc.deleteRecurringTransaction.mockReset()
    mockIpc.saveRecurringTransaction.mockReset()
    mockIpc.updateTransaction.mockReset()

    mockIpc.getSettings.mockResolvedValue(settings)
    mockIpc.getRecurringTransactions.mockResolvedValue([recurringIncome])
    mockIpc.getTransactions.mockImplementation((filters?: TransactionFilters) => {
      if (filters?.incomeSource === 'Salary') {
        return Promise.resolve([salaryTransaction])
      }

      return Promise.resolve([salaryTransaction, legacyIncomeTransaction, expenseTransaction])
    })
  })

  it('renders formatted income labels and filters by income source', async () => {
    render(<TransactionsPage />)

    expect(await screen.findByText('Income - Salary')).toBeInTheDocument()
    expect(screen.getByText('Income - Unspecified')).toBeInTheDocument()
    expect(screen.getByText(/\$3,200\.00 · Salary · day 5 · starts 2026-04/i)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: /filter by income type/i }), { target: { value: 'Salary' } })

    await waitFor(() => {
      expect(mockIpc.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          incomeSource: 'Salary',
        }),
      )
    })
  })
})
