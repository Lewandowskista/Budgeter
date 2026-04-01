import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { CATEGORY_COLORS, DEFAULT_SETTINGS, SETTINGS_KEYS } from '../shared/constants'
import type {
  AICacheSnapshotEntry,
  AnalyticsData,
  AppSettings,
  AppSnapshotPayload,
  Budget,
  BudgetInput,
  BudgetProgress,
  BudgetsPayload,
  CategorySpendDatum,
  CategoryTrendDatum,
  DashboardData,
  Period,
  SummaryCardData,
  TopExpenseDatum,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionSortField,
  TrendDatum,
} from '../shared/types'

type SettingsRow = { key: keyof AppSettings; value: string }
type BudgetRow = { id: string; category: string; amount: number; month: string }
type CacheRow = { key: string; payload: string; created_at: string }

interface PeriodBucket {
  label: string
  start: Date
  end: Date
}

export class DatabaseManager {
  private readonly db: Database.Database

  constructor(userDataPath: string) {
    fs.mkdirSync(userDataPath, { recursive: true })
    this.db = new Database(path.join(userDataPath, 'budgeter.sqlite'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.initialize()
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL CHECK(amount > 0),
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        month TEXT NOT NULL,
        UNIQUE(category, month)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_cache (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    this.seedDefaultSettings()
  }

  getSettings(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as SettingsRow[]
    return rows.reduce<AppSettings>(
      (accumulator, row) => {
        accumulator[row.key] = row.value as never
        return accumulator
      },
      { ...DEFAULT_SETTINGS },
    )
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    const upsert = this.db.prepare(`
      INSERT INTO settings(key, value)
      VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `)

    const applyChanges = this.db.transaction(() => {
      for (const [key, value] of Object.entries(partial)) {
        if (value === undefined) continue
        upsert.run({ key, value: String(value) })
      }
    })

    applyChanges()
    return this.getSettings()
  }

  getTransactions(filters: TransactionFilters = {}): Transaction[] {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}

    if (filters.search) {
      clauses.push('(LOWER(category) LIKE @search OR LOWER(COALESCE(note, \'\')) LIKE @search)')
      params.search = `%${filters.search.toLowerCase()}%`
    }

    if (filters.category) {
      clauses.push('category = @category')
      params.category = filters.category
    }

    if (filters.type && filters.type !== 'all') {
      clauses.push('type = @type')
      params.type = filters.type
    }

    if (filters.from) {
      clauses.push('date >= @from')
      params.from = filters.from
    }

    if (filters.to) {
      clauses.push('date <= @to')
      params.to = filters.to
    }

    if (filters.minAmount != null) {
      clauses.push('amount >= @minAmount')
      params.minAmount = filters.minAmount
    }

    if (filters.maxAmount != null) {
      clauses.push('amount <= @maxAmount')
      params.maxAmount = filters.maxAmount
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const sortColumn = getTransactionSortColumn(filters.sortBy)
    const sortDirection = filters.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const rows = this.db
      .prepare(
        `
          SELECT id, amount, type, category, date, note, created_at
          FROM transactions
          ${where}
          ORDER BY ${sortColumn} ${sortDirection}, created_at DESC
        `,
      )
      .all(params) as Array<{
      id: string
      amount: number
      type: 'income' | 'expense'
      category: string
      date: string
      note: string | null
      created_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      type: row.type,
      category: row.category,
      date: row.date,
      note: row.note,
      createdAt: row.created_at,
    }))
  }

  addTransaction(input: TransactionInput): Transaction {
    const transaction: Transaction = {
      id: randomUUID(),
      amount: input.amount,
      type: input.type,
      category: input.category,
      date: input.date,
      note: input.note?.trim() || null,
      createdAt: new Date().toISOString(),
    }

    this.db
      .prepare(
        `
        INSERT INTO transactions(id, amount, type, category, date, note, created_at)
        VALUES (@id, @amount, @type, @category, @date, @note, @createdAt)
      `,
      )
      .run(transaction)

    return transaction
  }

  updateTransaction(id: string, input: TransactionInput): Transaction {
    this.db
      .prepare(
        `
        UPDATE transactions
        SET amount = @amount,
            type = @type,
            category = @category,
            date = @date,
            note = @note
        WHERE id = @id
      `,
      )
      .run({
        id,
        amount: input.amount,
        type: input.type,
        category: input.category,
        date: input.date,
        note: input.note?.trim() || null,
      })

    const row = this.db
      .prepare(`
        SELECT id, amount, type, category, date, note, created_at
        FROM transactions
        WHERE id = ?
      `)
      .get(id) as
      | {
          id: string
          amount: number
          type: 'income' | 'expense'
          category: string
          date: string
          note: string | null
          created_at: string
        }
      | undefined

    if (!row) throw new Error('Transaction not found.')

    return {
      id: row.id,
      amount: row.amount,
      type: row.type,
      category: row.category,
      date: row.date,
      note: row.note,
      createdAt: row.created_at,
    }
  }

  deleteTransactions(ids: string[]) {
    if (!ids.length) return
    const remove = this.db.prepare('DELETE FROM transactions WHERE id = ?')
    const batch = this.db.transaction((items: string[]) => {
      for (const id of items) remove.run(id)
    })
    batch(ids)
  }

  getBudgets(month: string): BudgetsPayload {
    const budgets = this.getBudgetRows(month)
    const spends = this.getExpensesByCategory(month)
    const progress = budgets.map((budget) => toBudgetProgress(budget, spends.get(budget.category) ?? 0))
    const totalBudget = progress.reduce((sum, item) => sum + item.amount, 0)
    const totalSpent = progress.reduce((sum, item) => sum + item.spent, 0)

    return {
      month,
      budgets: progress.sort((left, right) => right.percentage - left.percentage),
      overview: {
        totalBudget,
        totalSpent,
        percentage: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      },
    }
  }

  setBudget(input: BudgetInput): BudgetProgress {
    const existing = this.db
      .prepare('SELECT id, category, amount, month FROM budgets WHERE category = ? AND month = ?')
      .get(input.category, input.month) as BudgetRow | undefined

    if (existing) {
      this.db.prepare('UPDATE budgets SET amount = ? WHERE id = ?').run(input.amount, existing.id)
    } else {
      this.db
        .prepare('INSERT INTO budgets(id, category, amount, month) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), input.category, input.amount, input.month)
    }

    const refreshed = this.getBudgetRows(input.month).find((budget) => budget.category === input.category)
    if (!refreshed) throw new Error('Budget could not be saved.')

    return toBudgetProgress(refreshed, this.getExpensesByCategory(input.month).get(input.category) ?? 0)
  }

  deleteBudget(id: string, month: string): BudgetsPayload {
    this.db.prepare('DELETE FROM budgets WHERE id = ?').run(id)
    return this.getBudgets(month)
  }

  getDashboardData(period: Period): DashboardData {
    const currentPeriod = getCurrentPeriod(period)
    const transactions = this.getTransactionsInRange(currentPeriod.start, currentPeriod.end)
    const budgetTotal = this.getBudgetRows(currentPeriod.monthKey).reduce((sum, item) => sum + item.amount, 0)

    return {
      period,
      summary: buildSummary(transactions, budgetTotal),
      spendingByCategory: aggregateCategorySpend(transactions),
      spendingTrend: this.buildTrend(period, 6),
      recentTransactions: this.getTransactions().slice(0, 10),
    }
  }

  getAnalyticsData(period: Period): AnalyticsData {
    const currentPeriod = getCurrentPeriod(period)
    const transactions = this.getTransactionsInRange(currentPeriod.start, currentPeriod.end)

    return {
      period,
      categoryBreakdown: aggregateCategorySpend(transactions),
      spendingTrend: this.buildTrend(period, 6),
      categoryTrends: this.buildCategoryTrends(period, 6),
      topExpenses: transactions
        .filter((transaction) => transaction.type === 'expense')
        .sort((left, right) => right.amount - left.amount)
        .slice(0, 8)
        .map<TopExpenseDatum>((transaction) => ({
          id: transaction.id,
          category: transaction.category,
          note: transaction.note,
          date: transaction.date,
          amount: transaction.amount,
        })),
      monthOverMonth: this.buildTrend('month', 4),
    }
  }

  getMonthlySpendingSnapshot(periodMonth: string) {
    const [year, month] = periodMonth.split('-').map(Number)
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
    const transactions = this.getTransactionsInRange(start, end)
    const spendingByCategory = aggregateCategorySpend(transactions)
    const totalIncome = transactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + transaction.amount, 0)

    return {
      spendingByCategory,
      totalIncome,
    }
  }

  getCache(key: string): CacheRow | null {
    const row = this.db
      .prepare('SELECT key, payload, created_at FROM ai_cache WHERE key = ?')
      .get(key) as CacheRow | undefined
    return row ?? null
  }

  setCache(key: string, payload: unknown) {
    this.db
      .prepare(`
        INSERT INTO ai_cache(key, payload, created_at)
        VALUES (@key, @payload, @createdAt)
        ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at
      `)
      .run({
        key,
        payload: JSON.stringify(payload),
        createdAt: new Date().toISOString(),
      })
  }

  exportAppState(): Pick<AppSnapshotPayload, 'settings' | 'transactions' | 'budgets' | 'aiCache'> {
    return {
      settings: this.getSettings(),
      transactions: this.getTransactions(),
      budgets: this.getAllBudgetRows(),
      aiCache: this.getAllCacheRows(),
    }
  }

  startFresh() {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM transactions').run()
      this.db.prepare('DELETE FROM budgets').run()
      this.db.prepare('DELETE FROM ai_cache').run()
    })()
  }

  replaceAppState(snapshot: Pick<AppSnapshotPayload, 'settings' | 'transactions' | 'budgets' | 'aiCache'>) {
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM transactions').run()
      this.db.prepare('DELETE FROM budgets').run()
      this.db.prepare('DELETE FROM ai_cache').run()
      this.db.prepare('DELETE FROM settings').run()

      const transactionInsert = this.db.prepare(`
        INSERT INTO transactions(id, amount, type, category, date, note, created_at)
        VALUES (@id, @amount, @type, @category, @date, @note, @createdAt)
      `)
      const budgetInsert = this.db.prepare(`
        INSERT INTO budgets(id, category, amount, month)
        VALUES (@id, @category, @amount, @month)
      `)
      const cacheInsert = this.db.prepare(`
        INSERT INTO ai_cache(key, payload, created_at)
        VALUES (@key, @payload, @createdAt)
      `)
      const settingsInsert = this.db.prepare(`
        INSERT INTO settings(key, value)
        VALUES (@key, @value)
      `)

      for (const transaction of snapshot.transactions) {
        transactionInsert.run({
          id: transaction.id,
          amount: transaction.amount,
          type: transaction.type,
          category: transaction.category,
          date: transaction.date,
          note: transaction.note,
          createdAt: transaction.createdAt,
        })
      }

      for (const budget of snapshot.budgets) {
        budgetInsert.run(budget)
      }

      for (const cacheRow of snapshot.aiCache) {
        cacheInsert.run(cacheRow)
      }

      const mergedSettings = { ...DEFAULT_SETTINGS, ...snapshot.settings }
      for (const key of SETTINGS_KEYS) {
        settingsInsert.run({ key, value: mergedSettings[key] })
      }
    })

    replace()
    this.seedDefaultSettings()
  }

  resetAllData() {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM transactions').run()
      this.db.prepare('DELETE FROM budgets').run()
      this.db.prepare('DELETE FROM ai_cache').run()
      this.db.prepare('DELETE FROM settings').run()
    })()
    this.seedDefaultSettings()
  }

  exportTransactionsCsv() {
    const header = ['id', 'date', 'category', 'type', 'amount', 'note', 'createdAt']
    const rows = this.getTransactions().map((transaction) =>
      [
        transaction.id,
        transaction.date,
        transaction.category,
        transaction.type,
        transaction.amount.toFixed(2),
        transaction.note ?? '',
        transaction.createdAt,
      ]
        .map(escapeCsv)
        .join(','),
    )

    return [header.join(','), ...rows].join('\n')
  }

  private getTransactionsInRange(start: Date, end: Date) {
    return this.getTransactions({
      from: toDateKey(start),
      to: toDateKey(end),
    })
  }

  private getBudgetRows(month: string) {
    return this.db
      .prepare('SELECT id, category, amount, month FROM budgets WHERE month = ? ORDER BY category ASC')
      .all(month) as BudgetRow[]
  }

  private getAllBudgetRows(): Budget[] {
    return this.db
      .prepare('SELECT id, category, amount, month FROM budgets ORDER BY month DESC, category ASC')
      .all() as Budget[]
  }

  private getAllCacheRows(): AICacheSnapshotEntry[] {
    const rows = this.db
      .prepare('SELECT key, payload, created_at FROM ai_cache ORDER BY created_at DESC')
      .all() as CacheRow[]

    return rows.map((row) => ({
      key: row.key,
      payload: row.payload,
      createdAt: row.created_at,
    }))
  }

  private seedDefaultSettings() {
    const upsert = this.db.prepare(`
      INSERT INTO settings(key, value)
      VALUES (@key, @value)
      ON CONFLICT(key) DO NOTHING
    `)

    const seedDefaults = this.db.transaction(() => {
      for (const key of SETTINGS_KEYS) {
        upsert.run({ key, value: DEFAULT_SETTINGS[key] })
      }

      const placeholders = SETTINGS_KEYS.map(() => '?').join(', ')
      this.db.prepare(`DELETE FROM settings WHERE key NOT IN (${placeholders})`).run(...SETTINGS_KEYS)
    })

    seedDefaults()
  }

  private getExpensesByCategory(month: string) {
    const [year, monthIndex] = month.split('-').map(Number)
    const start = new Date(Date.UTC(year, monthIndex - 1, 1))
    const end = new Date(Date.UTC(year, monthIndex, 0, 23, 59, 59, 999))
    const expenses = this.getTransactionsInRange(start, end).filter((transaction) => transaction.type === 'expense')
    return expenses.reduce((map, transaction) => {
      map.set(transaction.category, (map.get(transaction.category) ?? 0) + transaction.amount)
      return map
    }, new Map<string, number>())
  }

  private buildTrend(period: Period, count: number): TrendDatum[] {
    return buildBuckets(period, count).map((bucket) => {
      const transactions = this.getTransactionsInRange(bucket.start, bucket.end)
      return {
        label: bucket.label,
        income: transactions
          .filter((transaction) => transaction.type === 'income')
          .reduce((sum, transaction) => sum + transaction.amount, 0),
        spent: transactions
          .filter((transaction) => transaction.type === 'expense')
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      }
    })
  }

  private buildCategoryTrends(period: Period, count: number): CategoryTrendDatum[] {
    return buildBuckets(period, count).map((bucket) => {
      const data: CategoryTrendDatum = { label: bucket.label }
      const breakdown = aggregateCategorySpend(this.getTransactionsInRange(bucket.start, bucket.end))

      for (const item of breakdown) {
        data[item.category] = item.amount
      }

      return data
    })
  }
}

