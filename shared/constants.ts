import type { AppSettings, ThemeMode } from './types'

export const APP_NAME = 'Budgeter'

export const DEFAULT_THEME: ThemeMode = 'system'

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'USD',
  city: '',
  country: '',
  geminiApiKey: '',
  theme: DEFAULT_THEME,
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
] as const
