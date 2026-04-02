// @vitest-environment node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { DatabaseManager } from './database'

const tempDirectories: string[] = []
const managers: DatabaseManager[] = []

afterEach(() => {
  while (managers.length) {
    const manager = managers.pop()
    manager?.close()
  }

  while (tempDirectories.length) {
    const directory = tempDirectories.pop()
    if (directory && fs.existsSync(directory)) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
})

function createManager() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'budgeter-db-'))
  tempDirectories.push(directory)
  const manager = new DatabaseManager(directory)
  managers.push(manager)
  return { directory, manager }
}

describe('DatabaseManager migrations', () => {
  it('adds payee and recurring columns to an existing transactions table without losing rows', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'budgeter-db-legacy-'))
    tempDirectories.push(directory)
    const sqlite = new Database(path.join(directory, 'budgeter.sqlite'))

    sqlite.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO transactions(id, amount, type, category, date, note, created_at)
      VALUES ('legacy-1', 42.5, 'expense', 'Food & Dining', '2026-04-03', 'legacy note', '2026-04-03T12:00:00.000Z');
      CREATE TABLE budgets (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        month TEXT NOT NULL
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE ai_cache (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    sqlite.close()

    const manager = new DatabaseManager(directory)
    managers.push(manager)
    const transactions = manager.getTransactions()
    const migrated = new Database(path.join(directory, 'budgeter.sqlite'))
    const columns = migrated.prepare(`PRAGMA table_info(transactions)`).all() as Array<{ name: string }>

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['payee', 'recurring_transaction_id']),
    )
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({
      id: 'legacy-1',
      amount: 42.5,
      payee: null,
      note: 'legacy note',
    })

    migrated.close()
  })

  it('adds income_source and allows null categories for income rows', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'budgeter-db-legacy-income-'))
    tempDirectories.push(directory)
    const sqlite = new Database(path.join(directory, 'budgeter.sqlite'))

    sqlite.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO transactions(id, amount, type, category, date, note, created_at)
      VALUES ('legacy-income', 4200, 'income', 'Savings', '2026-04-03', 'legacy income', '2026-04-03T12:00:00.000Z');
      CREATE TABLE budgets (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        month TEXT NOT NULL
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE ai_cache (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    sqlite.close()

    const manager = new DatabaseManager(directory)
    managers.push(manager)

    const transaction = manager.addTransaction({
      amount: 5100,
      type: 'income',
      category: 'Savings',
      incomeSource: 'Salary',
      payee: 'Employer',
      date: '2026-04-04',
      note: '',
    } as any)

    const migrated = new Database(path.join(directory, 'budgeter.sqlite'))
    const columns = migrated.prepare(`PRAGMA table_info(transactions)`).all() as Array<{
      name: string
      notnull: number
    }>
    const categoryColumn = columns.find((column) => column.name === 'category')

    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['payee', 'recurring_transaction_id', 'income_source']),
    )
    expect(categoryColumn?.notnull).toBe(0)
    expect(manager.getTransactions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-income',
          category: 'Savings',
          incomeSource: null,
        }),
        expect.objectContaining({
          id: transaction.id,
          type: 'income',
          category: null,
          incomeSource: 'Salary',
        }),
      ]),
    )

    migrated.close()
  })
})

describe('DatabaseManager recurring transactions', () => {
  it('materializes due monthly recurring transactions exactly once per month', () => {
    const { manager } = createManager()

    manager.saveRecurringTransaction({
      payee: 'Landlord',
      amount: 1200,
      type: 'expense',
      category: 'Rent/Housing',
      note: 'Monthly rent',
      dayOfMonth: 5,
      startMonth: '2026-04',
      active: true,
    })

    manager.syncRecurringTransactions(new Date('2026-04-10T09:00:00.000Z'))
    manager.syncRecurringTransactions(new Date('2026-04-20T09:00:00.000Z'))
    const aprilTransactions = manager.getTransactions({ from: '2026-04-01', to: '2026-04-30' })
    const recurring = manager.getRecurringTransactions()

    expect(aprilTransactions).toHaveLength(1)
    expect(aprilTransactions[0]).toMatchObject({
      payee: 'Landlord',
      category: 'Rent/Housing',
      recurringTransactionId: recurring[0].id,
    })
    expect(recurring[0].lastPostedMonth).toBe('2026-04')
  })

  it('preserves incomeSource and clears category when recurring income transactions post', () => {
    const { manager } = createManager()

    const recurring = manager.saveRecurringTransaction({
      payee: 'Employer',
      amount: 3200,
      type: 'income',
      category: 'Savings',
      incomeSource: 'Salary',
      note: 'Payroll',
      dayOfMonth: 2,
      startMonth: '2026-04',
      active: true,
    } as any)

    manager.syncRecurringTransactions(new Date('2026-04-10T09:00:00.000Z'))

    const aprilTransactions = manager.getTransactions({ from: '2026-04-01', to: '2026-04-30' })

    expect(aprilTransactions).toEqual([
      expect.objectContaining({
        payee: 'Employer',
        type: 'income',
        category: null,
        incomeSource: 'Salary',
        recurringTransactionId: recurring.id,
      }),
    ])
  })
})

