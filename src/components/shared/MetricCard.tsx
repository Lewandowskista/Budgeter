import type { ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MetricCardTrend {
  direction: 'up' | 'down'
  percent: number
  positiveIsGood?: boolean // if true, up = good (green), down = bad. For income.
}

interface MetricCardProps {
  title: string
  value: string
  hint: string
  icon?: ReactNode
  variant?: 'default' | 'income' | 'expense' | 'neutral'
  trend?: MetricCardTrend
}

export function MetricCard({ title, value, hint, icon, variant = 'default', trend }: MetricCardProps) {
  const variantClasses = {
    default: 'border-border/80 bg-card/90',
    income: 'border-l-4 border-l-income bg-income/5',
    expense: 'border-l-4 border-l-destructive bg-destructive/5',
    neutral: 'border-border/80 bg-card/90',
  }

  let trendColor = 'text-muted-foreground'
  if (trend) {
    const isPositive = trend.positiveIsGood ? trend.direction === 'up' : trend.direction === 'down'
    trendColor = isPositive ? 'text-income' : 'text-destructive'
  }

  return (
    <Card className={cn('shadow-sm', variantClasses[variant])}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          {title}
          {icon && <span className="rounded-lg bg-muted p-2 text-foreground">{icon}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <AnimatedNumber value={value} className="font-heading text-3xl font-semibold text-foreground" />
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{hint}</p>
          {trend && (
            <span className={cn('flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums', trendColor)}>
              {trend.direction === 'up' ? (
                <TrendingUp className="size-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              )}
              {trend.percent.toFixed(0)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
