import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Minus, PiggyBank, Square, SquareStack, X } from 'lucide-react'
import type { AppMenu, WindowState } from '../../../shared/types'
import { APP_NAME } from '../../../shared/constants'
import { cn } from '@/lib/utils'

const menuOrder: AppMenu[] = ['file', 'edit', 'view', 'window', 'help']

const menuLabels: Record<AppMenu, string> = {
  file: 'File',
  edit: 'Edit',
  view: 'View',
  window: 'Window',
  help: 'Help',
}

const mnemonicMap: Record<string, AppMenu> = {
  f: 'file',
  e: 'edit',
  v: 'view',
  w: 'window',
  h: 'help',
}

const defaultWindowState: WindowState = {
  isMaximized: false,
}

export function TitleBar() {
  const [activeMenu, setActiveMenu] = useState<AppMenu | null>(null)
  const [windowState, setWindowState] = useState(defaultWindowState)
  const menuButtonRefs = useRef(new Map<AppMenu, HTMLButtonElement>())
  const menuRequestRef = useRef(0)
  const openMenuRef = useRef<(menu: AppMenu) => Promise<void>>(async () => {})

  useEffect(() => {
    let mounted = true

    void window.electronAPI.getWindowState().then((state) => {
      if (mounted) {
        setWindowState(state)
      }
    })

    const unsubscribe = window.electronAPI.onWindowStateChange((state) => {
      setWindowState(state)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.shiftKey || !event.altKey) {
        return
      }

      const menu = mnemonicMap[event.key.toLowerCase()]
      if (!menu) {
        return
      }

      event.preventDefault()
      void openMenuRef.current(menu)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  async function openMenu(menu: AppMenu) {
    const button = menuButtonRefs.current.get(menu)
    if (!button) {
      return
    }

    const requestId = menuRequestRef.current + 1
    menuRequestRef.current = requestId
    setActiveMenu(menu)
    button.focus()

    const rect = button.getBoundingClientRect()

    try {
      await window.electronAPI.showWindowMenu(menu, {
        x: rect.left,
        y: rect.bottom + 4,
      })
    } finally {
      if (menuRequestRef.current === requestId) {
        setActiveMenu(null)
      }
    }
  }

  openMenuRef.current = openMenu

  function focusMenuButton(menu: AppMenu) {
    menuButtonRefs.current.get(menu)?.focus()
  }

  function moveMenuFocus(currentMenu: AppMenu, direction: -1 | 1) {
    const currentIndex = menuOrder.indexOf(currentMenu)
    const nextIndex = (currentIndex + direction + menuOrder.length) % menuOrder.length
    const nextMenu = menuOrder[nextIndex]
    focusMenuButton(nextMenu)

    if (activeMenu) {
      void openMenu(nextMenu)
    }
  }

  return (
    <header className="app-region-drag relative z-50 flex h-[var(--titlebar-height)] items-stretch justify-between border-b border-border bg-card/95 text-foreground shadow-[0_1px_0_rgba(255,252,245,0.04)] backdrop-blur">
      <div className="flex min-w-0 items-stretch">
        <div className="flex min-w-0 items-center gap-3 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/18 text-primary">
            <PiggyBank className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[0.02em]">{APP_NAME}</p>
          </div>
        </div>

        <nav className="flex items-stretch" aria-label="Application menu">
          {menuOrder.map((menu) => (
            <button
              key={menu}
              ref={(node) => {
                if (node) {
                  menuButtonRefs.current.set(menu, node)
                  return
                }

                menuButtonRefs.current.delete(menu)
              }}
              type="button"
              className={cn(
                'app-region-no-drag focus-ring inline-flex min-w-14 items-center justify-center border-x border-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground',
                activeMenu === menu && 'border-border bg-muted text-foreground',
              )}
              aria-haspopup="menu"
              aria-expanded={activeMenu === menu}
              onMouseDown={(event) => {
                event.preventDefault()
                void openMenu(menu)
              }}
              onMouseEnter={() => {
                if (activeMenu && activeMenu !== menu) {
                  void openMenu(menu)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  void openMenu(menu)
                  return
                }

                if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  moveMenuFocus(menu, 1)
                  return
                }

                if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  moveMenuFocus(menu, -1)
                }
              }}
            >
              {menuLabels[menu]}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex items-stretch">
        <WindowControlButton
          label="Minimize"
          onClick={() => {
            void window.electronAPI.minimizeWindow()
          }}
        >
          <Minus className="h-4 w-4" />
        </WindowControlButton>

        <WindowControlButton
          label={windowState.isMaximized ? 'Restore down' : 'Maximize'}
          onClick={async () => {
            const nextState = await window.electronAPI.toggleMaximizeWindow()
            setWindowState(nextState)
          }}
        >
          {windowState.isMaximized ? <SquareStack className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </WindowControlButton>

        <WindowControlButton
          label="Close"
          className="hover:bg-destructive hover:text-destructive-foreground focus-visible:bg-destructive focus-visible:text-destructive-foreground"
          onClick={() => {
            void window.electronAPI.closeWindow()
          }}
        >
          <X className="h-4 w-4" />
        </WindowControlButton>
      </div>
    </header>
  )
}

interface WindowControlButtonProps {
  children: ReactNode
  className?: string
  label: string
  onClick: () => void
}

function WindowControlButton({ children, className, label, onClick }: WindowControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'app-region-no-drag focus-ring inline-flex w-12 items-center justify-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