function buildSummary(transactions: Transaction[], budgetTotal: number): SummaryCardData {
  const totalIncome = transactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const totalSpent = transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const remainingBudget = budgetTotal > 0 ? budgetTotal - totalSpent : totalIncome - totalSpent
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpent) / totalIncome) * 100 : 0

  return {
    totalIncome,
    totalSpent,
    remainingBudget,
    savingsRate,
  }
}

function buildBuckets(period: Period, count: number): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  const now = new Date()

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    if (period === 'week') {
      const anchor = shiftDays(now, -offset * 7)
      const start = getWeekStart(anchor)
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59, 999))
      buckets.push({
        label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start,
        end,
      })
      continue
    }

    if (period === 'year') {
      const year = now.getUTCFullYear() - offset
      buckets.push({
        label: String(year),
        start: new Date(Date.UTC(year, 0, 1)),
        end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
      })
      continue
    }

    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    buckets.push({
      label: anchor.toLocaleDateString('en-US', { month: 'short' }),
      start: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)),
      end: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
    })
  }

  return buckets
}

function getCurrentPeriod(period: Period) {
  const now = new Date()

  if (period === 'week') {
    const start = getWeekStart(now)
    return {
      start,
      end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6, 23, 59, 59, 999)),
      monthKey: monthKey(now),
    }
  }

  if (period === 'year') {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
      end: new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999)),
      monthKey: monthKey(now),
    }
  }

  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
    monthKey: monthKey(now),
  }
}

