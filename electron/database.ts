import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { BUDGET_CATEGORIES, CATEGORY_COLORS, DEFAULT_SETTINGS, INCOME_SOURCES, SETTINGS_KEYS } from '../shared/constants'
import { normalizeFreeformText, normalizePayee } from '../shared/payees'
import { sanitizeSettingsForSnapshot } from '../shared/snapshot'
import type {
  AICacheSnapshotEntry,
  AnalyticsData,
  AppSettings,
  AppSnapshotPayload,
  Budget,
  BudgetInput,
  BudgetProgress,
  BudgetTemplate,
  BudgetTemplateInput,
  BudgetsPayload,
  CategorySpendDatum,
  CategoryTrendDatum,
  CsvImportCommitSummary,
  CsvImportPreviewRequest,
  CsvImportPreviewResult,
  CsvImportPreviewRow,
  DashboardData,
  IncomeSource,
  PayeeRule,
  PayeeRuleInput,
  Period,
  RecurringSyncSummary,
  RecurringTransaction,
  RecurringTransactionInput,
  SummaryCardData,
  TopExpenseDatum,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionSortField,
  TransactionType,
  TrendDatum,
} from '../shared/types'
import { parseCsv, readCsvFile } from './csv'

type SettingsRow = { key: keyof AppSettings; value: string }
type BudgetRow = { id: string; category: string; amount: number; month: string }
type CacheRow = { key: string; payload: string; created_at: string }
type TransactionRow = {
  id: string
  amount: number
  type: TransactionType
  category: string | null
  income_source: IncomeSource | null
  payee: string | null
  date: string
  note: string | null
  recurring_transaction_id: string | null
  created_at: string
}
type RecurringTransactionRow = {
  id: string
  payee: string
  amount: number
  type: TransactionType
  category: string | null
  income_source: IncomeSource | null
  note: string | null
  day_of_month: number
  start_month: string
  last_posted_month: string | null
  active: number
  created_at: string
  updated_at: string
}
type BudgetTemplateRow = {
  id: string
  category: string
  amount: number
  active: number
  created_at: string
  updated_at: string
}
type PayeeRuleRow = {
  id: string
  normalized_payee: string
  payee_display: string
  category: string
  created_at: string
  updated_at: string
}

interface PeriodBucket {
  label: string
  start: Date
  end: Date
}

interface TableColumnInfo {
  name: string
  notnull: number
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

  close() {
    this.db.close()
  }

  private initialize() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL CHECK(amount > 0),
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category TEXT,
        income_source TEXT,
        payee TEXT,
        date TEXT NOT NULL,
        note TEXT,
        recurring_transaction_id TEXT,
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