describe('DatabaseManager budget templates', () => {
  it('auto-applies active templates without overwriting existing month budgets', () => {
    const { manager } = createManager()

    manager.saveBudgetTemplate({ category: 'Food & Dining', amount: 500, active: true })
    manager.saveBudgetTemplate({ category: 'Transport', amount: 120, active: true })
    manager.setBudget({ category: 'Food & Dining', amount: 620, month: '2026-05' })

    const mayBudgets = manager.getBudgets('2026-05')
    const categories = mayBudgets.budgets.map((budget) => [budget.category, budget.amount])

    expect(categories).toEqual(
      expect.arrayContaining([
        ['Food & Dining', 620],
        ['Transport', 120],
      ]),
    )
  })
})

describe('DatabaseManager CSV import and payee rules', () => {
  it('previews duplicates, defaults missing categories, and learns payee rules on commit', () => {
    const { directory, manager } = createManager()
    const csvPath = path.join(directory, 'import.csv')

    manager.addTransaction({
      amount: 25,
      type: 'expense',
      category: 'Food & Dining',
      payee: 'Coffee Lab',
      date: '2026-04-02',
      note: 'Latte',
    })
    manager.upsertPayeeRule({ payee: 'Metro Pass', category: 'Transport' })

    fs.writeFileSync(
      csvPath,
      [
        'Date,Amount,Payee,Note',
        '2026-04-02,-25.00,Coffee Lab,Latte',
        '2026-04-03,-12.50,Metro Pass,Monthly card',
        '2026-04-04,-8.00,Unknown Merchant,',
      ].join('\n'),
      'utf8',
    )

    const preview = manager.previewTransactionCsvImport({
      filePath: csvPath,
      mapping: {
        date: 'Date',
        amount: 'Amount',
        payee: 'Payee',
        note: 'Note',
      },
      amountMode: 'signed',
      defaultExpenseType: 'expense',
      learnRules: true,
    })

    expect(preview.rows.map((row) => row.status)).toEqual(['duplicate', 'rule-filled', 'defaulted'])
    expect(preview.rows[1].transaction).toMatchObject({ category: 'Transport', payee: 'Metro Pass' })
    expect(preview.rows[2].transaction).toMatchObject({ category: 'Other', payee: 'Unknown Merchant' })

    const summary = manager.commitTransactionCsvImport({
      filePath: csvPath,
      mapping: {
        date: 'Date',
        amount: 'Amount',
        payee: 'Payee',
        note: 'Note',
      },
      amountMode: 'signed',
      defaultExpenseType: 'expense',
      learnRules: true,
    })

    expect(summary).toMatchObject({
      insertedCount: 2,
      skippedDuplicateCount: 1,
      invalidCount: 0,
      learnedRuleCount: 2,
    })

    expect(manager.findPayeeRule('Unknown Merchant')).toMatchObject({ category: 'Other' })
  })

  it('maps income sources, defaults missing income sources, and only learns expense payee rules', () => {
    const { directory, manager } = createManager()
    const csvPath = path.join(directory, 'income-import.csv')

    fs.writeFileSync(
      csvPath,
      [
        'Date,Amount,Payee,IncomeType',
        '2026-04-02,3000.00,Employer,Salary',
        '2026-04-03,250.00,Benefits Card,',
        '2026-04-04,-18.00,Lunch Spot,',
      ].join('\n'),
      'utf8',
    )

    const preview = manager.previewTransactionCsvImport({
      filePath: csvPath,
      mapping: {
        date: 'Date',
        amount: 'Amount',
        payee: 'Payee',
        incomeSource: 'IncomeType',
      } as any,
      amountMode: 'signed',
      defaultExpenseType: 'expense',
      learnRules: true,
    } as any)

    expect(preview.rows.map((row) => row.transaction)).toEqual([
      expect.objectContaining({
        type: 'income',
        category: null,
        incomeSource: 'Salary',
      }),
      expect.objectContaining({
        type: 'income',
        category: null,
        incomeSource: 'Other',
      }),
      expect.objectContaining({
        type: 'expense',
        category: 'Other',
        incomeSource: null,
      }),
    ])

    const summary = manager.commitTransactionCsvImport({
      filePath: csvPath,
      mapping: {
        date: 'Date',
        amount: 'Amount',
        payee: 'Payee',
        incomeSource: 'IncomeType',
      } as any,
      amountMode: 'signed',
      defaultExpenseType: 'expense',
      learnRules: true,
    } as any)

    expect(summary).toMatchObject({
      insertedCount: 3,
      skippedDuplicateCount: 0,
      invalidCount: 0,
      learnedRuleCount: 1,
    })
    expect(manager.findPayeeRule('Employer')).toBeNull()
    expect(manager.findPayeeRule('Benefits Card')).toBeNull()
    expect(manager.findPayeeRule('Lunch Spot')).toMatchObject({ category: 'Other' })
  })
})

