import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Clock3, MapPin, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type {
  AIAnalysisProgress,
  AIAnalysisProviderKey,
  AIAnalysisProviderStatus,
  AIAnalysisResult,
  AppSettings,
} from '../../shared/types'
import { CircularGauge } from '@/components/shared/CircularGauge'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { currentMonthValue, formatCurrency, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ipc } from '@/lib/ipc'

export function AIInsightsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(currentMonthValue())
  const [progress, setProgress] = useState<AIAnalysisProgress | null>(null)
  const [lastCompletedProgress, setLastCompletedProgress] = useState<AIAnalysisProgress | null>(null)
  const [showProviderDetails, setShowProviderDetails] = useState(false)
  const latestRequestIdRef = useRef<string | null>(null)

  useEffect(() => {
    void ipc.getSettings().then(setSettings)

    return ipc.onAIInsightsProgress((nextProgress) => {
      if (!latestRequestIdRef.current || nextProgress.requestId !== latestRequestIdRef.current) {
        return
      }

      setProgress(nextProgress)

      if (nextProgress.isTerminal) {
        setLastCompletedProgress(nextProgress)
      }
    })
  }, [])

  const setupIncomplete = Boolean(settings && (!settings.city || !settings.country || !settings.geminiApiKey))
  const currency = settings?.currency ?? 'USD'
  const location = settings?.city && settings?.country ? `${settings.city}, ${settings.country}` : 'Location not set'
  const noExpenseData = Boolean(analysis && analysis.comparisons.length === 0)
  const visibleProgress = loading ? progress : lastCompletedProgress
  const providerEntries = Object.entries(visibleProgress?.providerStatuses ?? {}) as [AIAnalysisProviderKey, AIAnalysisProviderStatus][]

  async function runAnalysis(refresh = false) {
    const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

    latestRequestIdRef.current = requestId
    setLoading(true)
    setError(null)
    setShowProviderDetails(false)
    setProgress({
      requestId,
      stage: 'checking-cache',
      message: 'Checking cached analysis',
      percent: 8,
      isTerminal: false,
      providerStatuses: {},
    })
    setLastCompletedProgress(null)

    try {
      const result = await ipc.analyzeInsights({ periodMonth: month, refresh, requestId })
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
            {loading && progress ? (
              <Badge variant="secondary" className="max-w-56 truncate">
                {formatStageLabel(progress.stage)}
              </Badge>
            ) : null}
            <Button onClick={() => void runAnalysis(Boolean(analysis))} disabled={loading || setupIncomplete}>
              <Sparkles data-icon="inline-start" />
              {loading ? progress?.message ?? 'Analyzing…' : analysis ? 'Refresh Analysis' : 'Analyze'}
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

      {visibleProgress ? (
        <Card className="border-border/80 bg-card/90">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{loading ? 'Analysis in progress' : visibleProgress.usedCache ? 'Loaded from cache' : 'Latest analysis run'}</CardTitle>
                <CardDescription>{formatStageLabel(visibleProgress.stage)}</CardDescription>
              </div>
              <Badge variant={visibleProgress.stage === 'failed' ? 'destructive' : visibleProgress.usedCache ? 'secondary' : 'outline'}>
                {visibleProgress.percent}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={visibleProgress.percent} className="h-3" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{visibleProgress.message}</p>
              {visibleProgress.fallbackSummary ? (
                <div className="rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-foreground">
                  {visibleProgress.fallbackSummary}
                </div>
              ) : null}
              {visibleProgress.usedCache && visibleProgress.cachedAt ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 className="size-4" />
                  Loaded cached analysis from {formatCacheTime(visibleProgress.cachedAt)}
                </div>
              ) : null}
              {visibleProgress.error ? <p className="text-sm text-destructive">{visibleProgress.error}</p> : null}
            </div>

            {providerEntries.length ? (
              <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/15 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Provider details</p>
                    <p className="text-xs text-muted-foreground">Live status for the free benchmark services and Gemini steps.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowProviderDetails((current) => !current)}>
                    Provider details
                    <ChevronDown className={cn('size-4 transition-transform', showProviderDetails && 'rotate-180')} />
                  </Button>
                </div>

                {showProviderDetails ? (
                  <div className="grid gap-3">
                    {providerEntries.map(([provider, status]) => (
                      <div key={provider} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{providerLabel(provider)}</p>
                          <p className="font-mono text-xs text-muted-foreground">{provider}</p>
                          {status.detail ? <p className="text-xs text-muted-foreground">{status.detail}</p> : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={providerBadgeVariant(status.state)}>{formatProviderState(status.state)}</Badge>
                          {typeof status.durationMs === 'number' ? (
                            <Badge variant="outline">{formatDuration(status.durationMs)}</Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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

      {loading ? null : setupIncomplete ? (
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
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">You: {formatCurrency(comparison.userAmount, currency)}</span>
                            <span className="text-muted-foreground">Average: {formatCurrency(comparison.averageAmount, currency)}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 text-xs">
                              <span className="text-muted-foreground">You</span>
                              <div className="h-2 rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full"
                                  style={{
                                    width: `${userBarPercent}%`,
                                    backgroundColor: comparison.percentDiff > 0 ? 'var(--color-destructive)' : 'var(--color-income)',
                                  }}
                                />
                              </div>
                              <span className="text-muted-foreground">{userBarPercent}%</span>
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
                  <CardTitle>What changed</CardTitle>
                  <CardDescription>Variance explanations focused on this month versus your recent pattern.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {analysis.varianceSummary ? (
                    <div className="rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-foreground">
                      {analysis.varianceSummary}
                    </div>
                  ) : null}
                  {analysis.riskSignals?.length ? (
                    analysis.riskSignals.map((signal) => (
                      <div key={signal} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-foreground">
                        <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
                        {signal}
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No variance flags yet" description="As your history fills in, Budgeter will call out changes worth attention." />
                  )}
                </CardContent>
              </Card>

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
                        className="flex items-start gap-3 rounded-2xl border border-border/70 bg-primary/8 px-4 py-3 text-sm text-foreground"
                      >
                        <CheckCircle2 className="size-4 shrink-0 text-[var(--color-income)]" aria-hidden="true" />
                        {positive}
                      </div>
                    ))
                  ) : (
                    <EmptyState title="No positive patterns yet" description="A few more categorized transactions will help surface repeatable healthy behaviors." />
                  )}
                  {analysis.safeCutIdeas?.length ? (
                    <>
                      <div className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Safe cuts this month</div>
                      {analysis.safeCutIdeas.map((idea) => (
                        <div key={idea} className="rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-foreground">
                          {idea}
                        </div>
                      ))}
                    </>
                  ) : null}
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

function formatStageLabel(stage: AIAnalysisProgress['stage']) {
  if (stage === 'checking-cache') return 'Checking cache'
  if (stage === 'loading-transactions') return 'Loading transactions'
  if (stage === 'fetching-benchmarks') return 'Fetching benchmarks'
  if (stage === 'estimating-city') return 'Estimating city benchmark'
  if (stage === 'generating-insights') return 'Generating AI insights'
  if (stage === 'completed') return 'Completed'
  return 'Failed'
}

function providerLabel(provider: AIAnalysisProviderKey) {
  if (provider === 'wteCost') return 'WhereToEmigrate Cost Index'
  if (provider === 'wteQuality') return 'WhereToEmigrate Quality Index'
  if (provider === 'wteDocs') return 'WhereToEmigrate API Docs'
  if (provider === 'worldBank') return 'World Bank'
  if (provider === 'ecb') return 'ECB FX'
  if (provider === 'geminiCityEstimate') return 'Gemini City Estimate'
  return 'Gemini Insights'
}

function formatProviderState(state: AIAnalysisProviderStatus['state']) {
  if (state === 'pending') return 'Pending'
  if (state === 'success') return 'Success'
  if (state === 'timeout') return 'Timed out'
  if (state === 'fallback') return 'Fallback'
  if (state === 'skipped') return 'Skipped'
  if (state === 'idle') return 'Idle'
  return 'Failed'
}

function providerBadgeVariant(state: AIAnalysisProviderStatus['state']): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (state === 'failed' || state === 'timeout') return 'destructive'
  if (state === 'success') return 'secondary'
  return 'outline'
}

function formatCacheTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
}
