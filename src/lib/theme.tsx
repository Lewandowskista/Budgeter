import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ThemeMode } from '../../shared/types'
import { ipc } from '@/lib/ipc'

interface ThemeContextValue {
  theme: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemeMode>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    let active = true

    ipc
      .getSettings()
      .then((settings) => {
        if (active) setThemeState(settings.theme)
      })
      .catch(() => {
        if (active) setThemeState('system')
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const nextResolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.classList.toggle('dark', nextResolved === 'dark')
      setResolvedTheme(nextResolved)
    }

    applyTheme()
    media.addEventListener('change', applyTheme)

    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      async setTheme(nextTheme) {
        setThemeState(nextTheme)
        await ipc.updateSettings({ theme: nextTheme })
      },
    }),
    [resolvedTheme, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider.')
  return context
}
