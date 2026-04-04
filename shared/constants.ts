import type { AppSettings, ThemeMode } from './types'

export const APP_NAME = 'Budgeter'

export const DEFAULT_THEME: ThemeMode = 'system'

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'USD',
  city: '',
  country: '',
  geminiApiKey: '',
  theme: DEFAULT_THEME,
  onboardingCompleted: '',
  notifyUpcomingBills: 'true',
  notifyBudgetAlerts: 'true',
  notifyIncomeAlerts: 'false',
  notifyRecurringGaps: 'true',
  savingsGoal: '20',
}

export const BUDGET_CATEGORIES = [
  'Food & Dining',
  'Rent/Housing',
  'Transport',
  'Subscriptions',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Savings',
  'Other',
] as const

export const INCOME_SOURCES = [
  'Salary',
  'Meal Tickets',
  'Bonus',
  'Gift',
  'Refund',
  'Other',
] as const

export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': '#D4944A',
  'Rent/Housing': '#5B8A72',
  Transport: '#8B7EC8',
  Subscriptions: '#C47A8F',
  Utilities: '#5BA3A3',
  Entertainment: '#D47B4A',
  Healthcare: '#6BA378',
  Shopping: '#C26A5A',
  Savings: '#4A6741',
  Other: '#8A8A82',
}

export const SETTINGS_KEYS = [
  'currency',
  'city',
  'country',
  'geminiApiKey',
  'theme',
  'onboardingCompleted',
  'notifyUpcomingBills',
  'notifyBudgetAlerts',
  'notifyIncomeAlerts',
  'notifyRecurringGaps',
  'savingsGoal',
] as const

export const CUSTOM_CATEGORY_PALETTE = [
  '#7B68C8',
  '#C8A068',
  '#68C896',
  '#C86878',
  '#68B4C8',
  '#C8C068',
  '#9868C8',
  '#68C8B4',
  '#C89068',
  '#7898C8',
] as const
