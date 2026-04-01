export type ThemeMode = 'light' | 'dark' | 'system'
export type TransactionType = 'income' | 'expense'
export type Period = 'week' | 'month' | 'year'
export type TransactionSortField = 'date' | 'category' | 'amount' | 'type' | 'note'
export type SortDirection = 'asc' | 'desc'
export type AppSnapshotTrigger = 'manual' | 'start-fresh' | 'factory-reset'

export interface AppSettings {
  currency: string
  city: string
  country: string
  geminiApiKey: string
  theme: ThemeMode
}

export interface AppInfo {
  name: string
  version: string
}

export interface Transaction {
  id: string
  amount: number
  type: TransactionType
  category: string
  date: string
  note: string | null
  createdAt: string
}

export interface TransactionInput {
  amount: number
  type: TransactionType
  category: string
  date: string
  note?: string
}

export interface TransactionFilters {
  search?: string
  category?: string
  type?: TransactionType | 'all'
  from?: string
  to?: string
  minAmount?: number | null
  maxAmount?: number | null
  sortBy?: TransactionSortField
  sortDirection?: SortDirection
}

export interface Budget {
  id: string
  category: string
  amount: number
  month: string
}

export interface BudgetInput {
  category: string
  amount: number
  month: string
}

export interface BudgetProgress extends Budget {
  spent: number
  remaining: number
  percentage: number
  status: 'healthy' | 'warning' | 'danger'
}

export interface BudgetOverview {
  totalBudget: number
  totalSpent: number
  percentage: number
}

export interface BudgetsPayload {
  month: string
  budgets: BudgetProgress[]
  overview: BudgetOverview
}

export interface SummaryCardData {
  totalIncome: number
  totalSpent: number
  remainingBudget: number
  savingsRate: number
}

export interface CategorySpendDatum {
  category: string
  amount: number
  color: string
}

export interface TrendDatum {
  label: string
  income: number
  spent: number
}

export interface DashboardData {
  period: Period
  summary: SummaryCardData
  spendingByCategory: CategorySpendDatum[]
  spendingTrend: TrendDatum[]
  recentTransactions: Transaction[]
}

export interface CategoryTrendDatum {
  label: string
  [category: string]: string | number
}

export interface TopExpenseDatum {
  id: string
  category: string
  note: string | null
  date: string
  amount: number
}

export interface AnalyticsData {
  period: Period
  categoryBreakdown: CategorySpendDatum[]
  spendingTrend: TrendDatum[]
  categoryTrends: CategoryTrendDatum[]
  topExpenses: TopExpenseDatum[]
  monthOverMonth: TrendDatum[]
}

export interface AIComparison {
  category: string
  userAmount: number
  averageAmount: number
  percentDiff: number
}

export interface AIAnalysisResult {
  location: string
  periodMonth: string
  healthScore: number
  explanation: string
  tips: string[]
  positives: string[]
  comparisons: AIComparison[]
  benchmarkSummary: string
  dataSources: string[]
  cachedAt: string
}

export interface AnalyzeInsightsInput {
  periodMonth: string
  refresh?: boolean
}

export interface AICacheSnapshotEntry {
  key: string
  payload: string
  createdAt: string
}

export interface AppSnapshotSummary {
  id: string
  label: string | null
  createdAt: string
  trigger: AppSnapshotTrigger
  appVersion: string
}

export interface AppSnapshotPayload extends AppSnapshotSummary {
  version: number
  settings: AppSettings
  transactions: Transaction[]
  budgets: Budget[]
  aiCache: AICacheSnapshotEntry[]
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>
  getSettings: () => Promise<AppSettings>
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  exportTransactionsCsv: () => Promise<{ filePath?: string }>
  startFresh: () => Promise<void>
  listSnapshots: () => Promise<AppSnapshotSummary[]>
  createSnapshot: (label?: string) => Promise<AppSnapshotSummary>
  restoreSnapshot: (id: string) => Promise<void>
  deleteSnapshot: (id: string) => Promise<void>
  factoryReset: () => Promise<void>
  resetAllData: () => Promise<void>
  getTransactions: (filters?: TransactionFilters) => Promise<Transaction[]>
  addTransaction: (transaction: TransactionInput) => Promise<Transaction>
  updateTransaction: (id: string, transaction: TransactionInput) => Promise<Transaction>
  deleteTransactions: (ids: string[]) => Promise<void>
  getBudgets: (month: string) => Promise<BudgetsPayload>
  setBudget: (budget: BudgetInput) => Promise<BudgetProgress>
  deleteBudget: (id: string, month: string) => Promise<BudgetsPayload>
  getDashboardData: (period: Period) => Promise<DashboardData>
  getAnalyticsData: (period: Period) => Promise<AnalyticsData>
  analyzeInsights: (input: AnalyzeInsightsInput) => Promise<AIAnalysisResult>
}
