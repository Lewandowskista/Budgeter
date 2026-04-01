import { useEffect, useState } from 'react'
import { MapPin, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AIAnalysisResult, AppSettings } from '../../shared/types'
import { CircularGauge } from '@/components/shared/CircularGauge'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { currentMonthValue, formatCurrency, formatPercent } from '@/lib/format'
import { ipc } from '@/lib/ipc'

export function AIInsightsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(currentMonthValue())

  useEffect(() => {
    void ipc.getSettings().then(setSettings)
  }, [])

  async function runAnalysis(refresh = false) {
    setLoading(true)
    setError(null)
    try {
      const result = await ipc.analyzeInsights({ periodMonth: month, refresh })
      setAnalysis(result)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'AI analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  const currency = settings?.currency ?? 'USD'
  const location = settings?.city && settings?.country ? `${settings.city}, ${settings.country}` : 'Location not set'

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Insights"
        description="Compare your spending against free city and country benchmark data, with AI fallback when a city is missing."
        action={
          <div className="flex items-center gap-3">
            <input
              aria-label="AI analysis month"
              className="focus-ring rounded-xl border border-input bg-background px-3 py-2 text-sm"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <Button onClick={() => void runAnalysis(Boolean(analysis))} disabled={loading}>
              <Sparkles data-icon="inline-start" />
              {loading ? 'Analyzing...' : analysis ? 'Refresh Analysis' : 'Analyze'}
            </Button>
          </div>
        }
      />

      <Card className="border-border/80 bg-card/90">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-muted p-3">
              <MapPin className="text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">{location}</p>
              <p className="text-sm text-muted-foreground">
                AI compares your monthly pattern to free public benchmarks and fills city gaps when needed.{' '}
                <Link className="text-primary underline underline-offset-4" to="/settings">
                  Edit in Settings
                </Link>
              </p>
            </div>
          </div>
          <Badge variant="outline">Month: {month}</Badge>
        </CardContent>
      </Card>

      {analysis && (
        <Card className="border-border/80 bg-card/90">
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{analysis.benchmarkSummary}</Badge>
              {analysis.dataSources.map((source) => (
                <Badge key={source} variant="outline">
                  {source}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Budgeter blends free benchmark services with Gemini-generated city fallback data before generating guidance.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl" />
        </div>
      ) : analysis ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Financial health score</CardTitle>
                <CardDescription>A quick signal from Gemini, grounded in your comparison data.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4 text-center">
                <CircularGauge
                  label="Score"
                  size="lg"
                  tone={analysis.healthScore >= 75 ? 'primary' : analysis.healthScore >= 50 ? 'warning' : 'danger'}
                  value={analysis.healthScore}
                />
                <div className="w-full space-y-2">
                  <Progress value={analysis.healthScore} className="h-3" />
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{analysis.explanation}</p>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Cost comparison</CardTitle>
                <CardDescription>How your spending stacks up against estimated local averages by category.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {analysis.comparisons.length ? (
                  analysis.comparisons.map((comparison) => {
                    const maxValue = Math.max(comparison.userAmount, comparison.averageAmount, 1)
                    const userBarPercent = Math.round((comparison.userAmount / maxValue) * 100)
                    const averageBarPercent = Math.round((comparison.averageAmount / maxValue) * 100)
                    return (
                      <div key={comparison.category} className="space-y-2 rounded-2xl border border-border/70 bg-muted/25 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="font-medium text-foreground">{comparison.category}</p>
                          <Badge variant={comparison.percentDiff > 0 ? 'destructive' : 'secondary'}>
                            {formatPercent(comparison.percentDiff)}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>You: {formatCurrency(comparison.userAmount, currency)}</span>
                            <span>Average: {formatCurrency(comparison.averageAmount, currency)}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs text-muted-foreground">
                              <span>You</span>
                              <div className="h-2 rounded-full bg-muted">
                                <div className="h-2 rounded-full bg-primary" style={{ width: `${userBarPercent}%` }} />
                              </div>
                              <span>{userBarPercent}%</span>
                            </div>
                            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs text-muted-foreground">
                              <span>Average</span>
                              <div className="h-2 rounded-full bg-muted">
                                <div className="h-2 rounded-full bg-accent" style={{ width: `${averageBarPercent}%` }} />
                              </div>
                              <span>{averageBarPercent}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <EmptyState
                    title="No comparison data"
                    description="Add expenses for this month before running the analysis."
                  />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Savings tips</CardTitle>
                <CardDescription>Concrete actions to cut overspending without guesswork.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {analysis.tips.map((tip) => (
                  <div key={tip} className="rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-foreground">
                    {tip}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/90">
              <CardHeader>
                <CardTitle>Positive patterns</CardTitle>
                <CardDescription>Behaviors worth keeping because they support healthy spending.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {analysis.positives.map((positive) => (
                  <div
                    key={positive}
                    className="rounded-2xl border border-border/70 bg-primary/8 px-4 py-3 text-sm text-foreground"
                  >
                    {positive}
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <EmptyState
          title="No AI analysis yet"
          description="Set your location and Gemini API key in Settings, then run the monthly analysis."
          action={<Button onClick={() => void runAnalysis()}>Analyze this month</Button>}
        />
      )}
    </div>
  )
}
