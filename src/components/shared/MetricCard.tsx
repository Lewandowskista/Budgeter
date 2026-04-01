import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MetricCardProps {
  title: string
  value: string
  hint: string
  icon?: ReactNode
}

export function MetricCard({ title, value, hint, icon }: MetricCardProps) {
  return (
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          {title}
          {icon}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="font-heading text-3xl font-semibold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
