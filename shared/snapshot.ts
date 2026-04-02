import type { AppSettings } from './types'

export function sanitizeSettingsForSnapshot(settings: AppSettings): AppSettings {
  return {
    ...settings,
    geminiApiKey: '',
  }
}