      CREATE TABLE IF NOT EXISTS recurring_transactions (
        id TEXT PRIMARY KEY,
        payee TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category TEXT,
        income_source TEXT,
        note TEXT,
        day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
        start_month TEXT NOT NULL,
        last_posted_month TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS budget_templates (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL UNIQUE,
        amount REAL NOT NULL CHECK(amount > 0),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payee_rules (
        id TEXT PRIMARY KEY,
        normalized_payee TEXT NOT NULL UNIQUE,
        payee_display TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    this.migrateTransactionsTable()
    this.migrateRecurringTransactionsTable()
    this.createTransactionIndexes()
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
    this.syncRecurringTransactions()
    return this.queryTransactions(filters)
  }

  private queryTransactions(filters: TransactionFilters = {}): Transaction[] {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}

    if (filters.search) {
      clauses.push(
        "(LOWER(COALESCE(category, '')) LIKE @search OR LOWER(COALESCE(income_source, '')) LIKE @search OR LOWER(COALESCE(note, '')) LIKE @search OR LOWER(COALESCE(payee, '')) LIKE @search)",
      )
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

    if (filters.incomeSource && filters.incomeSource !== 'all' && filters.type !== 'expense') {
      clauses.push('income_source = @incomeSource')
      params.incomeSource = filters.incomeSource
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
          SELECT id, amount, type, category, income_source, payee, date, note, recurring_transaction_id, created_at
          FROM transactions
          ${where}
          ORDER BY ${sortColumn} ${sortDirection}, created_at DESC
        `,
      )
      .all(params) as TransactionRow[]

    return rows.map(mapTransactionRow)
  }

  addTransaction(input: TransactionInput): Transaction {
    return this.insertTransaction(normalizeTransactionInput(input))
  }

  updateTransaction(id: string, input: TransactionInput): Transaction {
    const normalized = normalizeTransactionInput(input)

    this.db
      .prepare(
        `
        UPDATE transactions
        SET amount = @amount,
            type = @type,
            category = @category,
            income_source = @incomeSource,
            payee = @payee,
            date = @date,
            note = @note
        WHERE id = @id
      `,
      )
      .run({
        id,
        amount: normalized.amount,
        type: normalized.type,
        category: normalized.category,
        incomeSource: normalized.incomeSource,
        payee: normalized.payee?.trim() || null,
        date: normalized.date,
        note: normalized.note?.trim() || null,
      })

    const row = this.db
      .prepare(`
        SELECT id, amount, type, category, income_source, payee, date, note, recurring_transaction_id, created_at
        FROM transactions
        WHERE id = ?
      `)
      .get(id) as TransactionRow | undefined

    if (!row) throw new Error('Transaction not found.')

    return mapTransactionRow(row)
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
    this.applyBudgetTemplates(month)

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

  getBudgetTemplates(): BudgetTemplate[] {
    return this.getAllBudgetTemplateRows()
  }

  saveBudgetTemplate(input: BudgetTemplateInput): BudgetTemplate {
    const now = new Date().toISOString()

    if (input.id) {
      this.db
        .prepare(`
          UPDATE budget_templates
          SET category = @category,
              amount = @amount,
              active = @active,
              updated_at = @updatedAt
          WHERE id = @id
        `)
        .run({
          id: input.id,
          category: input.category,
          amount: input.amount,
          active: input.active ? 1 : 0,
          updatedAt: now,
        })
    } else {
      const existing = this.db
        .prepare('SELECT id FROM budget_templates WHERE category = ?')
        .get(input.category) as { id: string } | undefined

      if (existing) {
        this.db
          .prepare(`
            UPDATE budget_templates
            SET amount = @amount,
                active = @active,
                updated_at = @updatedAt
            WHERE id = @id
          `)
          .run({
            id: existing.id,
            amount: input.amount,
            active: input.active ? 1 : 0,
            updatedAt: now,
          })
      } else {
        this.db
          .prepare(`
            INSERT INTO budget_templates(id, category, amount, active, created_at, updated_at)
            VALUES (@id, @category, @amount, @active, @createdAt, @updatedAt)
          `)
          .run({
            id: randomUUID(),
            category: input.category,
            amount: input.amount,
            active: input.active ? 1 : 0,
            createdAt: now,
            updatedAt: now,
          })
      }
    }

    const row = this.db
      .prepare('SELECT id, category, amount, active, created_at, updated_at FROM budget_templates WHERE category = ?')
      .get(input.category) as BudgetTemplateRow | undefined

    if (!row) {
      throw new Error('Budget template could not be saved.')
    }

    return mapBudgetTemplateRow(row)
  }

  deleteBudgetTemplate(id: string) {
    this.db.prepare('DELETE FROM budget_templates WHERE id = ?').run(id)
  }

  applyBudgetTemplates(month: string): BudgetsPayload {
    const templates = this.db
      .prepare('SELECT id, category, amount, active, created_at, updated_at FROM budget_templates WHERE active = 1 ORDER BY category ASC')
      .all() as BudgetTemplateRow[]

    this.db.transaction(() => {
      for (const template of templates) {
        const existing = this.db
          .prepare('SELECT id FROM budgets WHERE category = ? AND month = ?')
          .get(template.category, month) as { id: string } | undefined

        if (!existing) {
          this.db
            .prepare('INSERT INTO budgets(id, category, amount, month) VALUES (?, ?, ?, ?)')
            .run(randomUUID(), template.category, template.amount, month)
        }
      }
    })()

    return this.getBudgetsWithoutApplying(month)
  }

  saveMonthAsBudgetTemplates(month: string): BudgetTemplate[] {
    const budgets = this.getBudgetRows(month)
    const now = new Date().toISOString()

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM budget_templates').run()
      const insert = this.db.prepare(`
        INSERT INTO budget_templates(id, category, amount, active, created_at, updated_at)
        VALUES (@id, @category, @amount, 1, @createdAt, @updatedAt)
      `)

      for (const budget of budgets) {
        insert.run({
          id: randomUUID(),
          category: budget.category,
          amount: budget.amount,
          createdAt: now,
          updatedAt: now,
        })
      }
    })()

    return this.getBudgetTemplates()
  }

  getRecurringTransactions(): RecurringTransaction[] {
    return this.getAllRecurringTransactionRows()
  }

  saveRecurringTransaction(input: RecurringTransactionInput): RecurringTransaction {
    const now = new Date().toISOString()
    const normalized = normalizeRecurringTransactionInput(input)
    const payload = {
      id: normalized.id ?? randomUUID(),
      payee: normalized.payee.trim(),
      amount: normalized.amount,
      type: normalized.type,
      category: normalized.category,
      incomeSource: normalized.incomeSource,
      note: normalized.note?.trim() || null,
      dayOfMonth: normalized.dayOfMonth,
      startMonth: normalized.startMonth,
      active: normalized.active ? 1 : 0,
      updatedAt: now,
    }

    if (input.id) {
      this.db
        .prepare(`
          UPDATE recurring_transactions
          SET payee = @payee,
              amount = @amount,
              type = @type,
              category = @category,
              income_source = @incomeSource,
              note = @note,
              day_of_month = @dayOfMonth,
              start_month = @startMonth,
              active = @active,
              updated_at = @updatedAt
          WHERE id = @id
        `)
        .run(payload)
    } else {
      this.db
        .prepare(`
          INSERT INTO recurring_transactions(
            id, payee, amount, type, category, income_source, note, day_of_month, start_month, last_posted_month, active, created_at, updated_at
          )
          VALUES (@id, @payee, @amount, @type, @category, @incomeSource, @note, @dayOfMonth, @startMonth, NULL, @active, @updatedAt, @updatedAt)
        `)
        .run(payload)
    }

    const row = this.db
      .prepare(`
        SELECT id, payee, amount, type, category, income_source, note, day_of_month, start_month, last_posted_month, active, created_at, updated_at
        FROM recurring_transactions
        WHERE id = ?
      `)
      .get(payload.id) as RecurringTransactionRow | undefined

    if (!row) {
      throw new Error('Recurring transaction could not be saved.')
    }

    return mapRecurringTransactionRow(row)
  }

  deleteRecurringTransaction(id: string) {
    this.db.prepare('DELETE FROM recurring_transactions WHERE id = ?').run(id)
  }

  syncRecurringTransactions(referenceDate = new Date()): RecurringSyncSummary {
    const month = `${referenceDate.getUTCFullYear()}-${String(referenceDate.getUTCMonth() + 1).padStart(2, '0')}`
    const day = referenceDate.getUTCDate()
    const recurringTransactions = this.db
      .prepare(`
        SELECT id, payee, amount, type, category, income_source, note, day_of_month, start_month, last_posted_month, active, created_at, updated_at
        FROM recurring_transactions
        WHERE active = 1
        ORDER BY created_at ASC
      `)
      .all() as RecurringTransactionRow[]

    let createdCount = 0

    this.db.transaction(() => {
      for (const recurring of recurringTransactions) {
        if (month < recurring.start_month || recurring.last_posted_month === month || day < recurring.day_of_month) {
          continue
        }

        const transactionDate = getRecurringDateForMonth(month, recurring.day_of_month)
        const existing = this.db
          .prepare('SELECT id FROM transactions WHERE recurring_transaction_id = ? AND date = ?')
          .get(recurring.id, transactionDate) as { id: string } | undefined

        if (!existing) {
          this.insertTransaction(
            {
              amount: recurring.amount,
              type: recurring.type,
              category: recurring.category,
              incomeSource: recurring.income_source,
              payee: recurring.payee,
              date: transactionDate,
              note: recurring.note ?? '',
            },
            recurring.id,
          )
          createdCount += 1
        }

        this.db
          .prepare('UPDATE recurring_transactions SET last_posted_month = ?, updated_at = ? WHERE id = ?')
          .run(month, new Date().toISOString(), recurring.id)
      }
    })()

    return { month, createdCount }
  }

  getPayeeRules(search = ''): PayeeRule[] {
    const query = search.trim().toLowerCase()
    const rows = query
      ? (this.db
          .prepare(`
            SELECT id, normalized_payee, payee_display, category, created_at, updated_at
            FROM payee_rules
            WHERE LOWER(payee_display) LIKE ?
            ORDER BY payee_display ASC
          `)
          .all(`%${query}%`) as PayeeRuleRow[])
      : (this.db
          .prepare(`
            SELECT id, normalized_payee, payee_display, category, created_at, updated_at
            FROM payee_rules
            ORDER BY payee_display ASC
          `)
          .all() as PayeeRuleRow[])

    return rows.map(mapPayeeRuleRow)
  }

  upsertPayeeRule(input: PayeeRuleInput): PayeeRule {
    const payee = input.payee.trim()
    const normalized = normalizePayee(payee)

    if (!normalized) {
      throw new Error('Payee cannot be empty.')
    }

    const now = new Date().toISOString()
    const existing = this.db
      .prepare('SELECT id FROM payee_rules WHERE normalized_payee = ?')
      .get(normalized) as { id: string } | undefined

    if (existing) {
      this.db
        .prepare('UPDATE payee_rules SET payee_display = ?, category = ?, updated_at = ? WHERE id = ?')
        .run(payee, input.category, now, existing.id)
    } else {
      this.db
        .prepare(`
          INSERT INTO payee_rules(id, normalized_payee, payee_display, category, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(randomUUID(), normalized, payee, input.category, now, now)
    }

    const row = this.db
      .prepare(`
        SELECT id, normalized_payee, payee_display, category, created_at, updated_at
        FROM payee_rules
        WHERE normalized_payee = ?
      `)
      .get(normalized) as PayeeRuleRow | undefined

    if (!row) {
      throw new Error('Payee rule could not be saved.')
    }

    return mapPayeeRuleRow(row)
  }

  deletePayeeRule(id: string) {
    this.db.prepare('DELETE FROM payee_rules WHERE id = ?').run(id)
  }

  findPayeeRule(payee: string): PayeeRule | null {
    const normalized = normalizePayee(payee)
    if (!normalized) {
      return null
    }

    const row = this.db
      .prepare(`
        SELECT id, normalized_payee, payee_display, category, created_at, updated_at
        FROM payee_rules
        WHERE normalized_payee = ?
      `)
      .get(normalized) as PayeeRuleRow | undefined

    return row ? mapPayeeRuleRow(row) : null
  }

  previewTransactionCsvImport(request: CsvImportPreviewRequest): CsvImportPreviewResult {
    const { fileName, headers, rows } = readCsvPreviewFile(request.filePath)
    const signatures = new Set(this.queryTransactions().map((transaction) => buildTransactionSignature(transaction)))

    const previewRows = rows.map((values, index) => {
      const source = buildCsvSource(headers, values)
      const parsed = this.parseCsvRow(source, request)

      if (!parsed.transaction) {
        return {
          rowNumber: index + 2,
          status: 'invalid',
          errors: parsed.errors,
          source,
          transaction: null,
        } satisfies CsvImportPreviewRow
      }

      const signature = buildTransactionSignature(parsed.transaction)
      if (signatures.has(signature)) {
        return {
          rowNumber: index + 2,
          status: 'duplicate',
          errors: [],
          source,
          transaction: parsed.transaction,
        } satisfies CsvImportPreviewRow
      }

      signatures.add(signature)

      return {
        rowNumber: index + 2,
        status: parsed.status,
        errors: [],
        source,
        transaction: parsed.transaction,
      } satisfies CsvImportPreviewRow
    })

    return { fileName, rows: previewRows }
  }

  commitTransactionCsvImport(request: CsvImportPreviewRequest): CsvImportCommitSummary {
    const preview = this.previewTransactionCsvImport(request)
    let insertedCount = 0
    let skippedDuplicateCount = 0
    let invalidCount = 0
    const learnedRules = new Set<string>()

    this.db.transaction(() => {
      for (const row of preview.rows) {
        if (row.status === 'duplicate') {
          skippedDuplicateCount += 1
          continue
        }

        if (row.status === 'invalid' || !row.transaction) {
          invalidCount += 1
          continue
        }

        this.insertTransaction(row.transaction)
        insertedCount += 1

        if (request.learnRules && row.transaction.type === 'expense' && row.transaction.payee?.trim() && row.transaction.category) {
          this.upsertPayeeRule({
            payee: row.transaction.payee,
            category: row.transaction.category,
          })
          learnedRules.add(normalizePayee(row.transaction.payee))
        }
      }
    })()

    return {
      insertedCount,
      skippedDuplicateCount,
      invalidCount,
      learnedRuleCount: learnedRules.size,
    }
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
      recentTransactions: this.queryTransactions().slice(0, 10),
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
          category: transaction.category ?? 'Other',
          payee: transaction.payee,
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

  exportAppState(): Pick<
    AppSnapshotPayload,
    'settings' | 'transactions' | 'budgets' | 'aiCache' | 'recurringTransactions' | 'budgetTemplates' | 'payeeRules'
  > {
    return {
      settings: sanitizeSettingsForSnapshot(this.getSettings()),
      transactions: this.queryTransactions(),
      budgets: this.getAllBudgetRows(),
      aiCache: this.getAllCacheRows(),
      recurringTransactions: this.getAllRecurringTransactionRows(),
      budgetTemplates: this.getAllBudgetTemplateRows(),
      payeeRules: this.getAllPayeeRuleRows(),
    }
  }

  startFresh() {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM transactions').run()
      this.db.prepare('DELETE FROM budgets').run()
      this.db.prepare('DELETE FROM ai_cache').run()
      this.db.prepare('DELETE FROM recurring_transactions').run()
      this.db.prepare('DELETE FROM budget_templates').run()
      this.db.prepare('DELETE FROM payee_rules').run()
    })()
  }

  replaceAppState(
    snapshot: Pick<
      AppSnapshotPayload,
      'settings' | 'transactions' | 'budgets' | 'aiCache' | 'recurringTransactions' | 'budgetTemplates' | 'payeeRules'
    >,
  ) {
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM transactions').run()
      this.db.prepare('DELETE FROM budgets').run()
      this.db.prepare('DELETE FROM ai_cache').run()
      this.db.prepare('DELETE FROM recurring_transactions').run()
      this.db.prepare('DELETE FROM budget_templates').run()
      this.db.prepare('DELETE FROM payee_rules').run()
      this.db.prepare('DELETE FROM settings').run()

      const transactionInsert = this.db.prepare(`
        INSERT INTO transactions(id, amount, type, category, income_source, payee, date, note, recurring_transaction_id, created_at)
        VALUES (@id, @amount, @type, @category, @incomeSource, @payee, @date, @note, @recurringTransactionId, @createdAt)
      `)
      const budgetInsert = this.db.prepare(`
        INSERT INTO budgets(id, category, amount, month)
        VALUES (@id, @category, @amount, @month)
      `)
      const cacheInsert = this.db.prepare(`
        INSERT INTO ai_cache(key, payload, created_at)
        VALUES (@key, @payload, @createdAt)
      `)
      const recurringInsert = this.db.prepare(`
        INSERT INTO recurring_transactions(id, payee, amount, type, category, income_source, note, day_of_month, start_month, last_posted_month, active, created_at, updated_at)
        VALUES (@id, @payee, @amount, @type, @category, @incomeSource, @note, @dayOfMonth, @startMonth, @lastPostedMonth, @active, @createdAt, @updatedAt)
      `)
      const budgetTemplateInsert = this.db.prepare(`
        INSERT INTO budget_templates(id, category, amount, active, created_at, updated_at)
        VALUES (@id, @category, @amount, @active, @createdAt, @updatedAt)
      `)
      const payeeRuleInsert = this.db.prepare(`
        INSERT INTO payee_rules(id, normalized_payee, payee_display, category, created_at, updated_at)
        VALUES (@id, @normalizedPayee, @payeeDisplay, @category, @createdAt, @updatedAt)
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
          incomeSource: transaction.incomeSource ?? null,
          payee: transaction.payee,
          date: transaction.date,
          note: transaction.note,
          recurringTransactionId: transaction.recurringTransactionId,
          createdAt: transaction.createdAt,
        })
      }

      for (const budget of snapshot.budgets) {
        budgetInsert.run(budget)
      }

      for (const cacheRow of snapshot.aiCache) {
        cacheInsert.run(cacheRow)
      }

      for (const recurring of snapshot.recurringTransactions ?? []) {
        recurringInsert.run({
          id: recurring.id,
          payee: recurring.payee,
          amount: recurring.amount,
          type: recurring.type,
          category: recurring.category,
          incomeSource: recurring.incomeSource ?? null,
          note: recurring.note,
          dayOfMonth: recurring.dayOfMonth,
          startMonth: recurring.startMonth,
          lastPostedMonth: recurring.lastPostedMonth,
          active: recurring.active ? 1 : 0,
          createdAt: recurring.createdAt,
          updatedAt: recurring.updatedAt,
        })
      }

      for (const template of snapshot.budgetTemplates ?? []) {
        budgetTemplateInsert.run({
          id: template.id,
          category: template.category,
          amount: template.amount,
          active: template.active ? 1 : 0,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        })
      }

      for (const rule of snapshot.payeeRules ?? []) {
        payeeRuleInsert.run(rule)
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
      this.db.prepare('DELETE FROM recurring_transactions').run()
      this.db.prepare('DELETE FROM budget_templates').run()
      this.db.prepare('DELETE FROM payee_rules').run()
      this.db.prepare('DELETE FROM settings').run()
    })()
    this.seedDefaultSettings()
  }

  exportTransactionsCsv() {
    const header = ['id', 'date', 'category', 'incomeSource', 'type', 'amount', 'payee', 'note', 'createdAt']
    const rows = this.queryTransactions().map((transaction) =>
      [
        transaction.id,
        transaction.date,
        transaction.category ?? '',
        transaction.incomeSource ?? '',
        transaction.type,
        transaction.amount.toFixed(2),
        transaction.payee ?? '',
        transaction.note ?? '',
        transaction.createdAt,
      ]
        .map(escapeCsv)
        .join(','),
    )

    return [header.join(','), ...rows].join('\n')
  }

  private getTransactionsInRange(start: Date, end: Date) {
    return this.queryTransactions({
      from: toDateKey(start),
      to: toDateKey(end),
    })
  }

  private getBudgetsWithoutApplying(month: string): BudgetsPayload {
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

  private insertTransaction(input: TransactionInput, recurringTransactionId: string | null = null): Transaction {
    const normalized = normalizeTransactionInput(input)
    const transaction: Transaction = {
      id: randomUUID(),
      amount: normalized.amount,
      type: normalized.type,
      category: normalized.category,
      incomeSource: normalized.incomeSource,
      payee: normalized.payee?.trim() || null,
      date: normalized.date,
      note: normalized.note?.trim() || null,
      recurringTransactionId,
      createdAt: new Date().toISOString(),
    }

    this.db
      .prepare(
        `
        INSERT INTO transactions(id, amount, type, category, income_source, payee, date, note, recurring_transaction_id, created_at)
        VALUES (@id, @amount, @type, @category, @incomeSource, @payee, @date, @note, @recurringTransactionId, @createdAt)
      `,
      )
      .run(transaction)

    return transaction
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

  private getAllRecurringTransactionRows(): RecurringTransaction[] {
    const rows = this.db
      .prepare(`
        SELECT id, payee, amount, type, category, income_source, note, day_of_month, start_month, last_posted_month, active, created_at, updated_at
        FROM recurring_transactions
        ORDER BY created_at DESC
      `)
      .all() as RecurringTransactionRow[]

    return rows.map(mapRecurringTransactionRow)
  }

  private getAllBudgetTemplateRows(): BudgetTemplate[] {
    const rows = this.db
      .prepare(`
        SELECT id, category, amount, active, created_at, updated_at
        FROM budget_templates
        ORDER BY category ASC
      `)
      .all() as BudgetTemplateRow[]

    return rows.map(mapBudgetTemplateRow)
  }

  private getAllPayeeRuleRows(): PayeeRule[] {
    const rows = this.db
      .prepare(`
        SELECT id, normalized_payee, payee_display, category, created_at, updated_at
        FROM payee_rules
        ORDER BY payee_display ASC
      `)
      .all() as PayeeRuleRow[]

    return rows.map(mapPayeeRuleRow)
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
      if (transaction.category) {
        map.set(transaction.category, (map.get(transaction.category) ?? 0) + transaction.amount)
      }
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

  private migrateTransactionsTable() {
    const columns = this.getTableColumns('transactions')
    const categoryColumn = columns.find((column) => column.name === 'category')
    const requiresRebuild =
      categoryColumn?.notnull === 1 ||
      !this.hasColumn(columns, 'payee') ||
      !this.hasColumn(columns, 'recurring_transaction_id') ||
      !this.hasColumn(columns, 'income_source')

    if (!requiresRebuild) {
      return
    }

    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE transactions_next (
          id TEXT PRIMARY KEY,
          amount REAL NOT NULL CHECK(amount > 0),
          type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
          category TEXT,
          income_source TEXT,
          payee TEXT,
          date TEXT NOT NULL,
          note TEXT,
          recurring_transaction_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `)

      this.db.exec(`
        INSERT INTO transactions_next(id, amount, type, category, income_source, payee, date, note, recurring_transaction_id, created_at)
        SELECT
          id,
          amount,
          type,
          category,
          ${this.hasColumn(columns, 'income_source') ? 'income_source' : 'NULL'},
          ${this.hasColumn(columns, 'payee') ? 'payee' : 'NULL'},
          date,
          note,
          ${this.hasColumn(columns, 'recurring_transaction_id') ? 'recurring_transaction_id' : 'NULL'},
          created_at
        FROM transactions;
      `)

      this.db.exec(`
        DROP TABLE transactions;
        ALTER TABLE transactions_next RENAME TO transactions;
      `)
    })()
  }

