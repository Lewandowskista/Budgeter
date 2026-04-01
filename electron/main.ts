import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'path'
import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { APP_NAME } from '../shared/constants'
import type {
  AnalyzeInsightsInput,
  AppSettings,
  AppSnapshotPayload,
  AppSnapshotSummary,
  BudgetInput,
  Period,
  TransactionFilters,
  TransactionInput,
} from '../shared/types'
import { analyzeInsights } from './ai'
import { DatabaseManager } from './database'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const SNAPSHOT_SCHEMA_VERSION = 1
let database: DatabaseManager
let snapshotsDir = ''

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#FAFAF8',
    show: false,
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  win.once('ready-to-show', () => win.show())
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
  }))

  ipcMain.handle('settings:get', () => database.getSettings())
  ipcMain.handle('settings:update', (_event: IpcMainInvokeEvent, payload: Partial<AppSettings>) =>
    database.updateSettings(payload),
  )

  ipcMain.handle('transactions:list', (_event: IpcMainInvokeEvent, filters: TransactionFilters | undefined) =>
    database.getTransactions(filters),
  )
  ipcMain.handle('transactions:add', (_event: IpcMainInvokeEvent, transaction: TransactionInput) =>
    database.addTransaction(transaction),
  )
  ipcMain.handle(
    'transactions:update',
    (_event: IpcMainInvokeEvent, payload: { id: string; transaction: TransactionInput }) =>
      database.updateTransaction(payload.id, payload.transaction),
  )
  ipcMain.handle('transactions:delete', (_event: IpcMainInvokeEvent, ids: string[]) => database.deleteTransactions(ids))

  ipcMain.handle('budgets:list', (_event: IpcMainInvokeEvent, month: string) => database.getBudgets(month))
  ipcMain.handle('budgets:set', (_event: IpcMainInvokeEvent, budget: BudgetInput) => database.setBudget(budget))
  ipcMain.handle(
    'budgets:delete',
    (_event: IpcMainInvokeEvent, payload: { id: string; month: string }) => database.deleteBudget(payload.id, payload.month),
  )

  ipcMain.handle('dashboard:get', (_event: IpcMainInvokeEvent, period: Period) => database.getDashboardData(period))
  ipcMain.handle('analytics:get', (_event: IpcMainInvokeEvent, period: Period) => database.getAnalyticsData(period))
  ipcMain.handle('ai:analyze', (_event: IpcMainInvokeEvent, input: AnalyzeInsightsInput) =>
    analyzeInsights(database, input.periodMonth, input.refresh),
  )

  ipcMain.handle('data:export-csv', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export transactions',
      defaultPath: path.join(app.getPath('documents'), 'budgeter-transactions.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })

    if (result.canceled || !result.filePath) {
      return {}
    }

    fs.writeFileSync(result.filePath, database.exportTransactionsCsv(), 'utf8')
    return { filePath: result.filePath }
  })

  ipcMain.handle('data:start-fresh', () => {
    createSnapshot('start-fresh', 'Auto snapshot before fresh start')
    database.startFresh()
  })
  ipcMain.handle('data:snapshots:list', () => listSnapshots())
  ipcMain.handle('data:snapshots:create', (_event: IpcMainInvokeEvent, label?: string) => createSnapshot('manual', label))
  ipcMain.handle('data:snapshots:restore', (_event: IpcMainInvokeEvent, id: string) => {
    const snapshot = readSnapshot(id)
    database.replaceAppState(snapshot)
  })
  ipcMain.handle('data:snapshots:delete', (_event: IpcMainInvokeEvent, id: string) => deleteSnapshot(id))
  ipcMain.handle('data:factory-reset', () => {
    createSnapshot('factory-reset', 'Auto snapshot before factory reset')
    database.resetAllData()
  })
  ipcMain.handle('data:reset', () => {
    createSnapshot('factory-reset', 'Auto snapshot before factory reset')
    database.resetAllData()
  })
}

function ensureSnapshotsDir() {
  fs.mkdirSync(snapshotsDir, { recursive: true })
}

function getSnapshotFilePath(id: string) {
  return path.join(snapshotsDir, `${id}.json`)
}

function toSnapshotSummary(snapshot: AppSnapshotPayload): AppSnapshotSummary {
  return {
    id: snapshot.id,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    trigger: snapshot.trigger,
    appVersion: snapshot.appVersion,
  }
}

function readSnapshot(id: string): AppSnapshotPayload {
  const filePath = getSnapshotFilePath(id)
  if (!fs.existsSync(filePath)) {
    throw new Error('Snapshot not found.')
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as AppSnapshotPayload
  if (parsed.version !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`Unsupported snapshot version: ${parsed.version}`)
  }

  return parsed
}

function listSnapshots() {
  ensureSnapshotsDir()

  return fs
    .readdirSync(snapshotsDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => {
      try {
        const raw = fs.readFileSync(path.join(snapshotsDir, fileName), 'utf8')
        return toSnapshotSummary(JSON.parse(raw) as AppSnapshotPayload)
      } catch {
        return null
      }
    })
    .filter((snapshot): snapshot is AppSnapshotSummary => snapshot !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function createSnapshot(trigger: AppSnapshotPayload['trigger'], label?: string) {
  ensureSnapshotsDir()

  const payload: AppSnapshotPayload = {
    id: randomUUID(),
    label: label?.trim() || null,
    createdAt: new Date().toISOString(),
    trigger,
    appVersion: app.getVersion(),
    version: SNAPSHOT_SCHEMA_VERSION,
    ...database.exportAppState(),
  }

  fs.writeFileSync(getSnapshotFilePath(payload.id), JSON.stringify(payload, null, 2), 'utf8')
  return toSnapshotSummary(payload)
}

function deleteSnapshot(id: string) {
  const filePath = getSnapshotFilePath(id)
  if (!fs.existsSync(filePath)) {
    throw new Error('Snapshot not found.')
  }

  fs.unlinkSync(filePath)
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  database = new DatabaseManager(userDataPath)
  snapshotsDir = path.join(userDataPath, 'snapshots')
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
