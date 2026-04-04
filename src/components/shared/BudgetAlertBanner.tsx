import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { BudgetProgress } from '../../../shared/types'

interface BudgetAlertBannerProps {
  budgets: BudgetProgress[]
}

export function BudgetAlertBanner({ budgets }: BudgetAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  const overBudget = budgets.filter((b) => b.status === 'danger')
  const nearLimit = budgets.filter((b) => b.status === 'warning')

  if (dismissed || (overBudget.length === 0 && nearLimit.length === 0)) return null

  const isOver = overBudget.length > 0

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
        isOver
          ? 'border-destructive/40 bg-destructive/5 text-destructive'
          : 'border-accent/40 bg-accent/5 text-accent-foreground'
      }`}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" />
        <span>
          {isOver ? (
            <>
              <strong>{overBudget.length} {overBudget.length === 1 ? 'category' : 'categories'}</strong> over budget
              {nearLimit.length > 0 && `, ${nearLimit.length} near limit`}.{' '}
            </>
          ) : (
            <>
              <strong>{nearLimit.length} {nearLimit.length === 1 ? 'category' : 'categories'}</strong> near budget limit.{' '}
            </>
          )}
          <Link to="/budgets" className="underline underline-offset-2 hover:no-underline">
            View budgets
          </Link>
        </span>
      </div>
      <button
        type="button"
        aria-label="Dismiss budget alert"
        className="shrink-0 rounded-md p-1 opacity-60 hover:opacity-100"
        onClick={() => setDismissed(true)}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
