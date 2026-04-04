import type { AppSettings, BudgetProgress, RecurringTransaction, UpcomingBill } from '../shared/types'

export interface DesktopAlert {
  id: string
  title: string
  body: string
}

export interface AlertState {
  sentAtById: Record<string, string>
}

export interface BuildDesktopAlertsInput {
  settings: AppSettings
  budgets: BudgetProgress[]
  recurringTransactions: RecurringTransaction[]
  upcomingBills: UpcomingBill[]
  referenceDate: Date
}

const ALERT_RETENTION_DAYS = 90

export function buildDesktopAlerts({
  settings,
  budgets,
  recurringTransactions,
  upcomingBills,
  referenceDate,
}: BuildDesktopAlertsInput): DesktopAlert[] {
  const alerts: DesktopAlert[] = []
  const today = toDateKey(referenceDate)
  const currentMonth = today.slice(0, 7)

  if (settings.notifyUpcomingBills === 'true') {
    alerts.push(
      ...upcomingBills
        .filter((bill) => bill.type === 'expense' && bill.dueDate.startsWith(currentMonth))
        .filter((bill) => diffInDays(today, bill.dueDate) <= Math.max(0, bill.reminderDays))
        .map((bill) => {
          const daysUntil = diffInDays(today, bill.dueDate)
          const dueLabel = daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`
          return {
            id: `bill:${bill.recurringTransactionId}:${bill.dueDate}`,
            title: `Bill due ${dueLabel}: ${bill.payee}`,
            body: `${formatAmount(settings.currency, bill.expectedAmount)} due on ${bill.dueDate}${bill.subscriptionLabel ? ` for ${bill.subscriptionLabel}` : ''}.`,
          }
        }),
    )
  }

  if (settings.notifyBudgetAlerts === 'true') {
    alerts.push(
      ...budgets
        .filter((budget) => budget.remaining < 0)
        .map((budget) => ({
          id: `budget:${budget.month}:${budget.category}`,
          title: `Over budget: ${budget.category}`,
          body: `${budget.category} is over by ${formatAmount(settings.currency, Math.abs(budget.remaining))} this month.`,
        })),
    )
  }

  if (settings.notifyIncomeAlerts === 'true') {
    alerts.push(
      ...recurringTransactions
        .filter((recurring) => recurring.active && recurring.type === 'income')
        .filter((recurring) => recurring.startMonth <= currentMonth)
        .map((recurring) => {
          const dueDate = getRecurringDateForMonth(currentMonth, recurring.dayOfMonth)
          return { recurring, dueDate }
        })
        .filter(({ recurring, dueDate }) => recurring.lastPostedMonth !== currentMonth && dueDate < today)
        .map(({ recurring, dueDate }) => ({
          id: `income:${recurring.id}:${currentMonth}`,
          title: `Expected income missing: ${recurring.payee}`,
          body: `${formatAmount(settings.currency, recurring.expectedAmount || recurring.amount)} was due on ${dueDate} and still is not logged.`,
        })),
    )
  }

  if (settings.notifyRecurringGaps === 'true') {
    alerts.push(
      ...recurringTransactions
        .filter((recurring) => recurring.active)
        .filter((recurring) => hasRecurringGap(recurring, currentMonth))
        .map((recurring) => ({
          id: `gap:${recurring.id}:${currentMonth}`,
          title: `Recurring gap detected: ${recurring.payee}`,
          body:
            recurring.lastPostedMonth === null
              ? `This recurring item has not posted yet since ${recurring.startMonth}.`
              : `Last posted in ${recurring.lastPostedMonth}. Check the recurring schedule.`,
        })),
    )
  }

  return alerts
}

export function consumeDesktopAlerts(alerts: DesktopAlert[], state: AlertState, referenceDate: Date) {
  const nextState = pruneAlertState(state, referenceDate)
  const unsent = alerts.filter((alert) => !nextState.sentAtById[alert.id])

  for (const alert of unsent) {
    nextState.sentAtById[alert.id] = referenceDate.toISOString()
  }

  return {
    alerts: unsent,
    state: nextState,
  }
}

export function pruneAlertState(state: AlertState, referenceDate: Date): AlertState {
  const cutoff = new Date(referenceDate)
  cutoff.setUTCDate(cutoff.getUTCDate() - ALERT_RETENTION_DAYS)

  return {
    sentAtById: Object.fromEntries(
      Object.entries(state.sentAtById).filter(([, sentAt]) => sentAt >= cutoff.toISOString()),
    ),
  }
}

export function createEmptyAlertState(): AlertState {
  return { sentAtById: {} }
}

function hasRecurringGap(recurring: RecurringTransaction, currentMonth: string) {
  if (recurring.postingMode !== 'auto') {
    return recurring.lastPostedMonth === null
      ? recurring.startMonth < currentMonth
      : monthDistance(recurring.lastPostedMonth, currentMonth) > 1
  }

  return recurring.lastPostedMonth === null
    ? recurring.startMonth < currentMonth
    : monthDistance(recurring.lastPostedMonth, currentMonth) > 1
}

function monthDistance(left: string, right: string) {
  const [leftYear, leftMonth] = left.split('-').map(Number)
  const [rightYear, rightMonth] = right.split('-').map(Number)
  return (rightYear - leftYear) * 12 + (rightMonth - leftMonth)
}

function getRecurringDateForMonth(month: string, dayOfMonth: number) {
  const [year, monthIndex] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  return `${month}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, '0')}`
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function diffInDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime()
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime()
  return Math.round((end - start) / 86_400_000)
}

function formatAmount(currency: string, amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}
