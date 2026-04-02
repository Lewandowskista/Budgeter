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
import { ipc } from '@/lib/ipc'
import { validateTransactionInput, type ValidationErrors } from '@/lib/validation'

interface TransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValue?: Transaction | null
  onSubmit: (value: TransactionInput, options: { rememberPayeeRule: boolean }) => Promise<void>
}

const blankTransaction: TransactionInput = {
  amount: 0,
  type: 'expense',
  category: BUDGET_CATEGORIES[0],
  payee: '',
  date: new Date().toISOString().slice(0, 10),
  note: '',
}

export function TransactionDialog({ open, onOpenChange, initialValue, onSubmit }: TransactionDialogProps) {
  const [form, setForm] = useState<TransactionInput>(blankTransaction)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [rememberPayeeRule, setRememberPayeeRule] = useState(false)
  const [categoryTouched, setCategoryTouched] = useState(false)

  useEffect(() => {
    if (initialValue) {
      setForm({
        amount: initialValue.amount,
        type: initialValue.type,
        category: initialValue.category,
        payee: initialValue.payee ?? '',
        date: initialValue.date,
        note: initialValue.note ?? '',
      })
      setRememberPayeeRule(false)
      setCategoryTouched(true)
      return
    }

    if (open) {
      setErrors({})
      setRememberPayeeRule(false)
      setCategoryTouched(false)
      setForm({
        ...blankTransaction,
        date: new Date().toISOString().slice(0, 10),
      })
    }
  }, [initialValue, open])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateTransactionInput(form)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSaving(true)
    try {
      await onSubmit(
        {
          ...form,
          amount: Number(form.amount),
        },
        { rememberPayeeRule },
      )
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  async function autoFillCategoryFromPayee() {
    if (categoryTouched || !form.payee?.trim()) {
      return
    }

    const rule = await ipc.findPayeeRule(form.payee)
    if (rule) {
      setForm((current) => ({ ...current, category: rule.category }))
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
                min="0.01"
                step="0.01"
                type="number"
                value={form.amount || ''}
                onChange={(event) => {
                  updateField('amount', Number(event.target.value))
                  if (errors.amount) {
                    setErrors((current) => ({ ...current, amount: undefined }))
                  }
                }}
              />
              {errors.amount ? <span className="text-sm text-destructive">{errors.amount}</span> : null}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Payee
              <Input
                autoComplete="off"
                name="payee"
                placeholder="Merchant or source"
                value={form.payee ?? ''}
                onBlur={() => void autoFillCategoryFromPayee()}
                onChange={(event) => updateField('payee', event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-foreground">
              Category
              <Select
                value={form.category}
                onValueChange={(value) => {
                  setCategoryTouched(true)
                  updateField('category', value)
                }}
              >
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
          </div>

          {form.payee?.trim() ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                checked={rememberPayeeRule}
                className="focus-ring size-4 rounded border border-input"
                type="checkbox"
                onChange={(event) => setRememberPayeeRule(event.target.checked)}
              />
              Remember this payee and use the selected category next time.
            </label>
          ) : null}

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
