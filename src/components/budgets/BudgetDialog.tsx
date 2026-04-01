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

interface BudgetDialogProps {
  open: boolean
  month: string
  budget?: BudgetProgress | null
  onOpenChange: (open: boolean) => void
  onSubmit: (budget: BudgetInput) => Promise<void>
}

export function BudgetDialog({ open, month, budget, onOpenChange, onSubmit }: BudgetDialogProps) {
  const [category, setCategory] = useState(BUDGET_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (budget) {
      setCategory(budget.category)
      setAmount(String(budget.amount))
      return
    }

    setCategory(BUDGET_CATEGORIES[0])
    setAmount('')
  }, [budget, open])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        category,
        amount: Number(amount),
        month,
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
                {BUDGET_CATEGORIES.map((value) => (
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
              min="0"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Month
            <Input required type="month" value={month} readOnly />
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