  private migrateRecurringTransactionsTable() {
    const columns = this.getTableColumns('recurring_transactions')
    const categoryColumn = columns.find((column) => column.name === 'category')
    const requiresRebuild = categoryColumn?.notnull === 1 || !this.hasColumn(columns, 'income_source')

    if (!requiresRebuild) {
      return
    }

    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE recurring_transactions_next (
          id TEXT PRIMARY KEY,
          payee TEXT NOT NULL,
          amount REAL NOT NULL CHECK(amount > 0),
          type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
          category TEXT,
          income_source TEXT,
          note TEXT,
          day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 31),
          start_month TEXT NOT NULL,
          last_posted_month TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)

      this.db.exec(`
        INSERT INTO recurring_transactions_next(
          id, payee, amount, type, category, income_source, note, day_of_month, start_month, last_posted_month, active, created_at, updated_at
        )
        SELECT
          id,
          payee,
          amount,
          type,
          category,
          ${this.hasColumn(columns, 'income_source') ? 'income_source' : 'NULL'},
          note,
          day_of_month,
          start_month,
          last_posted_month,
          active,
          created_at,
          updated_at
        FROM recurring_transactions;
      `)

      this.db.exec(`
        DROP TABLE recurring_transactions;
        ALTER TABLE recurring_transactions_next RENAME TO recurring_transactions;
      `)
    })()
  }

  private createTransactionIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(recurring_transaction_id) WHERE recurring_transaction_id IS NOT NULL;
    `)
  }

  private getTableColumns(tableName: string) {
    return this.db.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumnInfo[]
  }

  private hasColumn(columns: TableColumnInfo[], columnName: string) {
    return columns.some((column) => column.name === columnName)
  }

  private parseCsvRow(
    source: Record<string, string>,
    request: CsvImportPreviewRequest,
  ): { status: CsvImportPreviewRow['status']; errors: string[]; transaction: TransactionInput | null } {
    const errors: string[] = []
    const date = parseImportDate(source[request.mapping.date])
    if (!date) {
      errors.push('Invalid date')
    }

    const amountDetails = parseImportAmount(source[request.mapping.amount], request.amountMode, request.defaultExpenseType)
    if (!amountDetails) {
      errors.push('Invalid amount')
    }

    const type = request.mapping.type ? parseImportType(source[request.mapping.type]) : amountDetails?.type ?? null
    if (!type) {
      errors.push('Invalid type')
    }

    if (errors.length > 0 || !date || !amountDetails || !type) {
      return {
        status: 'invalid',
        errors,
        transaction: null,
      }
    }

    const payee = request.mapping.payee ? source[request.mapping.payee]?.trim() : ''
    const note = request.mapping.note ? source[request.mapping.note]?.trim() : ''
    const rawCategory = request.mapping.category ? source[request.mapping.category]?.trim() : ''
    const rawIncomeSource = request.mapping.incomeSource ? source[request.mapping.incomeSource]?.trim() : ''
    let status: CsvImportPreviewRow['status'] = 'ready'

    if (type === 'income') {
      const incomeSource = parseImportIncomeSource(rawIncomeSource) ?? 'Other'
      if (!parseImportIncomeSource(rawIncomeSource)) {
        status = 'defaulted'
      }

      return {
        status,
        errors: [],
        transaction: {
          amount: amountDetails.amount,
          type,
          category: null,
          incomeSource,
          payee,
          date,
          note,
        },
      }
    }

    let category = BUDGET_CATEGORIES.includes(rawCategory as (typeof BUDGET_CATEGORIES)[number]) ? rawCategory : ''

    if (!category && payee) {
      const rule = this.findPayeeRule(payee)
      if (rule) {
        category = rule.category
        status = 'rule-filled'
      }
    }

    if (!category) {
      category = 'Other'
      status = 'defaulted'
    }

    return {
      status,
      errors: [],
      transaction: {
        amount: amountDetails.amount,
        type,
        category,
        incomeSource: null,
        payee,
        date,
        note,
      },
    }
  }
}

function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type,
    category: row.category,
    incomeSource: row.income_source,
    payee: row.payee,
    date: row.date,
    note: row.note,
    recurringTransactionId: row.recurring_transaction_id,
    createdAt: row.created_at,
  }
}

function mapRecurringTransactionRow(row: RecurringTransactionRow): RecurringTransaction {
  return {
    id: row.id,
    payee: row.payee,
    amount: row.amount,
    type: row.type,
    category: row.category,
    incomeSource: row.income_source,
    note: row.note,
    dayOfMonth: row.day_of_month,
    startMonth: row.start_month,
    lastPostedMonth: row.last_posted_month,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBudgetTemplateRow(row: BudgetTemplateRow): BudgetTemplate {
  return {
    id: row.id,
    category: row.category,
    amount: row.amount,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPayeeRuleRow(row: PayeeRuleRow): PayeeRule {
  return {
    id: row.id,
    normalizedPayee: row.normalized_payee,
    payeeDisplay: row.payee_display,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function readCsvPreviewFile(filePath: string) {
  const parsed = parseCsv(readCsvFile(filePath))
  if (!parsed.length) {
    throw new Error('The selected CSV file is empty.')
  }

  return {
    fileName: path.basename(filePath),
    headers: parsed[0],
    rows: parsed.slice(1),
  }
}

function buildCsvSource(headers: string[], values: string[]) {
  return headers.reduce<Record<string, string>>((accumulator, header, index) => {
    accumulator[header] = values[index] ?? ''
    return accumulator
  }, {})
}

function parseImportDate(value: string | undefined) {
  if (!value?.trim()) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

function parseImportAmount(value: string | undefined, mode: CsvImportPreviewRequest['amountMode'], defaultExpenseType: TransactionType) {
  const normalized = value
    ?.trim()
    .replace(/[^\d,.\-]/g, '')
    .replace(/,(?=\d{3}\b)/g, '')
    .replace(/,(?=\d{1,2}$)/, '.')

  const parsed = Number(normalized)
  if (!normalized || Number.isNaN(parsed) || parsed === 0) {
    return null
  }

  if (mode === 'signed') {
    return {
      amount: Math.abs(parsed),
      type: parsed < 0 ? 'expense' : 'income',
    } satisfies { amount: number; type: TransactionType }
  }

  return {
    amount: Math.abs(parsed),
    type: defaultExpenseType,
  } satisfies { amount: number; type: TransactionType }
}

function parseImportType(value: string | undefined): TransactionType | null {
  const normalized = value?.trim().toLowerCase() ?? ''

  if (['expense', 'debit', 'withdrawal', 'payment', 'charge'].includes(normalized)) {
    return 'expense'
  }

  if (['income', 'credit', 'deposit', 'refund'].includes(normalized)) {
    return 'income'
  }

  return null
}

function parseImportIncomeSource(value: string | undefined): IncomeSource | null {
  const normalized = value?.trim().toLowerCase() ?? ''
  if (!normalized) {
    return null
  }

  const match = INCOME_SOURCES.find((source) => source.toLowerCase() === normalized)
  return match ?? null
}

function normalizeTransactionInput(input: TransactionInput): TransactionInput & { category: string | null; incomeSource: IncomeSource | null } {
  if (input.type === 'income') {
    if (!input.incomeSource) {
      throw new Error('Income source is required for income transactions.')
    }

    return {
      ...input,
      category: null,
      incomeSource: input.incomeSource,
    }
  }

  if (!input.category) {
    throw new Error('Category is required for expense transactions.')
  }

  return {
    ...input,
    category: input.category,
    incomeSource: null,
  }
}

function normalizeRecurringTransactionInput(
  input: RecurringTransactionInput,
): RecurringTransactionInput & { category: string | null; incomeSource: IncomeSource | null } {
  if (input.type === 'income') {
    if (!input.incomeSource) {
      throw new Error('Income source is required for recurring income transactions.')
    }

    return {
      ...input,
      category: null,
      incomeSource: input.incomeSource,
    }
  }

  if (!input.category) {
    throw new Error('Category is required for recurring expense transactions.')
  }

  return {
    ...input,
    category: input.category,
    incomeSource: null,
  }
}

function buildTransactionSignature(transaction: {
  date: string
  amount: number
  type: TransactionType
  payee?: string | null
  note?: string | null
}) {
  return [
    transaction.date,
    transaction.type,
    transaction.amount.toFixed(2),
    normalizePayee(transaction.payee),
    normalizeFreeformText(transaction.note),
  ].join('|')
}

function getRecurringDateForMonth(month: string, dayOfMonth: number) {
  const [year, monthIndex] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
  return `${month}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, '0')}`
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
    if (transaction.type !== 'expense' || !transaction.category) continue
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
    case 'payee':
      return 'COALESCE(payee, \'\')'
    case 'type':
      return 'type'
    case 'note':
      return 'COALESCE(note, \'\')'
    case 'date':
    default:
      return 'date'
  }
}
