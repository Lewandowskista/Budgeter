import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface AnimatedNumberProps {
  value: string
  className?: string
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Animates a formatted string value when it changes.
 * Parses the numeric portion, animates it, then re-formats using the same prefix/suffix.
 */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const prefersReducedMotion = useReducedMotion()
  const [displayed, setDisplayed] = useState(value)
  const prevValueRef = useRef(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (prefersReducedMotion || prevValueRef.current === value) {
      setDisplayed(value)
      prevValueRef.current = value
      return
    }

    // Extract numeric part: strip everything except digits, commas, dots, minus, plus
    const extractNum = (s: string) => {
      const match = s.match(/[-+]?[\d,]+\.?\d*/)
      return match ? parseFloat(match[0].replace(/,/g, '')) : null
    }

    const fromNum = extractNum(prevValueRef.current)
    const toNum = extractNum(value)

    if (fromNum === null || toNum === null || fromNum === toNum) {
      setDisplayed(value)
      prevValueRef.current = value
      return
    }

    // Determine prefix/suffix from the target value
    const numMatch = value.match(/[-+]?[\d,]+\.?\d*/)
    const prefix = numMatch ? value.slice(0, value.indexOf(numMatch[0])) : ''
    const suffix = numMatch ? value.slice(value.indexOf(numMatch[0]) + numMatch[0].length) : ''

    const duration = 450
    const start = performance.now()

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)

    function tick(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOut(progress)
      const current = fromNum + (toNum - fromNum) * easedProgress

      // Format with same decimal places as target
      const decimalPlaces = (numMatch?.[0].split('.')[1]?.length) ?? 0
      const formatted = current.toLocaleString(undefined, {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      })
      setDisplayed(`${prefix}${formatted}${suffix}`)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplayed(value)
        prevValueRef.current = value
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    prevValueRef.current = value

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, prefersReducedMotion])

  return <span className={className}>{displayed}</span>
}
