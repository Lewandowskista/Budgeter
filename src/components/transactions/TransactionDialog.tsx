import { useEffect, useState } from 'react'
import type { Transaction, TransactionInput, TransactionType } from '../../../shared/types'
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
import { Textarea } from '@/components/ui/textarea'

interface TransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValue?: Transaction | null
  onSubmit: (value: TransactionInput) => Promise<void>
}

const blankTransaction: TransactionInput = {
  amount: 0,
  type: 'expense',
  category: BUDGET_CATEGORIES[0],
  date: new Date().toISOString().slice(0, 10),
  note: '',
}

export function TransactionDialog({
  open,
  onOpenChange,
  initialValue,
  onSubmit,
}: TransactionDialogProps) {
  const [form, setForm] = useState<TransactionInput>(blankTransaction)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialValue) {
      setForm({
        amount: initialValue.amount,
        type: initialValue.type,
        category: initialValue.category,
        date: initialValue.date,
        note: initialValue.note ?? '',
      })
      return
    }

    if (open) {
      setForm({
        ...blankTransaction,
        date: new Date().toISOString().slice(0, 10),
      })
    }
  }, [initialValue, open])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)

    try {
      await onSubmit({
        ...form,
        amount: Number(form.amount),
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  function updateField<Key extends keyof TransactionInput>(key: Key, value: TransactionInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initialValue ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
          <DialogDescription>Capture money in or out with a clean local record.</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Type</span>
            <div className="flex gap-2">
              {(['expense', 'income'] as TransactionType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={form.type === type ? 'default' : 'outline'}
                  onClick={() => updateField('type', type)}
                >
                  {type === 'expense' ? 'Expense' : 'Income'}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Amount
              <Input
                autoComplete="off"
                required
                name="amount"
                min="0"
                step="0.01"
                type="number"
                value={form.amount || ''}
                onChange={(event) => updateField('amount', Number(event.target.value))}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Date
              <Input
                autoComplete="off"
                required
                name="date"
                type="date"
                value={form.date}
                onChange={(event) => updateField('date', event.target.value)}
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Category
            <Select value={form.category} onValueChange={(value) => updateField('category', value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category" />
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

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Note
              <Textarea
              name="note"
              rows={4}
              value={form.note}
              onChange={(event) => updateField('note', event.target.value)}
              placeholder="Coffee with client, rent transfer, annual subscription…"
            />
          </label>

          <DialogFooter className="border-t-0 bg-transparent p-0">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : initialValue ? 'Save Changes' : 'Add Transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
