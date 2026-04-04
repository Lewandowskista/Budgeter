import { useState } from 'react'
import { BarChart2, DollarSign, RefreshCw, Shield } from 'lucide-react'
import type { AppSettings, BudgetInput } from '../../../shared/types'
import { BUDGET_CATEGORIES, CURRENCY_OPTIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { currentMonthValue } from '@/lib/format'
import { ipc } from '@/lib/ipc'

interface OnboardingWizardProps {
  open: boolean
  settings: AppSettings
  categories: string[]
  onComplete: () => void
}

type Step = 1 | 2 | 3 | 4

export function OnboardingWizard({ open, settings, categories, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>(1)
  const [currency, setCurrency] = useState(settings.currency || 'USD')
  const [city, setCity] = useState(settings.city)
  const [country, setCountry] = useState(settings.country)
  const [budgetCategory, setBudgetCategory] = useState(categories[0] ?? BUDGET_CATEGORIES[0])
  const [budgetAmount, setBudgetAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleContinueFromStep2() {
    setSaving(true)
    try {
      await ipc.updateSettings({ currency, city, country })
    } finally {
      setSaving(false)
    }
    setStep(3)
  }

  async function handleAddBudget() {
    if (!budgetAmount || Number(budgetAmount) <= 0) {
      setStep(4)
      return
    }
    const budget: BudgetInput = {
      category: budgetCategory,
      amount: Number(budgetAmount),
      month: currentMonthValue(),
      rolloverEnabled: false,
    }
    await ipc.setBudget(budget)
    setStep(4)
  }

  async function handleFinish() {
    await ipc.updateSettings({ onboardingCompleted: 'true' })
    onComplete()
  }

  function StepDots() {
    return (
      <div className="flex items-center justify-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div
            key={s}
            className={`size-2 rounded-full transition-colors ${s === step ? 'bg-primary' : 'bg-muted-foreground/30'}`}
          />
        ))}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={() => void handleFinish()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl">Welcome to Budgeter</DialogTitle>
              <DialogDescription>Your private, local-first money tracker. No cloud. No subscriptions.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              {[
                { icon: <DollarSign className="size-4 text-primary" />, text: 'Track income and expenses by category' },
                { icon: <BarChart2 className="size-4 text-primary" />, text: 'Set monthly budgets and see live progress' },
                { icon: <RefreshCw className="size-4 text-primary" />, text: 'Automate recurring transactions' },
                { icon: <Shield className="size-4 text-primary" />, text: 'All data stays on your device' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-foreground">
                  {icon}
                  {text}
                </div>
              ))}
            </div>

            <DialogFooter className="flex-col gap-2 border-t-0 bg-transparent p-0 sm:flex-col">
              <StepDots />
              <Button className="w-full" onClick={() => setStep(2)}>Get started</Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle>Your preferences</DialogTitle>
              <DialogDescription>Set your currency and location for accurate benchmarks.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Currency
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                City <span className="font-normal text-muted-foreground">(optional, for AI benchmarks)</span>
                <Input
                  autoComplete="off"
                  placeholder="e.g. Berlin"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                Country <span className="font-normal text-muted-foreground">(optional)</span>
                <Input
                  autoComplete="off"
                  placeholder="e.g. Germany"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </label>
            </div>

            <DialogFooter className="flex-col gap-2 border-t-0 bg-transparent p-0 sm:flex-col">
              <StepDots />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" disabled={saving} onClick={() => void handleContinueFromStep2()}>
                  {saving ? 'Saving…' : 'Continue'}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle>Set your first budget</DialogTitle>
              <DialogDescription>Pick a category and monthly limit to start tracking. You can add more on the Budgets page.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Category
                <Select value={budgetCategory} onValueChange={setBudgetCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                Monthly limit
                <Input
                  autoComplete="off"
                  min="0.01"
                  step="0.01"
                  type="number"
                  placeholder="e.g. 500"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                />
              </label>
            </div>

            <DialogFooter className="flex-col gap-2 border-t-0 bg-transparent p-0 sm:flex-col">
              <StepDots />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button className="flex-1" onClick={() => void handleAddBudget()}>
                  {budgetAmount && Number(budgetAmount) > 0 ? 'Add budget' : 'Skip for now'}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {step === 4 && (
          <>
            <DialogHeader>
              <DialogTitle>You're all set!</DialogTitle>
              <DialogDescription>Your workspace is ready. Add your first transaction to start tracking your money.</DialogDescription>
            </DialogHeader>

            <div className="py-2 text-sm text-muted-foreground space-y-2">
              <p>Here's what to do next:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Add transactions on the <strong>Transactions</strong> page</li>
                <li>Set monthly limits on the <strong>Budgets</strong> page</li>
                <li>See spending trends in <strong>Analytics</strong></li>
              </ul>
            </div>

            <DialogFooter className="flex-col gap-2 border-t-0 bg-transparent p-0 sm:flex-col">
              <StepDots />
              <Button className="w-full" onClick={() => void handleFinish()}>Go to Dashboard</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
