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

  const setupIncomplete = Boolean(settings && (!settings.city || !settings.country || !settings.geminiApiKey))
  const currency = settings?.currency ?? 'USD'
  const location = settings?.city && settings?.country ? `${settings.city}, ${settings.country}` : 'Location not set'
  const noExpenseData = Boolean(analysis && analysis.comparisons.length === 0)

  async function runAnalysis(refresh = false) {
    setLoading(true)
    setError(null)
    try {
      const result = await ipc.analyzeInsights({ periodMonth: month, refresh })
      setAnalysis(result)
    } catch (caughtError) {
      setAnalysis(null)
      setError(caughtError instanceof Error ? caughtError.message : 'AI analysis failed.')
    } finally {
      setLoading(false)
    }
  }

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
            <Button onClick={() => void runAnalysis(Boolean(analysis))} disabled={loading || setupIncomplete}>
              <Sparkles data-icon="inline-start" />
              {loading ? 'Analyzing…' : analysis ? 'Refresh Analysis' : 'Analyze'}
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
              {analysis.benchmarkLevel ? <Badge variant="outline">{formatBenchmarkLevel(analysis.benchmarkLevel)}</Badge> : null}
              {analysis.benchmarkConfidence ? (
                <Badge variant="outline">Confidence: {analysis.benchmarkConfidence}</Badge>
              ) : null}
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{getBenchmarkNarrative(analysis)}</p>
              {analysis.sourceRecency?.length ? (
                <ul className="space-y-1">
                  {analysis.sourceRecency.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="h-48 rounded-3xl" />
        </div>
      ) : setupIncomplete ? (
        <EmptyState
          title="AI setup incomplete"
          description="Add your city, country, and Gemini API key in Settings before running an analysis."
          action={
            <Button asChild>
              <Link to="/settings">Open Settings</Link>
            </Button>
          }
        />
      ) : error ? (
        <EmptyState
          title="Analysis request failed"
          description={error}
          action={<Button onClick={() => void runAnalysis(Boolean(analysis))}>Try again</Button>}
        />
      ) : analysis ? (
        noExpenseData ? (
          <EmptyState
            title="No expense data for this month"
            description="Add expense transactions for the selected month, then rerun the analysis to compare your spending against local benchmarks."
            action={<Button onClick={() => void runAnalysis(true)}>Refresh analysis</Button>}
          />
        ) : (
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
                  {analysis.comparisons.map((comparison) => {
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
                  })}
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
                  {analysis.tips.length ? (
                    analysis.tips.map((tip) => (
                      <div key={tip} className="rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-foreground">
                        {tip}
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No targeted tips yet" description="Add more category spending to unlock more specific savings suggestions." />
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/90">
                <CardHeader>
                  <CardTitle>Positive patterns</CardTitle>
                  <CardDescription>Behaviors worth keeping because they support healthy spending.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {analysis.positives.length ? (
                    analysis.positives.map((positive) => (
                      <div
                        key={positive}
                        className="rounded-2xl border border-border/70 bg-primary/8 px-4 py-3 text-sm text-foreground"
                      >
                        {positive}
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No positive patterns yet" description="A few more categorized transactions will help surface repeatable healthy behaviors." />
                  )}
                </CardContent>
              </Card>
            </section>
          </>
        )
      ) : (
        <EmptyState
          title="No AI analysis yet"
          description="Run the monthly analysis to compare your spending against local benchmarks."
          action={<Button onClick={() => void runAnalysis()}>Run analysis for this month</Button>}
        />
      )}
    </div>
  )
}

function formatBenchmarkLevel(level: NonNullable<AIAnalysisResult['benchmarkLevel']>) {
  if (level === 'city') return 'Direct city benchmark'
  if (level === 'ai-city') return 'Estimated city benchmark'
  if (level === 'country') return 'Country proxy benchmark'
  return 'Global proxy benchmark'
}

function getBenchmarkNarrative(analysis: AIAnalysisResult) {
  if (analysis.benchmarkLevel === 'ai-city') {
    return 'This result uses an estimated city benchmark built from structured public data and Gemini fallback, so treat it as directional rather than audited.'
  }

  if (analysis.benchmarkLevel === 'country') {
    return 'This result falls back to a country-level proxy because direct city benchmark data was unavailable for the selected location.'
  }

  if (analysis.benchmarkLevel === 'global') {
    return 'This result falls back to a global proxy because neither direct city nor country benchmark data was available for the selected location.'
  }

  return 'Budgeter blends free benchmark services with Gemini-generated city fallback data before generating guidance.'
}
