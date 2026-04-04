import { describe, expect, it } from 'vitest'
import type { AppSettings, BudgetProgress, RecurringTransaction, UpcomingBill } from '../shared/types'
import { buildDesktopAlerts, consumeDesktopAlerts, createEmptyAlertState } from './alerts'

const settings: AppSettings = {
  currency: 'USD',
  city: '',
  country: '',
  geminiApiKey: '',
  theme: 'system',
  onboardingCompleted: 'true',
  notifyUpcomingBills: 'true',
  notifyBudgetAlerts: 'true',
  notifyIncomeAlerts: 'true',
  notifyRecurringGaps: 'true',
}

describe('buildDesktopAlerts', () => {
  it('creates due-soon bill alerts inside the reminder window', () => {
    const alerts = buildDesktopAlerts({
      settings,
      budgets: [],
      recurringTransactions: [],
      upcomingBills: [
        {
          recurringTransactionId: 'rent',
          payee: 'Landlord',
          dueDate: '2026-04-05',
          amount: 900,
          expectedAmount: 900,
          type: 'expense',
          category: 'Housing',
          incomeSource: null,
          postingMode: 'reminder',
          reminderDays: 3,
          subscriptionLabel: null,
          isSubscription: false,
          isGap: false,
        } satisfies UpcomingBill,
      ],
      referenceDate: new Date('2026-04-03T12:00:00.000Z'),
    })

    expect(alerts).toEqual([
      expect.objectContaining({
        id: 'bill:rent:2026-04-05',
        title: 'Bill due in 2 days: Landlord',
      }),
    ])
  })

  it('creates over-budget, missing-income, and recurring-gap alerts when enabled', () => {
    const alerts = buildDesktopAlerts({
      settings,
      budgets: [
        {
          id: 'budget-1',
          category: 'Food & Dining',
          amount: 400,
          month: '2026-04',
          rolloverEnabled: true,
          spent: 450,
          carryoverAmount: 0,
          availableToSpend: 400,
          remaining: -50,
          percentage: 112.5,
          status: 'danger',
        } satisfies BudgetProgress,
      ],
      recurringTransactions: [
        {
          id: 'salary',
          payee: 'Salary',
          amount: 2500,
          type: 'income',
          category: null,
          incomeSource: 'Salary',
          note: null,
          dayOfMonth: 1,
          startMonth: '2026-01',
          lastPostedMonth: '2026-03',
          active: true,
          postingMode: 'reminder',
          expectedAmount: 2500,
          nextDueDate: '2026-05-01',
          reminderDays: 2,
          subscriptionLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'gym',
          payee: 'Gym',
          amount: 55,
          type: 'expense',
          category: 'Health',
          incomeSource: null,
          note: null,
          dayOfMonth: 2,
          startMonth: '2026-01',
          lastPostedMonth: '2026-01',
          active: true,
          postingMode: 'auto',
          expectedAmount: 55,
          nextDueDate: '2026-05-02',
          reminderDays: 3,
          subscriptionLabel: 'Gym',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ] satisfies RecurringTransaction[],
      upcomingBills: [],
      referenceDate: new Date('2026-04-03T12:00:00.000Z'),
    })

    expect(alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        'budget:2026-04:Food & Dining',
        'income:salary:2026-04',
        'gap:gym:2026-04',
      ]),
    )
  })

  it('respects disabled notification types', () => {
    const alerts = buildDesktopAlerts({
      settings: {
        ...settings,
        notifyUpcomingBills: 'false',
        notifyBudgetAlerts: 'false',
        notifyIncomeAlerts: 'false',
        notifyRecurringGaps: 'false',
      },
      budgets: [],
      recurringTransactions: [],
      upcomingBills: [
        {
          recurringTransactionId: 'rent',
          payee: 'Landlord',
          dueDate: '2026-04-05',
          amount: 900,
          expectedAmount: 900,
          type: 'expense',
          category: 'Housing',
          incomeSource: null,
          postingMode: 'reminder',
          reminderDays: 3,
          subscriptionLabel: null,
          isSubscription: false,
          isGap: false,
        },
      ],
      referenceDate: new Date('2026-04-03T12:00:00.000Z'),
    })

    expect(alerts).toEqual([])
  })
})

describe('consumeDesktopAlerts', () => {
  it('suppresses already-sent alerts on subsequent sweeps', () => {
    const inputAlerts = [
      { id: 'budget:2026-04:Food', title: 'Over budget', body: 'Food is over budget.' },
    ]
    const referenceDate = new Date('2026-04-03T12:00:00.000Z')

    const first = consumeDesktopAlerts(inputAlerts, createEmptyAlertState(), referenceDate)
    expect(first.alerts).toHaveLength(1)

    const second = consumeDesktopAlerts(inputAlerts, first.state, referenceDate)
    expect(second.alerts).toHaveLength(0)
  })
})
