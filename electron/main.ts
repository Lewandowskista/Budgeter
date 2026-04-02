import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron'
import { APP_NAME } from '../shared/constants'
import type {
  AnalyzeInsightsInput,
  AppMenu,
  AppSettings,
  AppSnapshotPayload,
  AppSnapshotSummary,
  BudgetInput,
  BudgetTemplateInput,
  CsvImportPreviewRequest,
  PayeeRuleInput,
  MenuAnchorPosition,
  Period,
  RecurringTransactionInput,
  TransactionFilters,
  TransactionInput,
  WindowState,
} from '../shared/types'
import { analyzeInsights } from './ai'
import { parseCsv, readCsvFile } from './csv'
import { DatabaseManager } from './database'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const SNAPSHOT_SCHEMA_VERSION = 1
let database: DatabaseManager
let snapshotsDir = ''
let mainWindow: BrowserWindow | null = null

function getMainWindow() {
  const win = mainWindow ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) {
    throw new Error('No window is available.')
  }

  return win
}

function getWindowState(win: BrowserWindow): WindowState {
  return {
    isMaximized: win.isMaximized(),
  }
}

async function exportTransactionsCsv() {
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
}

async function selectTransactionCsvFile() {
  const result = await dialog.showOpenDialog({
    title: 'Import transactions from CSV',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })

  if (result.canceled || !result.filePaths[0]) {
    return null
  }

  const parsed = parseCsv(readCsvFile(result.filePaths[0]))

  return {
    filePath: result.filePaths[0],
    fileName: path.basename(result.filePaths[0]),
    headers: parsed[0] ?? [],
  }
}

function getMenuTemplate(): Record<AppMenu, MenuItemConstructorOptions[]> {
  return {
    file: [
      {
        label: 'Export Transactions CSV…',
        accelerator: 'CmdOrCtrl+Shift+E',
        click: async () => {
          await exportTransactionsCsv()
        },
      },
      { type: 'separator' },
      { role: 'quit' },
    ],
    edit: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'delete' },
      { type: 'separator' },
      { role: 'selectAll' },
    ],
    view: [
      { role: 'reload' },
      { role: 'forceReload' },
      ...(isDev ? ([{ role: 'toggleDevTools' }] satisfies MenuItemConstructorOptions[]) : []),
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
    window: [
      { role: 'minimize' },
      {
        label: 'Toggle Maximize',
        click: (_menuItem, browserWindow) => {
          const win = browserWindow ?? getMainWindow()
          if (win.isMaximized()) {
            win.unmaximize()
            return
          }

          win.maximize()
        },
      },
      { type: 'separator' },
      { role: 'close' },
    ],
    help: [
      {
        label: `About ${APP_NAME}`,
        click: async () => {
          await dialog.showMessageBox({
            type: 'info',
            title: `About ${APP_NAME}`,
            message: APP_NAME,
            detail: `Version ${app.getVersion()}\nLocal-first money tracking.`,
          })
        },
      },
    ],
  }
}

function buildApplicationMenu() {
  const template = getMenuTemplate()

  return Menu.buildFromTemplate([
    { label: '&File', submenu: template.file },
    { label: '&Edit', submenu: template.edit },
    { label: '&View', submenu: template.view },
    { label: '&Window', submenu: template.window },
    { label: '&Help', submenu: template.help },
  ])
}

