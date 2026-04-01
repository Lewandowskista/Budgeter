import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Will be populated as features are built
})
