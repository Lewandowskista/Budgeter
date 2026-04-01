import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/types'

const electronAPI: ElectronAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
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
  addTransaction: (transaction) => ipcRenderer.invoke('transactions:add', transaction),
  updateTransaction: (id, transaction) => ipcRenderer.invoke('transactions:update', { id, transaction }),
  deleteTransactions: (ids) => ipcRenderer.invoke('transactions:delete', ids),
  getBudgets: (month) => ipcRenderer.invoke('budgets:list', month),
  setBudget: (budget) => ipcRenderer.invoke('budgets:set', budget),
  deleteBudget: (id, month) => ipcRenderer.invoke('budgets:delete', { id, month }),
  getDashboardData: (period) => ipcRenderer.invoke('dashboard:get', period),
  getAnalyticsData: (period) => ipcRenderer.invoke('analytics:get', period),
  analyzeInsights: (input) => ipcRenderer.invoke('ai:analyze', input),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
