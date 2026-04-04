import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarCheck, DollarSign, PiggyBank, Plus, ReceiptText, TrendingUp } from 'lucide-react'
import { Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link, useNavigate } from 'react-router-dom'
import type { AppSettings, BudgetProgress, DashboardData, Period, TransactionInput } from '../../shared/types'
import { TransactionDialog } from '@/components/transactions/TransactionDialog'
import { BudgetAlertBanner } from '@/components/shared/BudgetAlertBanner'
import { EmptyState } from '@/components/shared/EmptyState'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { ChartTooltip } from '@/components/shared/ChartTooltip'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { formatCompactPercent, formatCurrency, formatDate } from '@/lib/format'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useCategories } from '@/hooks/useCategories'

export function DashboardPage() {
  const navigate = useNavigate()
  const categoryResult = useCategories()
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<DashboardData | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [budgets, setBudgets] = useState<BudgetProgress[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    void loadData()
  }, [period])

  async function loadData() {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const [dashboard, appSettings, budgetPayload] = await Promise.all([
      ipc.getDashboardData(period),
      ipc.getSettings(),
      ipc.getBudgets(currentMonth),
    ])
    setData(dashboard)
    setSettings(appSettings)
    setBudgets(budgetPayload.budgets)
  }

  async function handleAddTransaction(transaction: TransactionInput) {
    await ipc.addTransaction(transaction)
    await loadData()
  }

  const currency = settings?.currency ?? 'USD'

  // Compute month-over-month trend deltas from spendingTrend (last 2 entries)
  const trend = (() => {
    if (!data || data.spendingTrend.length < 2) return null
    const prev = data.spendingTrend[data.spendingTrend.length - 2]
    const curr = data.spendingTrend[data.spendingTrend.length - 1]
    const spentChange = prev.spent > 0 ? ((curr.spent - prev.spent) / prev.spent) * 100 : null
    const incomeChange = prev.income > 0 ? ((curr.income - prev.income) / prev.income) * 100 : null
    return { spentChange, incomeChange }
  })()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A calm overview of the current period: what came in, what went out, and where the pressure points are."
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            Quick add
          </Button>
        }
      />

      <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)}>
        <TabsList>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>
      </Tabs>

      {data ? (
        <>
          {/* What happened this period */}
          <section className="stagger-in grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <h2 className="sr-only">Period summary</h2>
            <MetricCard
              title="Total Income"
              value={formatCurrency(data.summary.totalIncome, currency)}
              hint="Money flowing into this period."
              icon={<ArrowUpRight className="size-5" />}
              variant="income"
              trend={trend?.incomeChange != null ? { direction: trend.incomeChange >= 0 ? 'up' : 'down', percent: Math.abs(trend.incomeChange), positiveIsGood: true } : undefined}
            />
            <MetricCard
              title="Total Spent"
              value={formatCurrency(data.summary.totalSpent, currency)}
              hint={data.summary.transferredToSavings > 0 ? `Excludes ${formatCurrency(data.summary.transferredToSavings, currency)} transferred to savings.` : 'Outgoing money across all expense categories.'}
              icon={<ArrowDownRight className="size-5" />}
              variant="expense"
              trend={trend?.spentChange != null ? { direction: trend.spentChange >= 0 ? 'up' : 'down', percent: Math.abs(trend.spentChange) } : undefined}
            />
            <MetricCard
              title="Remaining Budget"
              value={formatCurrency(data.summary.remainingBudget, currency)}
              hint={period === 'week' ? "Budget-based when available. Week view uses the month the week ends in." : "Budget-based when available, income-based otherwise."}
              icon={<PiggyBank className="size-5" />}
              variant="neutral"
            />
            <MetricCard
              title="Savings Rate"
              value={formatCompactPercent(data.summary.savingsRate)}
              hint={(() => {
                const goal = settings?.savingsGoal ? Number(settings.savingsGoal) : 20
                const rate = data.summary.savingsRate * 100
                const suffix = goal > 0 ? ` · Goal: ${goal}%` : ''
                if (data.summary.transferredToSavings > 0) {
                  return `${formatCurrency(data.summary.transferredToSavings, currency)} to savings.${suffix}`
                }
                return `How much of income stays unspent.${suffix}`
              })()}
              icon={<DollarSign className="size-5" />}
              variant="neutral"
            />
          </section>

          {/* Forward-looking */}
          <section className="grid gap-4 sm:grid-cols-3">
            <h2 className="sr-only">Forward-looking</h2>
            <MetricCard
              title="Safe To Spend"
              value={formatCurrency(data.safeToSpend, currency)}
              hint="Current balance after committed recurring bills still due this month."
              icon={<PiggyBank className="size-5" />}
              variant="default"
            />
            <MetricCard
              title="End Of Month"
              value={formatCurrency(data.projectedEndOfMonthBalance, currency)}
              hint="Projected month-end balance after upcoming recurring income and expenses."
              icon={<TrendingUp className="size-5" />}
              variant="default"
            />
            {data.projectedMonthlySpend !== null ? (
              <MetricCard
                title="Projected Spend"
                value={formatCurrency(data.projectedMonthlySpend, currency)}
                hint="At today's pace, estimated spend by end of month."
                icon={<TrendingUp className="size-5" />}
                variant="default"
              />
            ) : null}
          </section>

          {/* Spending velocity warning */}
          {(() => {
            if (!data?.projectedMonthlySpend || data.spendingTrend.length < 2) return null
            const lastMonthSpent = data.spendingTrend[data.spendingTrend.length - 2].spent
            if (lastMonthSpent <= 0) return null
            const velocityDelta = ((data.projectedMonthlySpend - lastMonthSpent) / lastMonthSpent) * 100
            if (velocityDelta <= 15) return null
            return (
              <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-accent-foreground">
                <TrendingUp className="size-4 shrink-0 text-accent" />
                <span>
                  You&apos;re on pace to spend{' '}
                  <strong>{velocityDelta.toFixed(0)}% more</strong> than last month.
                  Projected: {formatCurrency(data.projectedMonthlySpend, currency)} vs {formatCurrency(lastMonthSpent, currency)} last period.
                </span>
              </div>
            )
          })()}

          <BudgetAlertBanner budgets={budgets} />

          <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Spending by category</CardTitle>
                <CardDescription>Current {period} split across warm-coded budget groups.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                {data.spendingByCategory.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={!prefersReducedMotion}
                        data={data.spendingByCategory}
                        dataKey="amount"
                        nameKey="category"
                        innerRadius={72}
                        outerRadius={112}
                        paddingAngle={3}
                        style={{ cursor: 'pointer' }}
                        onClick={(entry) => navigate(`/transactions?category=${encodeURIComponent(entry.category)}`)}
                      >
                        {data.spendingByCategory.map((entry) => (
                          <Cell key={entry.category} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Legend
                        wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.8125rem' }}
                        iconType="circle"
                        iconSize={8}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    icon={<PiggyBank />}
                    title="No spending yet"
                    description="Add your first expense to see the category mix for this period."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Trend over time</CardTitle>
                <CardDescription>Last six {period} windows, comparing income and spending.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.spendingTrend}>
                    <XAxis
                      dataKey="label"
                      stroke="var(--color-border)"
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12, fontFamily: 'var(--font-sans)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--color-border)"
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12, fontFamily: 'var(--font-sans)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTooltip currency={currency} />} />
                    <Legend
                      wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.8125rem' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Line isAnimationActive={!prefersReducedMotion} type="monotone" dataKey="spent" stroke="var(--color-primary)" strokeWidth={3} />
                    <Line isAnimationActive={!prefersReducedMotion} type="monotone" dataKey="income" stroke="var(--color-accent)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>

          <Card className="border-border/80 bg-card/90">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Recent transactions</CardTitle>
                  <CardDescription>Latest income and expense entries. Use the ledger page to edit, filter, or delete them.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/transactions">Manage transactions</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/budgets">Manage budgets</Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentTransactions.length ? (
                data.recentTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 transition-colors duration-100 hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium text-foreground">{transaction.category}</p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.note || 'No note'} - {formatDate(transaction.date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={transaction.type === 'income' ? 'text-primary' : 'text-foreground'}>
                        {transaction.type === 'income' ? '+' : '-'}
                        {formatCurrency(transaction.amount, currency)}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{transaction.type}</p>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={<ReceiptText />}
                  title="No transactions recorded"
                  description="Use quick add to start building your dashboard."
                  action={<Button onClick={() => setDialogOpen(true)}>Add first transaction</Button>}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90">
            <CardHeader>
              <CardTitle>Upcoming bills</CardTitle>
              <CardDescription>Recurring items still due this month, including reminder-only entries that have not been posted to the ledger.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.upcomingBills.length ? (
                data.upcomingBills.slice(0, 6).map((bill) => {
                  const isOverdue = new Date(bill.dueDate) < new Date(new Date().toISOString().slice(0, 10))
                  return (
                    <div
                      key={`${bill.recurringTransactionId}-${bill.dueDate}`}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors duration-100',
                        isOverdue
                          ? 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10'
                          : 'border-border/70 bg-muted/30 hover:bg-muted/50',
                      )}
                    >
                      <div>
                        <p className="font-medium text-foreground">{bill.payee}</p>
                        <p className="text-sm text-muted-foreground">
                          Due {formatDate(bill.dueDate)} · {bill.postingMode === 'auto' ? 'Auto-post' : 'Reminder'} · {bill.category ?? bill.incomeSource ?? bill.type}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOverdue && (
                          <span className="rounded-full border border-destructive/50 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">Overdue</span>
                        )}
                        {bill.subscriptionLabel ? <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">{bill.subscriptionLabel}</span> : null}
                        <p className="font-medium text-foreground">{formatCurrency(bill.expectedAmount, currency)}</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <EmptyState icon={<CalendarCheck />} title="No upcoming bills" description="Recurring commitments due soon will appear here." />
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="grid gap-4">
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-80 rounded-3xl" />
          <Skeleton className="h-80 rounded-3xl" />
        </div>
      )}

      <TransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleAddTransaction} categories={categoryResult.all} />
    </div>
  )
}