describe('DatabaseManager transaction normalization and snapshots', () => {
  it('normalizes income and expense fields on add and update', () => {
    const { manager } = createManager()

    const income = manager.addTransaction({
      amount: 4000,
      type: 'income',
      category: 'Savings',
      incomeSource: 'Bonus',
      payee: 'Employer',
      date: '2026-04-02',
      note: '',
    } as any)

    expect(income).toMatchObject({
      type: 'income',
      category: null,
      incomeSource: 'Bonus',
    })

    const expense = manager.updateTransaction(income.id, {
      amount: 55,
      type: 'expense',
      category: 'Food & Dining',
      incomeSource: 'Gift',
      payee: 'Cafe',
      date: '2026-04-03',
      note: '',
    } as any)

    expect(expense).toMatchObject({
      type: 'expense',
      category: 'Food & Dining',
      incomeSource: null,
    })

    const incomeAgain = manager.updateTransaction(expense.id, {
      amount: 1200,
      type: 'income',
      category: 'Savings',
      incomeSource: 'Gift',
      payee: 'Family',
      date: '2026-04-04',
      note: '',
    } as any)

    expect(incomeAgain).toMatchObject({
      type: 'income',
      category: null,
      incomeSource: 'Gift',
    })
  })

  it('restores old and new snapshot transaction shapes with income sources intact', () => {
    const { manager } = createManager()

    manager.replaceAppState({
      settings: manager.getSettings(),
      transactions: [
        {
          id: 'legacy-income',
          amount: 1500,
          type: 'income',
          category: 'Savings',
          payee: 'Legacy Employer',
          date: '2026-04-01',
          note: null,
          recurringTransactionId: null,
          createdAt: '2026-04-01T10:00:00.000Z',
        },
        {
          id: 'new-income',
          amount: 900,
          type: 'income',
          category: null,
          incomeSource: 'Gift',
          payee: 'Family',
          date: '2026-04-02',
          note: null,
          recurringTransactionId: null,
          createdAt: '2026-04-02T10:00:00.000Z',
        },
      ] as any,
      budgets: [],
      aiCache: [],
      recurringTransactions: [
        {
          id: 'legacy-recurring',
          payee: 'Employer',
          amount: 3000,
          type: 'income',
          category: 'Savings',
          note: null,
          dayOfMonth: 5,
          startMonth: '2026-04',
          lastPostedMonth: null,
          active: true,
          createdAt: '2026-04-01T10:00:00.000Z',
          updatedAt: '2026-04-01T10:00:00.000Z',
        },
        {
          id: 'new-recurring',
          payee: 'Employer 2',
          amount: 3500,
          type: 'income',
          category: null,
          incomeSource: 'Salary',
          note: null,
          dayOfMonth: 8,
          startMonth: '2026-04',
          lastPostedMonth: null,
          active: true,
          createdAt: '2026-04-02T10:00:00.000Z',
          updatedAt: '2026-04-02T10:00:00.000Z',
        },
      ] as any,
      budgetTemplates: [],
      payeeRules: [],
    } as any)

    expect(manager.getTransactions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-income',
          category: 'Savings',
          incomeSource: null,
        }),
        expect.objectContaining({
          id: 'new-income',
          category: null,
          incomeSource: 'Gift',
        }),
      ]),
    )
    expect(manager.getRecurringTransactions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-recurring',
          category: 'Savings',
          incomeSource: null,
        }),
        expect.objectContaining({
          id: 'new-recurring',
          category: null,
          incomeSource: 'Salary',
        }),
      ]),
    )
  })
})