function sendWindowState(win: BrowserWindow) {
  win.webContents.send('window:state-changed', getWindowState(win))
}

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
    title: APP_NAME,
    titleBarStyle: 'hidden',
    backgroundColor: '#1A1A18',
    show: false,
  })
  mainWindow = win
  win.setMenuBarVisibility(false)
  win.on('maximize', () => sendWindowState(win))
  win.on('unmaximize', () => sendWindowState(win))
  win.on('enter-full-screen', () => sendWindowState(win))
  win.on('leave-full-screen', () => sendWindowState(win))
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  win.once('ready-to-show', () => {
    win.show()
    sendWindowState(win)
  })
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
  }))
  ipcMain.handle(
    'window:show-menu',
    async (event, payload: { menu: AppMenu; position: MenuAnchorPosition }) => {
      const template = getMenuTemplate()[payload.menu]
      const window = BrowserWindow.fromWebContents(event.sender)

      if (!window) {
        throw new Error('Menu can only be shown for an active window.')
      }

      const menu = Menu.buildFromTemplate(template)
      await new Promise<void>((resolve) => {
        menu.popup({
          window,
          x: Math.round(payload.position.x),
          y: Math.round(payload.position.y),
          callback: resolve,
        })
      })
    },
  )
  ipcMain.handle('window:get-state', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      throw new Error('Window state is unavailable.')
    }

    return getWindowState(window)
  })
  ipcMain.handle('window:minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      throw new Error('Window is unavailable.')
    }

    window.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      throw new Error('Window is unavailable.')
    }

    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }

    return getWindowState(window)
  })
  ipcMain.handle('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) {
      throw new Error('Window is unavailable.')
    }

    window.close()
  })

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
  ipcMain.handle('budgets:templates:list', () => database.getBudgetTemplates())
  ipcMain.handle('budgets:templates:save', (_event: IpcMainInvokeEvent, template: BudgetTemplateInput) =>
    database.saveBudgetTemplate(template),
  )
  ipcMain.handle('budgets:templates:delete', (_event: IpcMainInvokeEvent, id: string) => database.deleteBudgetTemplate(id))
  ipcMain.handle('budgets:templates:apply', (_event: IpcMainInvokeEvent, month: string) => database.applyBudgetTemplates(month))
  ipcMain.handle('budgets:templates:save-month', (_event: IpcMainInvokeEvent, month: string) =>
    database.saveMonthAsBudgetTemplates(month),
  )

  ipcMain.handle('recurring:list', () => database.getRecurringTransactions())
  ipcMain.handle('recurring:save', (_event: IpcMainInvokeEvent, recurring: RecurringTransactionInput) =>
    database.saveRecurringTransaction(recurring),
  )
  ipcMain.handle('recurring:delete', (_event: IpcMainInvokeEvent, id: string) => database.deleteRecurringTransaction(id))
  ipcMain.handle('recurring:sync', () => database.syncRecurringTransactions())

  ipcMain.handle('payee-rules:list', (_event: IpcMainInvokeEvent, search?: string) => database.getPayeeRules(search))
  ipcMain.handle('payee-rules:save', (_event: IpcMainInvokeEvent, rule: PayeeRuleInput) => database.upsertPayeeRule(rule))
  ipcMain.handle('payee-rules:delete', (_event: IpcMainInvokeEvent, id: string) => database.deletePayeeRule(id))
  ipcMain.handle('payee-rules:find', (_event: IpcMainInvokeEvent, payee: string) => database.findPayeeRule(payee))

  ipcMain.handle('transactions:import:select-file', () => selectTransactionCsvFile())
  ipcMain.handle('transactions:import:preview', (_event: IpcMainInvokeEvent, request: CsvImportPreviewRequest) =>
    database.previewTransactionCsvImport(request),
  )
  ipcMain.handle('transactions:import:commit', (_event: IpcMainInvokeEvent, request: CsvImportPreviewRequest) =>
    database.commitTransactionCsvImport(request),
  )

  ipcMain.handle('dashboard:get', (_event: IpcMainInvokeEvent, period: Period) => database.getDashboardData(period))
  ipcMain.handle('analytics:get', (_event: IpcMainInvokeEvent, period: Period) => database.getAnalyticsData(period))
  ipcMain.handle('ai:analyze', (_event: IpcMainInvokeEvent, input: AnalyzeInsightsInput) =>
    analyzeInsights(database, input.periodMonth, input.refresh),
  )

  ipcMain.handle('data:export-csv', () => exportTransactionsCsv())

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
  database.syncRecurringTransactions()
  snapshotsDir = path.join(userDataPath, 'snapshots')
  Menu.setApplicationMenu(buildApplicationMenu())
  registerIpcHandlers()
  createWindow()
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  const detail = message.includes('NODE_MODULE_VERSION')
    ? 'A native dependency was built for a different runtime. Run "npm run rebuild:native:electron" and restart Budgeter.'
    : 'Budgeter could not finish startup. Check the terminal output for the full stack trace.'

  console.error('Failed to start Budgeter:', error)
  dialog.showErrorBox('Budgeter failed to start', `${message}\n\n${detail}`)
  app.exit(1)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
