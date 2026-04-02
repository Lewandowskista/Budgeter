import { useEffect, useState } from 'react'
import type { IncomeSource, RecurringTransaction, RecurringTransactionInput, TransactionType } from '../../../shared/types'
import { BUDGET_CATEGORIES, INCOME_SOURCES } from '@/lib/constants'
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
import { Textarea } from '@/components/ui/textarea'

interface RecurringTransactionDialogProps {
  open: boolean
  recurring?: RecurringTransaction | null
  onOpenChange: (open: boolean) => void
  onSubmit: (value: RecurringTransactionInput) => Promise<void>
}

const blankRecurring: RecurringTransactionInput = {
  payee: '',
  amount: 0,
  type: 'expense',
  category: 'Rent/Housing',
  incomeSource: null,
  note: '',
  dayOfMonth: 1,
  startMonth: new Date().toISOString().slice(0, 7),
  active: true,
}

export function RecurringTransactionDialog({
  open,
  recurring,
  onOpenChange,
  onSubmit,
}: RecurringTransactionDialogProps) {
  const [form, setForm] = useState<RecurringTransactionInput>(blankRecurring)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (recurring) {
      setForm({
        id: recurring.id,
        payee: recurring.payee,
        amount: recurring.amount,
        type: recurring.type,
        category: recurring.category,
        incomeSource: recurring.incomeSource,
        note: recurring.note ?? '',
        dayOfMonth: recurring.dayOfMonth,
        startMonth: recurring.startMonth,
        active: recurring.active,
      })
      return
    }

    if (open) {
      setForm(blankRecurring)
    }
  }, [open, recurring])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const normalizedForm: RecurringTransactionInput =
        form.type === 'income'
          ? {
              ...form,
              category: null,
            }
          : {
              ...form,
              incomeSource: null,
            }

      await onSubmit({
        ...normalizedForm,
        payee: normalizedForm.payee.trim(),
        note: normalizedForm.note?.trim() ?? '',
        amount: Number(normalizedForm.amount),
        dayOfMonth: Number(normalizedForm.dayOfMonth),
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  function updateField<Key extends keyof RecurringTransactionInput>(key: Key, value: RecurringTransactionInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateType(type: TransactionType) {
    setForm((current) =>
      type === 'income'
        ? {
            ...current,
            type,
            category: null,
            incomeSource: current.incomeSource ?? INCOME_SOURCES[0],
          }
        : {
            ...current,
            type,
            category: current.category ?? BUDGET_CATEGORIES[0],
            incomeSource: null,
          },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{recurring ? 'Edit recurring transaction' : 'New recurring transaction'}</DialogTitle>
          <DialogDescription>Monthly recurring entries post automatically once they are due in the current month.</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Payee
              <Input required value={form.payee} onChange={(event) => updateField('payee', event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Amount
              <Input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={form.amount || ''}
                onChange={(event) => updateField('amount', Number(event.target.value))}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Type
              <Select value={form.type} onValueChange={(value) => updateType(value as TransactionType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {form.type === 'expense' ? (
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Category
                <Select value={form.category ?? undefined} onValueChange={(value) => updateField('category', value)}>
                  <SelectTrigger className="w-full" aria-label="Category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUDGET_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : (
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Income Type
                <Select value={form.incomeSource ?? undefined} onValueChange={(value) => updateField('incomeSource', value as IncomeSource)}>
                  <SelectTrigger className="w-full" aria-label="Income Type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOME_SOURCES.map((incomeSource) => (
                      <SelectItem key={incomeSource} value={incomeSource}>
                        {incomeSource}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Day of month
              <Input
                required
                min="1"
                max="31"
                type="number"
                value={form.dayOfMonth}
                onChange={(event) => updateField('dayOfMonth', Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Start month
              <Input required type="month" value={form.startMonth} onChange={(event) => updateField('startMonth', event.target.value)} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              checked={form.active}
              className="focus-ring size-4 rounded border border-input"
              type="checkbox"
              onChange={(event) => updateField('active', event.target.checked)}
            />
            Active recurring transaction
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Note
            <Textarea rows={3} value={form.note ?? ''} onChange={(event) => updateField('note', event.target.value)} />
          </label>

          <DialogFooter className="border-t-0 bg-transparent p-0">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : recurring ? 'Save recurring transaction' : 'Create recurring transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
