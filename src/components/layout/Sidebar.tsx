import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { primaryNavigationItems, settingsNavigationItem } from './navigation'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const SettingsIcon = settingsNavigationItem.icon

  return (
    <aside
      className={cn(
        'hidden h-full shrink-0 flex-col border-r border-border bg-surface/80 px-3 py-4 backdrop-blur lg:flex',
        collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
      )}
    >
      <div className="mb-6 flex items-center justify-between gap-3 px-1">
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-heading text-xl font-semibold text-foreground">Budgeter</p>
            <p className="text-sm text-muted-foreground">Calm, local-first money tracking.</p>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Toggle sidebar">
          {collapsed ? <ChevronRight /> : <ChevronLeft />}
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {primaryNavigationItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={collapsed ? item.label : undefined}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'group flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
                  collapsed && 'justify-center px-2',
                  isActive &&
                    'border-border bg-card text-foreground shadow-[inset_3px_0_0_var(--color-primary)]',
                )
              }
            >
              <Icon className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )
        })}

        <div className="mt-auto pt-4">
          <NavLink
            to={settingsNavigationItem.to}
            aria-label={collapsed ? settingsNavigationItem.label : undefined}
            title={collapsed ? settingsNavigationItem.label : undefined}
            className={({ isActive }) =>
              cn(
                'group flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
                collapsed && 'justify-center px-2',
                isActive && 'border-border bg-card text-foreground shadow-[inset_3px_0_0_var(--color-primary)]',
              )
            }
          >
            <SettingsIcon className="shrink-0" />
            {!collapsed && <span>{settingsNavigationItem.label}</span>}
          </NavLink>
        </div>
      </nav>
    </aside>
  )
}
