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
})
