import type { INCOME_SOURCES } from './constants'

export type ThemeMode = 'light' | 'dark' | 'system'
export type TransactionType = 'income' | 'expense'
export type IncomeSource = (typeof INCOME_SOURCES)[number]
export type Period = 'week' | 'month' | 'year'
export type TransactionSortField = 'date' | 'category' | 'amount' | 'type' | 'note' | 'payee'
export type SortDirection = 'asc' | 'desc'
export type AppSnapshotTrigger = 'manual' | 'start-fresh' | 'factory-reset'
export type BenchmarkConfidence = 'high' | 'medium' | 'low'
export type CsvImportRowStatus = 'ready' | 'duplicate' | 'invalid' | 'rule-filled' | 'defaulted'
export type CsvImportAmountMode = 'signed' | 'absolute'

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

export type AppMenu = 'file' | 'edit' | 'view' | 'window' | 'help'

export interface MenuAnchorPosition {
  x: number
  y: number
}

export interface WindowState {
  isMaximized: boolean
}

export interface Transaction {
  id: string
  amount: number
  type: TransactionType
  category: string | null
  incomeSource: IncomeSource | null
  payee: string | null
  date: string
  note: string | null
  recurringTransactionId: string | null
  createdAt: string
}

export interface TransactionInput {
  amount: number
  type: TransactionType
  category?: string | null
  incomeSource?: IncomeSource | null
  payee?: string
  date: string
  note?: string
}

export interface TransactionFilters {
  search?: string
  category?: string
  incomeSource?: IncomeSource | 'all'
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

export interface BudgetTemplate {
  id: string
  category: string
  amount: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface BudgetTemplateInput {
  id?: string
  category: string
  amount: number
  active: boolean
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
  payee: string | null
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
  benchmarkLevel?: 'city' | 'ai-city' | 'country' | 'global'
  benchmarkConfidence?: BenchmarkConfidence
  benchmarkSummary: string
  dataSources: string[]
  sourceRecency?: string[]
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

export interface RecurringTransaction {
  id: string
  payee: string
  amount: number
  type: TransactionType
  category: string | null
  incomeSource: IncomeSource | null
  note: string | null
  dayOfMonth: number
  startMonth: string
  lastPostedMonth: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface RecurringTransactionInput {
  id?: string
  payee: string
  amount: number
  type: TransactionType
  category?: string | null
  incomeSource?: IncomeSource | null
  note?: string
  dayOfMonth: number
  startMonth: string
  active: boolean
}

export interface RecurringSyncSummary {
  month: string
  createdCount: number
}

export interface PayeeRule {
  id: string
  normalizedPayee: string
  payeeDisplay: string
  category: string
  createdAt: string
  updatedAt: string
}

export interface PayeeRuleInput {
  id?: string
  payee: string
  category: string
}

export interface CsvImportFile {
  filePath: string
  fileName: string
  headers: string[]
}

export interface CsvImportMapping {
  date: string
  amount: string
  type?: string
  category?: string
  incomeSource?: string
  payee?: string
  note?: string
}

export interface CsvImportPreviewRequest {
  filePath: string
  mapping: CsvImportMapping
  amountMode: CsvImportAmountMode
  defaultExpenseType: TransactionType
  learnRules: boolean
}

export interface CsvImportPreviewRow {
  rowNumber: number
  status: CsvImportRowStatus
  errors: string[]
  source: Record<string, string>
  transaction: TransactionInput | null
}

export interface CsvImportPreviewResult {
  fileName: string
  rows: CsvImportPreviewRow[]
}

export interface CsvImportCommitSummary {
  insertedCount: number
  skippedDuplicateCount: number
  invalidCount: number
  learnedRuleCount: number
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
  recurringTransactions?: RecurringTransaction[]
  budgetTemplates?: BudgetTemplate[]
  payeeRules?: PayeeRule[]
}

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>
  showWindowMenu: (menu: AppMenu, position: MenuAnchorPosition) => Promise<void>
  getWindowState: () => Promise<WindowState>
  minimizeWindow: () => Promise<void>
  toggleMaximizeWindow: () => Promise<WindowState>
  closeWindow: () => Promise<void>
  onWindowStateChange: (listener: (state: WindowState) => void) => () => void
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
  getBudgetTemplates: () => Promise<BudgetTemplate[]>
  saveBudgetTemplate: (template: BudgetTemplateInput) => Promise<BudgetTemplate>
  deleteBudgetTemplate: (id: string) => Promise<void>
  applyBudgetTemplates: (month: string) => Promise<BudgetsPayload>
  saveMonthAsBudgetTemplates: (month: string) => Promise<BudgetTemplate[]>
  getRecurringTransactions: () => Promise<RecurringTransaction[]>
  saveRecurringTransaction: (transaction: RecurringTransactionInput) => Promise<RecurringTransaction>
  deleteRecurringTransaction: (id: string) => Promise<void>
  syncRecurringTransactions: () => Promise<RecurringSyncSummary>
  getPayeeRules: (search?: string) => Promise<PayeeRule[]>
  upsertPayeeRule: (rule: PayeeRuleInput) => Promise<PayeeRule>
  deletePayeeRule: (id: string) => Promise<void>
  findPayeeRule: (payee: string) => Promise<PayeeRule | null>
  selectTransactionCsvFile: () => Promise<CsvImportFile | null>
  previewTransactionCsvImport: (request: CsvImportPreviewRequest) => Promise<CsvImportPreviewResult>
  commitTransactionCsvImport: (request: CsvImportPreviewRequest) => Promise<CsvImportCommitSummary>
  getDashboardData: (period: Period) => Promise<DashboardData>
  getAnalyticsData: (period: Period) => Promise<AnalyticsData>
  analyzeInsights: (input: AnalyzeInsightsInput) => Promise<AIAnalysisResult>
}
