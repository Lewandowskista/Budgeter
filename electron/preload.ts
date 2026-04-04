import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/types'

const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  showWindowMenu: (menu, position) => ipcRenderer.invoke('window:show-menu', { menu, position }),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onWindowStateChange: (listener) => {
    const handleStateChange = (_event: Electron.IpcRendererEvent, state: Awaited<ReturnType<ElectronAPI['getWindowState']>>) => {
      listener(state)
    }

    ipcRenderer.on('window:state-changed', handleStateChange)

    return () => {
      ipcRenderer.removeListener('window:state-changed', handleStateChange)
    }
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  exportTransactionsCsv: () => ipcRenderer.invoke('data:export-csv'),
  startFresh: () => ipcRenderer.invoke('data:start-fresh'),
  listSnapshots: () => ipcRenderer.invoke('data:snapshots:list'),
  createSnapshot: (label) => ipcRenderer.invoke('data:snapshots:create', label),
  restoreSnapshot: (id) => ipcRenderer.invoke('data:snapshots:restore', id),
  deleteSnapshot: (id) => ipcRenderer.invoke('data:snapshots:delete', id),
  factoryReset: () => ipcRenderer.invoke('data:factory-reset'),
  resetAllData: () => ipcRenderer.invoke('data:reset'),
  getTransactions: (filters) => ipcRenderer.invoke('transactions:list', filters),
  getPendingReviewTransactions: () => ipcRenderer.invoke('transactions:pending-review'),
  addTransaction: (transaction) => ipcRenderer.invoke('transactions:add', transaction),
  updateTransaction: (id, transaction) => ipcRenderer.invoke('transactions:update', { id, transaction }),
  deleteTransactions: (ids) => ipcRenderer.invoke('transactions:delete', ids),
  bulkUpdateTransactionCategory: (ids, category) => ipcRenderer.invoke('transactions:bulk-update-category', { ids, category }),
  markTransactionsReviewed: (ids) => ipcRenderer.invoke('transactions:mark-reviewed', ids),
  getBudgets: (month) => ipcRenderer.invoke('budgets:list', month),
  setBudget: (budget) => ipcRenderer.invoke('budgets:set', budget),
  deleteBudget: (id, month) => ipcRenderer.invoke('budgets:delete', { id, month }),
  getBudgetTemplates: () => ipcRenderer.invoke('budgets:templates:list'),
  saveBudgetTemplate: (template) => ipcRenderer.invoke('budgets:templates:save', template),
  deleteBudgetTemplate: (id) => ipcRenderer.invoke('budgets:templates:delete', id),
  applyBudgetTemplates: (month) => ipcRenderer.invoke('budgets:templates:apply', month),
  saveMonthAsBudgetTemplates: (month) => ipcRenderer.invoke('budgets:templates:save-month', month),
  copyBudgetsFromPreviousMonth: (month) => ipcRenderer.invoke('budgets:copy-from-prev', month),
  getCategories: () => ipcRenderer.invoke('categories:list'),
  addCustomCategory: (input) => ipcRenderer.invoke('categories:add', input),
  deleteCustomCategory: (id) => ipcRenderer.invoke('categories:delete', id),
  getRecurringTransactions: () => ipcRenderer.invoke('recurring:list'),
  getUpcomingBills: () => ipcRenderer.invoke('recurring:upcoming'),
  saveRecurringTransaction: (transaction) => ipcRenderer.invoke('recurring:save', transaction),
  deleteRecurringTransaction: (id) => ipcRenderer.invoke('recurring:delete', id),
  syncRecurringTransactions: () => ipcRenderer.invoke('recurring:sync'),
  getPayeeRules: (search) => ipcRenderer.invoke('payee-rules:list', search),
  upsertPayeeRule: (rule) => ipcRenderer.invoke('payee-rules:save', rule),
  deletePayeeRule: (id) => ipcRenderer.invoke('payee-rules:delete', id),
  findPayeeRule: (payee) => ipcRenderer.invoke('payee-rules:find', payee),
  selectTransactionCsvFile: () => ipcRenderer.invoke('transactions:import:select-file'),
  previewTransactionCsvImport: (request) => ipcRenderer.invoke('transactions:import:preview', request),
  commitTransactionCsvImport: (request) => ipcRenderer.invoke('transactions:import:commit', request),
  findCsvImportMapping: (headersKey) => ipcRenderer.invoke('csv-mappings:find', headersKey),
  saveCsvImportMapping: (saved) => ipcRenderer.invoke('csv-mappings:save', saved),
  getDashboardData: (period) => ipcRenderer.invoke('dashboard:get', period),
  getCashFlowForecast: () => ipcRenderer.invoke('dashboard:forecast'),
  getAnalyticsData: (period, monthOverMonthCount) => ipcRenderer.invoke('analytics:get', period, monthOverMonthCount),
  analyzeInsights: (input) => ipcRenderer.invoke('ai:analyze', input),
  onAIInsightsProgress: (listener) => {
    const handleProgress = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) => {
      listener(progress)
    }

    ipcRenderer.on('ai:analyze:progress', handleProgress)

    return () => {
      ipcRenderer.removeListener('ai:analyze:progress', handleProgress)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
