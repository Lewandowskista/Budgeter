import { useEffect, useState } from 'react'
import type { BudgetTemplate, BudgetTemplateInput } from '../../../shared/types'
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

interface BudgetTemplateDialogProps {
  open: boolean
  template?: BudgetTemplate | null
  onOpenChange: (open: boolean) => void
  onSubmit: (template: BudgetTemplateInput) => Promise<void>
}

export function BudgetTemplateDialog({ open, template, onOpenChange, onSubmit }: BudgetTemplateDialogProps) {
  const [category, setCategory] = useState<string>(BUDGET_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (template) {
      setCategory(template.category)
      setAmount(String(template.amount))
      setActive(template.active)
      return
    }

    if (open) {
      setCategory(BUDGET_CATEGORIES[0])
      setAmount('')
      setActive(true)
    }
  }, [open, template])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit({
        id: template?.id,
        category,
        amount: Number(amount),
        active,
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
          <DialogTitle>{template ? 'Edit budget template' : 'Add budget template'}</DialogTitle>
          <DialogDescription>Templates can auto-fill new months without overwriting any existing monthly budget.</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Category
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
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
            <Input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              checked={active}
              className="focus-ring size-4 rounded border border-input"
              type="checkbox"
              onChange={(event) => setActive(event.target.checked)}
            />
            Active template
          </label>

          <DialogFooter className="border-t-0 bg-transparent p-0">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : template ? 'Save template' : 'Create template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
