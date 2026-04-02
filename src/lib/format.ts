export function formatCurrency(amount: number, currency: string, locale?: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`
}

export function formatCompactPercent(value: number) {
  return `${value.toFixed(0)}%`
}

export function formatDate(date: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  }).format(new Date(`${date}T00:00:00`))
}

export function currentMonthValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