function aggregateCategorySpend(transactions: Transaction[]): CategorySpendDatum[] {
  const totals = new Map<string, number>()

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount)
  }

  return Array.from(totals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      color: CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other,
    }))
    .sort((left, right) => right.amount - left.amount)
}

function toBudgetProgress(budget: BudgetRow, spent: number): BudgetProgress {
  const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0

  let status: BudgetProgress['status'] = 'healthy'
  if (percentage >= 100) status = 'danger'
  else if (percentage >= 80) status = 'warning'

  return {
    ...budget,
    spent,
    remaining: budget.amount - spent,
    percentage,
    status,
  }
}

function getWeekStart(reference: Date) {
  const day = reference.getUTCDay()
  const difference = day === 0 ? -6 : 1 - day
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() + difference))
}

function shiftDays(reference: Date, days: number) {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate() + days))
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function toDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function escapeCsv(value: string) {
  return `"${value.split('"').join('""')}"`
}

function getTransactionSortColumn(sortBy: TransactionSortField | undefined) {
  switch (sortBy) {
    case 'amount':
      return 'amount'
    case 'category':
      return 'category'
    case 'type':
      return 'type'
    case 'note':
      return 'COALESCE(note, \'\')'
    case 'date':
    default:
      return 'date'
  }
}
