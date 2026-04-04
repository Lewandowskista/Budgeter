import { useEffect, useState } from 'react'
import type { BudgetInput, BudgetProgress } from '../../../shared/types'
import { BUDGET_CATEGORIES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { validateBudgetInput, type ValidationErrors } from '@/lib/validation'

interface BudgetDialogProps {
  open: boolean
  month: string
  budget?: BudgetProgress | null
  onOpenChange: (open: boolean) => void
  onSubmit: (budget: BudgetInput) => Promise<void>
  categories?: string[]
}

export function BudgetDialog({ open, month, budget, onOpenChange, onSubmit, categories = [...BUDGET_CATEGORIES] }: BudgetDialogProps) {
  const defaultCategory = categories[0] ?? BUDGET_CATEGORIES[0]
  const [category, setCategory] = useState<string>(defaultCategory)
  const [amount, setAmount] = useState('')
  const [rolloverEnabled, setRolloverEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})

  useEffect(() => {
    if (budget) {
      setCategory(budget.category)
      setAmount(String(budget.amount))
      setRolloverEnabled(budget.rolloverEnabled)
      return
    }

    setCategory(defaultCategory)
    setAmount('')
    setRolloverEnabled(false)
    setErrors({})
  }, [budget, open])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateBudgetInput({
      category,
      amount: Number(amount),
      month,
      rolloverEnabled,
    })
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        category,
        amount: Number(amount),
        month,
        rolloverEnabled,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{budget ? 'Edit budget' : 'Set budget'}</DialogTitle>
          <DialogDescription>Define a monthly cap for one category and track progress live.</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Category
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Amount
            <Input
              autoComplete="off"
              required
              name="amount"
              min="0.01"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                if (errors.amount) {
                  setErrors((current) => ({ ...current, amount: undefined }))
                }
              }}
            />
            {errors.amount ? <span className="text-sm text-destructive">{errors.amount}</span> : null}
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Month
            <Input required type="month" value={month} readOnly />
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              checked={rolloverEnabled}
              className="focus-ring size-4 rounded border border-input"
              type="checkbox"
              onChange={(event) => setRolloverEnabled(event.target.checked)}
            />
            Roll unused or overspent balance into the next month
          </label>

          <DialogFooter className="border-t-0 bg-transparent p-0">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : budget ? 'Save Budget' : 'Create Budget'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
