import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, DollarSign, PiggyBank, Plus } from 'lucide-react'
import { Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import type { AppSettings, DashboardData, Period, TransactionInput } from '../../shared/types'
import { TransactionDialog } from '@/components/transactions/TransactionDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { formatCompactPercent, formatCurrency, formatDate } from '@/lib/format'
import { ipc } from '@/lib/ipc'

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<DashboardData | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    void loadData()
  }, [period])

  async function loadData() {
    const [dashboard, appSettings] = await Promise.all([ipc.getDashboardData(period), ipc.getSettings()])
    setData(dashboard)
    setSettings(appSettings)
  }

  async function handleAddTransaction(transaction: TransactionInput) {
    await ipc.addTransaction(transaction)
    await loadData()
  }

  const currency = settings?.currency ?? 'USD'

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
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Income"
              value={formatCurrency(data.summary.totalIncome, currency)}
              hint="Money flowing into this period."
              icon={<ArrowUpRight className="text-primary" />}
            />
            <MetricCard
              title="Total Spent"
              value={formatCurrency(data.summary.totalSpent, currency)}
              hint="Outgoing money across all expense categories."
              icon={<ArrowDownRight className="text-destructive" />}
            />
            <MetricCard
              title="Remaining Budget"
              value={formatCurrency(data.summary.remainingBudget, currency)}
              hint="Budget-based when available, income-based otherwise."
              icon={<PiggyBank className="text-accent" />}
            />
            <MetricCard
              title="Savings Rate"
              value={formatCompactPercent(data.summary.savingsRate)}
              hint="How much of income stays unspent."
              icon={<DollarSign className="text-secondary" />}
            />
          </section>

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
                      >
                        {data.spendingByCategory.map((entry) => (
                          <Cell key={entry.category} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
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
                    <XAxis dataKey="label" stroke="var(--color-muted-foreground)" />
                    <YAxis stroke="var(--color-muted-foreground)" />
                    <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
                    <Legend />
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
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3"
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
                  title="No transactions recorded"
                  description="Use quick add to start building your dashboard."
                  action={<Button onClick={() => setDialogOpen(true)}>Add first transaction</Button>}
                />
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

      <TransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleAddTransaction} />
    </div>
  )
}
