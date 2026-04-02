import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { AppSettings, BudgetInput, BudgetProgress, BudgetTemplate, BudgetTemplateInput, BudgetsPayload } from '../../shared/types'
import { BudgetDialog } from '@/components/budgets/BudgetDialog'
import { BudgetTemplateDialog } from '@/components/budgets/BudgetTemplateDialog'
import { CircularGauge } from '@/components/shared/CircularGauge'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { currentMonthValue, formatCurrency } from '@/lib/format'
import { ipc } from '@/lib/ipc'

export function BudgetsPage() {
  const [month, setMonth] = useState(currentMonthValue())
  const [payload, setPayload] = useState<BudgetsPayload | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [templates, setTemplates] = useState<BudgetTemplate[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<BudgetProgress | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<BudgetTemplate | null>(null)
  const [pendingDeleteBudget, setPendingDeleteBudget] = useState<BudgetProgress | null>(null)

  useEffect(() => {
    void loadBudgets()
  }, [month])

  async function loadBudgets() {
    const [budgets, appSettings, budgetTemplates] = await Promise.all([
      ipc.getBudgets(month),
      ipc.getSettings(),
      ipc.getBudgetTemplates(),
    ])
    setPayload(budgets)
    setSettings(appSettings)
    setTemplates(budgetTemplates)
  }

  async function saveBudget(budget: BudgetInput) {
    await ipc.setBudget(budget)
    await loadBudgets()
  }

  async function removeBudget(budget: BudgetProgress) {
    const next = await ipc.deleteBudget(budget.id, month)
    setPayload(next)
    setPendingDeleteBudget(null)
  }

  async function saveBudgetTemplate(template: BudgetTemplateInput) {
    await ipc.saveBudgetTemplate(template)
    await loadBudgets()
  }

  async function removeTemplate(template: BudgetTemplate) {
    await ipc.deleteBudgetTemplate(template.id)
    await loadBudgets()
  }

  async function applyTemplates() {
    const next = await ipc.applyBudgetTemplates(month)
    setPayload(next)
    setTemplates(await ipc.getBudgetTemplates())
  }

  async function saveMonthAsTemplates() {
    await ipc.saveMonthAsBudgetTemplates(month)
    await loadBudgets()
  }

  const currency = settings?.currency ?? 'USD'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budgets"
        description="Set monthly limits per category and watch them update automatically against live spending."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <input
              aria-label="Budget month"
              className="focus-ring rounded-xl border border-input bg-background px-3 py-2 text-sm"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => {
                setEditingTemplate(null)
                setTemplateDialogOpen(true)
              }}
            >
              Budget template
            </Button>
            <Button
              onClick={() => {
                setEditingBudget(null)
                setDialogOpen(true)
              }}
            >
              <Plus data-icon="inline-start" />
              Set budget
            </Button>
          </div>
        }
      />

      {payload ? (
        <>
          <Card className="border-border/80 bg-card/90">
            <CardHeader>
              <CardTitle>Overall budget health</CardTitle>
              <CardDescription>Total spend versus total planned amount for {month}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center justify-center">
                <CircularGauge
                  label="Used"
                  size="lg"
                  tone={
                    payload.overview.percentage >= 100
                      ? 'danger'
                      : payload.overview.percentage >= 80
                        ? 'warning'
                        : 'primary'
                  }
                  value={payload.overview.percentage}
                />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <p className="font-heading text-4xl font-semibold tabular-nums">
                    {payload.overview.totalBudget > 0 ? payload.overview.percentage.toFixed(0) : '0'}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(payload.overview.totalSpent, currency)} spent of {formatCurrency(payload.overview.totalBudget, currency)}
                  </p>
                </div>
                <Badge variant={payload.overview.percentage >= 100 ? 'destructive' : 'secondary'}>
                  {payload.overview.percentage >= 100 ? 'Over budget' : 'On track'}
                </Badge>
                <Progress value={Math.min(payload.overview.percentage, 100)} className="h-3" />
              </div>
            </CardContent>
          </Card>

          {payload.budgets.length ? (
            <section className="grid gap-4 xl:grid-cols-2">
              {payload.budgets.map((budget) => (
                <Card key={budget.id} className="border-border/80 bg-card/90">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle>{budget.category}</CardTitle>
                        <CardDescription>
                          {formatCurrency(budget.spent, currency)} spent of {formatCurrency(budget.amount, currency)}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          budget.status === 'danger'
                            ? 'destructive'
                            : budget.status === 'warning'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {budget.status === 'danger' ? 'Exceeded' : budget.status === 'warning' ? 'Near limit' : 'Healthy'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Progress value={Math.min(budget.percentage, 100)} className="h-3" />
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{budget.percentage.toFixed(0)}% used</span>
                      <span>{formatCurrency(budget.remaining, currency)} remaining</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingBudget(budget)
                          setDialogOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => setPendingDeleteBudget(budget)}>
                        <Trash2 data-icon="inline-start" />
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : (
            <EmptyState
              title="No budgets set for this month"
              description="Start with a few core categories like rent, food, and transport to see live progress bars."
              action={<Button onClick={() => setDialogOpen(true)}>Create first budget</Button>}
            />
          )}

          <Card className="border-border/80 bg-card/90">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Budget templates</CardTitle>
                  <CardDescription>Reusable category caps that can auto-fill a new month without overwriting anything already set.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void applyTemplates()}>
                    Use templates for {month}
                  </Button>
                  <Button variant="outline" onClick={() => void saveMonthAsTemplates()}>
                    Save {month} as templates
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingTemplate(null)
                      setTemplateDialogOpen(true)
                    }}
                  >
                    Add template
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              {templates.length ? (
                templates.map((template) => (
                  <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3">
                    <div>
                      <p className="font-medium text-foreground">{template.category}</p>
                      <p className="text-sm text-muted-foreground">{formatCurrency(template.amount, currency)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={template.active ? 'secondary' : 'outline'}>{template.active ? 'Active' : 'Paused'}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingTemplate(template)
                          setTemplateDialogOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void removeTemplate(template)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No budget templates yet" description="Create a few reusable templates to prefill future months." />
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-border/80 bg-card/90">
          <CardHeader>
            <CardTitle>Loading budgets</CardTitle>
            <CardDescription>Preparing this month&apos;s budgets and templates.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </CardContent>
        </Card>
      )}

      <BudgetDialog
        open={dialogOpen}
        month={month}
        budget={editingBudget}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingBudget(null)
        }}
        onSubmit={saveBudget}
      />

      <BudgetTemplateDialog
        open={templateDialogOpen}
        template={editingTemplate}
        onOpenChange={(open) => {
          setTemplateDialogOpen(open)
          if (!open) setEditingTemplate(null)
        }}
        onSubmit={saveBudgetTemplate}
      />

      <AlertDialog open={Boolean(pendingDeleteBudget)} onOpenChange={(open) => !open && setPendingDeleteBudget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this budget?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {pendingDeleteBudget?.category ?? 'selected'} budget for {month}. Your transactions stay in place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pendingDeleteBudget && removeBudget(pendingDeleteBudget)}
            >
              Delete budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
