import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface CircularGaugeProps {
  value: number
  label: string
  tone?: 'primary' | 'warning' | 'danger'
  size?: 'md' | 'lg'
  ariaLabel?: string
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
  ariaLabel,
}: CircularGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const prefersReducedMotion = useReducedMotion()

  const gaugeSize = size === 'lg' ? 160 : 112
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clamped / 100)

  const sizeClass = size === 'lg' ? 'size-40' : 'size-28'

  const svgContent = useMemo(() => {
    const cx = gaugeSize / 2
    const cy = gaugeSize / 2
    return { cx, cy }
  }, [gaugeSize])

  return (
    <div
      className={cn('relative grid place-items-center rounded-full', sizeClass)}
      style={{ width: gaugeSize, height: gaugeSize }}
      role="img"
      aria-label={ariaLabel || `Progress: ${Math.round(clamped)}%`}
    >
      <svg
        width={gaugeSize}
        height={gaugeSize}
        viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}
        className="absolute inset-0"
        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))' }}
      >
        {/* Track circle */}
        <circle
          cx={svgContent.cx}
          cy={svgContent.cy}
          r={radius}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={8}
        />
        {/* Colored arc */}
        <circle
          cx={svgContent.cx}
          cy={svgContent.cy}
          r={radius}
          fill="none"
          stroke={toneMap[tone]}
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: prefersReducedMotion ? 'none' : `stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1)`,
            transformOrigin: `${svgContent.cx}px ${svgContent.cy}px`,
            transform: 'rotate(-90deg)',
          }}
        />
      </svg>

      {/* Inner content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <p className="font-heading text-3xl font-semibold tabular-nums text-foreground">{Math.round(clamped)}</p>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
