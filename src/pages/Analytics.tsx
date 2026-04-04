import { useEffect, useState } from 'react'
import { BarChart3, Receipt } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import type { AnalyticsData, AppSettings, Period } from '../../shared/types'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { ChartTooltip } from '@/components/shared/ChartTooltip'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { collectTrendCategories } from '../../shared/analytics'
import { CATEGORY_COLORS } from '@/lib/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency } from '@/lib/format'
import { ipc } from '@/lib/ipc'
import { useCategories } from '@/hooks/useCategories'

export function AnalyticsPage() {
  const navigate = useNavigate()
  const categoryResult = useCategories()
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [momCount, setMomCount] = useState(4)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    void loadData()
  }, [period, momCount])

  async function loadData() {
    const [analytics, appSettings] = await Promise.all([ipc.getAnalyticsData(period, momCount), ipc.getSettings()])
    setData(analytics)
    setSettings(appSettings)
  }

  const currency = settings?.currency ?? 'USD'
  const visibleCategories = data ? collectTrendCategories(data.categoryTrends) : []
  const formatTooltipValue = (value: number | string | ReadonlyArray<number | string> | undefined) => {
    const raw = Array.isArray(value) ? value[0] : value
    const amount = typeof raw === 'number' ? raw : Number(raw)
    return formatCurrency(Number.isFinite(amount) ? amount : 0, currency)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Deeper patterns across categories, time, and peak expenses, tuned for trend spotting instead of raw totals."
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
          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Spending by category</CardTitle>
                <CardDescription>Donut view of where current period expenses are concentrated.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                {data.categoryBreakdown.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={!prefersReducedMotion}
                        data={data.categoryBreakdown}
                        dataKey="amount"
                        nameKey="category"
                        innerRadius={70}
                        outerRadius={110}
                        style={{ cursor: 'pointer' }}
                        onClick={(entry) => navigate(`/transactions?category=${encodeURIComponent(entry.category)}`)}
                      >
                        {data.categoryBreakdown.map((entry) => (
                          <Cell key={entry.category} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip currency={settings?.currency ?? 'USD'} />} />
                      <Legend
                        wrapperStyle={{ fontFamily: 'var(--font-sans)', fontSize: '0.8125rem' }}
                        iconType="circle"
                        iconSize={8}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState icon={<BarChart3 />} title="No chart data yet" description="Add transactions to populate category analytics." />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Spending over time</CardTitle>
                <CardDescription>Income and spending across the last six {period} intervals.</CardDescription>
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
                    <Tooltip formatter={formatTooltipValue} />
                    <Legend />
                    <Line isAnimationActive={!prefersReducedMotion} type="monotone" dataKey="spent" stroke="var(--color-primary)" strokeWidth={3} />
                    <Line isAnimationActive={!prefersReducedMotion} type="monotone" dataKey="income" stroke="var(--color-accent)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Category trends</CardTitle>
                <CardDescription>Stacked area by category across rolling periods.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.categoryTrends}>
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
                    <Tooltip formatter={formatTooltipValue} />
                    <Legend />
                    {visibleCategories.map((category) => (
                      <Area
                        key={category}
                        isAnimationActive={!prefersReducedMotion}
                        type="monotone"
                        dataKey={category}
                        stackId="stack"
                        stroke={categoryResult.colors[category] ?? CATEGORY_COLORS.Other}
                        fill={categoryResult.colors[category] ?? CATEGORY_COLORS.Other}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>Month-over-month comparison</CardTitle>
                    <CardDescription>Grouped bars for the latest {momCount} months.</CardDescription>
                  </div>
                  <Tabs value={String(momCount)} onValueChange={(v) => setMomCount(Number(v))}>
                    <TabsList>
                      <TabsTrigger value="3">3m</TabsTrigger>
                      <TabsTrigger value="4">4m</TabsTrigger>
                      <TabsTrigger value="6">6m</TabsTrigger>
                      <TabsTrigger value="12">12m</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthOverMonth}>
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
                    <Tooltip formatter={formatTooltipValue} />
                    <Legend />
                    <Bar isAnimationActive={!prefersReducedMotion} dataKey="spent" fill="var(--color-primary)" radius={[8, 8, 0, 0]} />
                    <Bar isAnimationActive={!prefersReducedMotion} dataKey="income" fill="var(--color-accent)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Category breakdown</CardTitle>
                <CardDescription>Horizontal bars to compare magnitude directly.</CardDescription>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.categoryBreakdown} layout="vertical">
                    <XAxis type="number" stroke="var(--color-muted-foreground)" />
                    <YAxis dataKey="category" type="category" width={120} stroke="var(--color-muted-foreground)" />
                    <Tooltip formatter={formatTooltipValue} />
                    <Bar
                      isAnimationActive={!prefersReducedMotion}
                      dataKey="amount"
                      radius={[0, 10, 10, 0]}
                      style={{ cursor: 'pointer' }}
                      onClick={(entry) => navigate(`/transactions?category=${encodeURIComponent(entry.category)}`)}
                    >
                      {data.categoryBreakdown.map((entry) => (
                        <Cell key={entry.category} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Top expenses</CardTitle>
                <CardDescription>Largest outflows in the selected period.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.topExpenses.length ? (
                  data.topExpenses.map((expense) => {
                    const searchTerm = expense.note || expense.payee || expense.category
                    const href = `/transactions?search=${encodeURIComponent(searchTerm ?? '')}&category=${encodeURIComponent(expense.category ?? '')}`
                    return (
                      <a
                        key={expense.id}
                        href={`#${href}`}
                        className="block space-y-2 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/50"
                        onClick={(e) => { e.preventDefault(); navigate(href) }}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium text-foreground">{expense.category}</p>
                            <p className="text-sm text-muted-foreground">
                              {expense.note || 'No note'} - {expense.date}
                            </p>
                          </div>
                          <p className="font-medium text-foreground">{formatCurrency(expense.amount, currency)}</p>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{
                              width: `${(expense.amount / Math.max(data.topExpenses[0]?.amount ?? expense.amount, 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </a>
                    )
                  })
                ) : (
                  <EmptyState icon={<Receipt />} title="No top expenses yet" description="Expense transactions will surface here automatically." />
                )}
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <div className="grid gap-4">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      )}
    </div>
  )
}
