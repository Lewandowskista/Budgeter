import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { primaryNavigationItems, settingsNavigationItem } from './navigation'

const compactNavigationItems = [...primaryNavigationItems, settingsNavigationItem]

export function CompactNavigation() {
  return (
    <nav
      aria-label="Primary"
      className="border-b border-border/70 bg-card/85 px-4 py-3 backdrop-blur lg:hidden"
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {compactNavigationItems.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'focus-ring inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-transparent bg-muted/40 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
                  isActive && 'border-border bg-card text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]',
                )
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
