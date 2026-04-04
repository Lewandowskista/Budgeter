import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { AppSettings, RecurringTransaction, Transaction, TransactionFilters } from '../../shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TransactionsPage } from './Transactions'

const mockIpc = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getCategories: vi.fn(),
  getRecurringTransactions: vi.fn(),
  getTransactions: vi.fn(),
  getPendingReviewTransactions: vi.fn(),
  addTransaction: vi.fn(),
  markTransactionsReviewed: vi.fn(),
  upsertPayeeRule: vi.fn(),
  deleteTransactions: vi.fn(),
  bulkUpdateTransactionCategory: vi.fn(),
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
  onboardingCompleted: '',
  notifyUpcomingBills: 'true',
  notifyBudgetAlerts: 'true',
  notifyIncomeAlerts: 'false',
  notifyRecurringGaps: 'true',
  savingsGoal: '20',
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
  reviewStatus: 'reviewed',
  origin: 'manual',
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
  reviewStatus: 'reviewed',
  origin: 'manual',
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
  reviewStatus: 'reviewed',
  origin: 'manual',
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
  postingMode: 'auto',
  expectedAmount: 3200,
  nextDueDate: '2026-04-05',
  reminderDays: 3,
  subscriptionLabel: null,
  createdAt: '2026-04-01T10:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
}

const pendingReviewTransaction: Transaction = {
  id: 'review-1',
  amount: 12.5,
  type: 'expense',
  category: 'Transport',
  incomeSource: null,
  payee: 'Metro Pass',
  date: '2026-04-05',
  note: null,
  reviewStatus: 'pending',
  origin: 'csv',
  recurringTransactionId: null,
  createdAt: '2026-04-05T10:00:00.000Z',
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    mockIpc.getSettings.mockReset()
    mockIpc.getCategories.mockReset()
    mockIpc.getRecurringTransactions.mockReset()
    mockIpc.getTransactions.mockReset()
    mockIpc.getPendingReviewTransactions.mockReset()
    mockIpc.addTransaction.mockReset()
    mockIpc.markTransactionsReviewed.mockReset()
    mockIpc.upsertPayeeRule.mockReset()
    mockIpc.deleteTransactions.mockReset()
    mockIpc.deleteRecurringTransaction.mockReset()
    mockIpc.saveRecurringTransaction.mockReset()
    mockIpc.updateTransaction.mockReset()

    mockIpc.getSettings.mockResolvedValue(settings)
    mockIpc.getCategories.mockResolvedValue({
      builtin: ['Food & Dining', 'Rent/Housing', 'Transport', 'Subscriptions', 'Utilities', 'Entertainment', 'Healthcare', 'Shopping', 'Savings', 'Other'],
      custom: [],
      all: ['Food & Dining', 'Rent/Housing', 'Transport', 'Subscriptions', 'Utilities', 'Entertainment', 'Healthcare', 'Shopping', 'Savings', 'Other'],
      colors: {},
    })
    mockIpc.getRecurringTransactions.mockResolvedValue([recurringIncome])
    mockIpc.getPendingReviewTransactions.mockResolvedValue([pendingReviewTransaction])
    mockIpc.markTransactionsReviewed.mockResolvedValue([])
    mockIpc.getTransactions.mockImplementation((filters?: TransactionFilters) => {
      if (filters?.incomeSource === 'Salary') {
        return Promise.resolve([salaryTransaction])
      }

      return Promise.resolve([salaryTransaction, legacyIncomeTransaction, expenseTransaction])
    })
  })

  it('renders formatted income labels and filters by income source', async () => {
    render(<MemoryRouter><TooltipProvider><TransactionsPage /></TooltipProvider></MemoryRouter>)

    expect(await screen.findByText('Income - Salary')).toBeInTheDocument()
    expect(screen.getByText('Income - Unspecified')).toBeInTheDocument()
    expect(screen.getByText(/\$3,200\.00 · Salary · Auto-post · due 2026-04-05/i)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: /filter by income type/i }), { target: { value: 'Salary' } })

    await waitFor(() => {
      expect(mockIpc.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          incomeSource: 'Salary',
        }),
      )
    })
  })

  it('shows the review inbox and marks pending rows as reviewed', async () => {
    render(<MemoryRouter><TooltipProvider><TransactionsPage /></TooltipProvider></MemoryRouter>)

    expect(await screen.findByText(/review inbox/i)).toBeInTheDocument()
    expect(screen.getByText(/metro pass/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /mark all reviewed/i }))

    await waitFor(() => {
      expect(mockIpc.markTransactionsReviewed).toHaveBeenCalledWith(['review-1'])
    })
  })
})
