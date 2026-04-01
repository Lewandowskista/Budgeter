import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  PiggyBank,
  ReceiptText,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/ai-insights', label: 'AI Insights', icon: Sparkles },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface/80 px-3 py-4 backdrop-blur lg:flex',
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
        {links.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
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
            to="/settings"
            className={({ isActive }) =>
              cn(
                'group flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
                collapsed && 'justify-center px-2',
                isActive && 'border-border bg-card text-foreground shadow-[inset_3px_0_0_var(--color-primary)]',
              )
            }
          >
            <Settings2 className="shrink-0" />
            {!collapsed && <span>Settings</span>}
          </NavLink>
        </div>
      </nav>
    </aside>
  )
}
