import { cn } from '@/lib/utils'

interface CircularGaugeProps {
  value: number
  label: string
  tone?: 'primary' | 'warning' | 'danger'
  size?: 'md' | 'lg'
}

const toneMap = {
  primary: 'var(--color-primary)',
  warning: 'var(--color-accent)',
  danger: 'var(--color-destructive)',
} as const

export function CircularGauge({
  value,
  label,
  tone = 'primary',
  size = 'lg',
}: CircularGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const gaugeSize = size === 'lg' ? 'size-40' : 'size-28'
  const innerSize = size === 'lg' ? 'size-28' : 'size-20'

  return (
    <div className={cn('relative grid place-items-center rounded-full', gaugeSize)}>
      <div
        className={cn('grid place-items-center rounded-full bg-card shadow-inner', gaugeSize)}
        style={{
          background: `conic-gradient(${toneMap[tone]} ${clamped * 3.6}deg, var(--color-muted) 0deg)`,
        }}
      >
        <div className={cn('grid place-items-center rounded-full bg-card', innerSize)}>
          <div className="text-center">
            <p className="font-heading text-3xl font-semibold tabular-nums text-foreground">{Math.round(clamped)}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
