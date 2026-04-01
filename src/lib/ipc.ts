import type { ElectronAPI } from '../../shared/types'

const electronAPI = window.electronAPI

if (!electronAPI) {
  throw new Error('The Electron preload API is not available.')
}

export const ipc: ElectronAPI = electronAPI
