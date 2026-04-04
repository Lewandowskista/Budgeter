import { randomUUID } from 'node:crypto'
import { GoogleGenAI } from '@google/genai'
import { DEFAULT_SETTINGS } from '../shared/constants'
import type {
  AIAnalysisProgress,
  AIAnalysisProviderKey,
  AIAnalysisProviderStatus,
  AIAnalysisResult,
  AIAnalysisStage,
  AIComparison,
  AppSettings,
  BenchmarkConfidence,
} from '../shared/types'
import type { DatabaseManager } from './database'

const ECB_FX_RATES_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
const WORLD_BANK_COUNTRIES_URL = 'https://api.worldbank.org/v2/country?format=json&per_page=400'
const WORLD_BANK_INFLATION_BASE_URL = 'https://api.worldbank.org/v2/country'
const WTE_API_DOCS_URL = 'https://wheretoemigrate.io/api'
const WTE_COST_INDEX_URL = 'https://wheretoemigrate.io/api/cost-index'
const WTE_QUALITY_INDEX_URL = 'https://wheretoemigrate.io/api/quality-index'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CITY_ESTIMATE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const FREE_PROVIDER_VERSION = 'free-hybrid-v1'
const CITY_ESTIMATE_VERSION = 'city-estimate-v1'
const DEFAULT_PROVIDER_TIMEOUT_MS: Record<AIAnalysisProviderKey, number> = {
  wteCost: 8_000,
  wteQuality: 8_000,
  wteDocs: 8_000,
  worldBank: 10_000,
  ecb: 8_000,
  geminiCityEstimate: 12_000,
  geminiInsights: 20_000,
}

interface CityCostRecord {
  country: string
  tier: number
  currency: string
  city: string
  monthly_cost_single_eur: number
  monthly_cost_family_eur: number
  rent_1br_center_eur: number
  rent_1br_periphery_eur: number
}

interface QualityIndexRecord {
  country: string
  security_score: number
  healthcare_score: number
  transport_score: number
  climate_score: number
  global_score: number
  internet_speed_mbps: number
  english_proficiency: string
}

interface WorldBankCountryRecord {
  iso2Code: string
  name: string
  region?: { value?: string }
  incomeLevel?: { value?: string }
}

interface WorldBankIndicatorRecord {
  value: number | null
  date?: string
}

interface CountryContext {
  iso2Code: string
  name: string
  region: string
  incomeLevel: string
  inflationRate: number | null
  inflationAsOf: string | null
}

interface BenchmarkProfile {
  cityCost: CityCostRecord
  monthlyCoreEur: number
  housingEur: number
  quality: QualityIndexRecord | null
  countryContext: CountryContext | null
  benchmarkLevel: 'city' | 'ai-city' | 'country' | 'global'
  benchmarkSummary: string
  fallbackSummary?: string
  dataSources: string[]
  sourceRecency: string[]
  fxRate: number
}

interface CachedCityEstimate {
  cityCost: CityCostRecord
}

interface WteApiDocUpdateDates {
  costIndexUpdatedAt: string | null
  qualityIndexUpdatedAt: string | null
}

interface CachedAnalysisRow {
  payload: string
  created_at: string
}

interface AnalyzeInsightsOptions {
  requestId?: string
  onProgress?: (progress: AIAnalysisProgress) => void
  client?: Pick<GoogleGenAI, 'models'>
  fetchImpl?: typeof fetch
  timeoutsMs?: Partial<Record<AIAnalysisProviderKey, number>>
  log?: (message: string, details?: Record<string, unknown>) => void
}

interface GeminiRequest {
  model: string
  contents: string
  config: {
    temperature: number
    responseMimeType: 'application/json'
  }
}

interface ProgressTracker {
  emit: (update: Partial<Omit<AIAnalysisProgress, 'requestId' | 'providerStatuses'>> & { providerStatuses?: AIAnalysisProgress['providerStatuses'] }) => void
  updateProvider: (provider: AIAnalysisProviderKey, status: AIAnalysisProviderStatus) => void
  getSnapshot: () => AIAnalysisProgress
}

class ProviderTimeoutError extends Error {
  constructor(provider: AIAnalysisProviderKey, timeoutMs: number) {
    super(`${provider} timed out after ${timeoutMs}ms.`)
    this.name = 'ProviderTimeoutError'
  }
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'united states',
  'united states of america': 'united states',
  uk: 'united kingdom',
  england: 'united kingdom',
  'czech republic': 'czechia',
  'south korea': 'korea rep',
  'republic of korea': 'korea rep',
  uae: 'united arab emirates',
}

export async function analyzeInsights(
  database: DatabaseManager,
  periodMonth: string,
  refresh = false,
  options: AnalyzeInsightsOptions = {},
): Promise<AIAnalysisResult> {
  const requestId = options.requestId ?? randomUUID()
  const progress = createProgressTracker(requestId, options.onProgress)
  const fetchImpl = options.fetchImpl ?? fetch
  const log = options.log ?? defaultLog
  const settings = { ...DEFAULT_SETTINGS, ...database.getSettings() }
  validateSettings(settings)
  const client = options.client ?? new GoogleGenAI({ apiKey: settings.geminiApiKey })
  const timeoutsMs = { ...DEFAULT_PROVIDER_TIMEOUT_MS, ...options.timeoutsMs }

  progress.emit({
    stage: 'checking-cache',
    message: 'Checking cached analysis',
    percent: 8,
    isTerminal: false,
  })

  const cacheKey = `${FREE_PROVIDER_VERSION}:${periodMonth}:${settings.city}:${settings.country}:${settings.currency}`
  const cached = database.getCache(cacheKey)
  const reusableCachedAnalysis = readCachedAnalysis(cached, refresh)

  if (reusableCachedAnalysis) {
    progress.emit({
      stage: 'completed',
      message: 'Loaded cached analysis',
      percent: 100,
      isTerminal: true,
      usedCache: true,
      cachedAt: reusableCachedAnalysis.cachedAt,
      fallbackSummary: getFallbackSummary(reusableCachedAnalysis.benchmarkLevel),
    })
    return reusableCachedAnalysis
  }

  try {
    progress.emit({
      stage: 'loading-transactions',
      message: 'Loading monthly spending data',
      percent: 18,
      isTerminal: false,
    })
    const snapshot = database.getMonthlySpendingSnapshot(periodMonth)
    progress.emit({
      stage: 'fetching-benchmarks',
      message: 'Checking public benchmark services',
      percent: 40,
      isTerminal: false,
    })
    const benchmark = await buildBenchmarkProfile(database, client, settings, {
      fetchImpl,
      progress,
      timeoutsMs,
      log,
    })
    const baselineComparisons = buildComparisons(snapshot.spendingByCategory, snapshot.totalIncome, benchmark)

    progress.emit({
      stage: 'generating-insights',
      message: 'Generating personalized AI insights',
      percent: 84,
      isTerminal: false,
      fallbackSummary: benchmark.fallbackSummary,
    })
    const response = await runGeminiRequest(
      'geminiInsights',
      client,
      {
        model: 'gemini-2.5-flash',
        contents: buildPrompt(settings, periodMonth, baselineComparisons, benchmark, snapshot),
        config: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      },
      progress,
      timeoutsMs.geminiInsights,
      log,
    )

    const parsed = parseJson(response.text)
    const result: AIAnalysisResult = {
      location: `${settings.city}, ${settings.country}`,
      periodMonth,
      healthScore: clampNumber(parsed.healthScore, 1, 100, 64),
      explanation:
        typeof parsed.explanation === 'string'
          ? parsed.explanation
          : 'Your budget is broadly stable, with a few categories that could be tightened.',
      varianceSummary: typeof parsed.varianceSummary === 'string' ? parsed.varianceSummary : undefined,
      tips: Array.isArray(parsed.tips) ? parsed.tips.filter(isNonEmptyString).slice(0, 5) : [],
      riskSignals: Array.isArray(parsed.riskSignals) ? parsed.riskSignals.filter(isNonEmptyString).slice(0, 4) : [],
      safeCutIdeas: Array.isArray(parsed.safeCutIdeas) ? parsed.safeCutIdeas.filter(isNonEmptyString).slice(0, 4) : [],
      positives: Array.isArray(parsed.positives) ? parsed.positives.filter(isNonEmptyString).slice(0, 5) : [],
      comparisons: baselineComparisons,
      benchmarkLevel: benchmark.benchmarkLevel,
      benchmarkConfidence: getBenchmarkConfidence(benchmark.benchmarkLevel),
      benchmarkSummary: benchmark.benchmarkSummary,
      dataSources: benchmark.dataSources,
      sourceRecency: benchmark.sourceRecency,
      cachedAt: new Date().toISOString(),
    }

    database.setCache(cacheKey, result)
    progress.emit({
      stage: 'completed',
      message: 'AI insights ready',
      percent: 100,
      isTerminal: true,
      fallbackSummary: benchmark.fallbackSummary,
      cachedAt: result.cachedAt,
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI analysis failed.'
    progress.emit({
      stage: 'failed',
      message: 'AI analysis failed',
      percent: 100,
      isTerminal: true,
      error: message,
    })
    throw error
  }
}

function createProgressTracker(requestId: string, onProgress?: (progress: AIAnalysisProgress) => void): ProgressTracker {
  let snapshot: AIAnalysisProgress = {
    requestId,
    stage: 'checking-cache',
    message: 'Checking cached analysis',
    percent: 0,
    isTerminal: false,
    providerStatuses: {},
  }

  function publish() {
    onProgress?.({
      ...snapshot,
      providerStatuses: { ...snapshot.providerStatuses },
    })
  }

  return {
    emit(update) {
      snapshot = {
        ...snapshot,
        ...update,
        providerStatuses: update.providerStatuses ? { ...snapshot.providerStatuses, ...update.providerStatuses } : snapshot.providerStatuses,
      }
      publish()
    },
    updateProvider(provider, status) {
      snapshot = {
        ...snapshot,
        providerStatuses: {
          ...snapshot.providerStatuses,
          [provider]: status,
        },
      }
      publish()
    },
    getSnapshot() {
      return snapshot
    },
  }
}

function defaultLog(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.info(`[AI Insights] ${message}`, details)
    return
  }

  console.info(`[AI Insights] ${message}`)
}

export function readCachedAnalysis(
  cached: CachedAnalysisRow | null,
  refresh: boolean,
  now = Date.now(),
): AIAnalysisResult | null {
  if (refresh || !cached) {
    return null
  }

  if (now - new Date(cached.created_at).getTime() >= CACHE_TTL_MS) {
    return null
  }

  return JSON.parse(cached.payload) as AIAnalysisResult
}

export function getBenchmarkConfidence(level: NonNullable<AIAnalysisResult['benchmarkLevel']>): BenchmarkConfidence {
  if (level === 'city') {
    return 'high'
  }

  if (level === 'global') {
    return 'low'
  }

  return 'medium'
}

function validateSettings(settings: AppSettings) {
  if (!settings.city || !settings.country) {
    throw new Error('Add your city and country in Settings before running AI insights.')
  }

  if (!settings.geminiApiKey) {
    throw new Error('Add your Gemini API key in Settings before running AI insights.')
  }
}

function buildComparisons(
  categories: Array<{ category: string; amount: number }>,
  totalIncome: number,
  benchmark: BenchmarkProfile,
): AIComparison[] {
  return categories.map((entry) => {
    const averageAmount = estimateAverage(entry.category, totalIncome, benchmark)
    const percentDiff = averageAmount > 0 ? ((entry.amount - averageAmount) / averageAmount) * 100 : 0

    return {
      category: entry.category,
      userAmount: entry.amount,
      averageAmount,
      percentDiff,
    }
  })
}

function estimateAverage(category: string, totalIncome: number, benchmark: BenchmarkProfile) {
  const quality = benchmark.quality
  const transportMultiplier = quality && quality.transport_score < 5 ? 1.12 : 1
  const healthcareMultiplier = quality && quality.healthcare_score < 5 ? 1.08 : 1
  const categoryWeights: Record<string, number> = {
    'Food & Dining': 0.24,
    Transport: 0.12 * transportMultiplier,
    Utilities: 0.1,
    Subscriptions: 0.05,
    Entertainment: 0.09,
    Healthcare: 0.08 * healthcareMultiplier,
    Shopping: 0.14,
    Other: 0.1,
  }

  if (category === 'Rent/Housing') {
    return convertEuroAmount(benchmark.housingEur, benchmark.fxRate)
  }

  if (category === 'Savings') {
    const targetSavingsRate = benchmark.countryContext?.incomeLevel === 'High income' ? 0.2 : 0.12
    return Math.max(totalIncome * targetSavingsRate, convertEuroAmount(benchmark.monthlyCoreEur * 0.08, benchmark.fxRate))
  }

  const totalWeight = Object.values(categoryWeights).reduce((sum, value) => sum + value, 0)
  const weight = categoryWeights[category] ?? 0.08
  return convertEuroAmount((benchmark.monthlyCoreEur * weight) / totalWeight, benchmark.fxRate)
}

function buildPrompt(
  settings: AppSettings,
  periodMonth: string,
  comparisons: AIComparison[],
  benchmark: BenchmarkProfile,
  snapshot: ReturnType<DatabaseManager['getMonthlySpendingSnapshot']>,
) {
  return `
You are a personal finance advisor.

User location: ${settings.city}, ${settings.country}
Analysis month: ${periodMonth}
Current date: ${new Date().toISOString().slice(0, 10)}
User monthly income: ${snapshot.totalIncome}
User monthly spending total: ${snapshot.totalSpent}
Benchmark summary: ${benchmark.benchmarkSummary}
Free public data sources:
- ${benchmark.dataSources.join('\n- ')}

Source recency context:
- ${benchmark.sourceRecency.join('\n- ')}

Country context:
${JSON.stringify(benchmark.countryContext, null, 2)}

Quality of life context:
${JSON.stringify(benchmark.quality, null, 2)}

Estimated local spending benchmarks by category:
${JSON.stringify(comparisons, null, 2)}

Month-over-month category changes:
${JSON.stringify(snapshot.monthOverMonthChanges, null, 2)}

Upcoming recurring commitments still due this month:
${JSON.stringify(snapshot.upcomingBills, null, 2)}

Budget overview:
${JSON.stringify(snapshot.budgetOverview, null, 2)}

Pending review transaction count:
${snapshot.pendingReviewCount}

Respond strictly as JSON:
{
  "healthScore": 0,
  "explanation": "",
  "varianceSummary": "",
  "tips": ["", ""],
  "riskSignals": ["", ""],
  "safeCutIdeas": ["", ""],
  "positives": ["", ""]
}

Requirements:
- Score between 1 and 100
- varianceSummary should explain what changed from last month in plain language
- 3 to 5 actionable tips
- 1 to 4 riskSignals about recurring bills, rollover pressure, or pending review items
- 1 to 4 safeCutIdeas that reduce spending with low disruption
- 2 to 4 positive patterns
- Treat the supplied benchmarks as estimates, not exact audited prices
- Base the advice on the supplied local estimates and user spending
- Give more weight to the freshest source dates when there is any tension between signals
- If the city benchmark falls back to country or global data, acknowledge that uncertainty in the explanation without sounding alarmist
`.trim()
}

function parseJson(text: string | undefined) {
  if (!text) throw new Error('Gemini returned an empty response.')

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('Gemini returned invalid JSON.')
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

async function buildBenchmarkProfile(
  database: DatabaseManager,
  client: Pick<GoogleGenAI, 'models'>,
  settings: AppSettings,
  context: {
    fetchImpl: typeof fetch
    progress: ProgressTracker
    timeoutsMs: Record<AIAnalysisProviderKey, number>
    log: (message: string, details?: Record<string, unknown>) => void
  },
): Promise<BenchmarkProfile> {
  if (settings.currency === 'EUR') {
    context.progress.updateProvider('ecb', { state: 'skipped', detail: 'EUR selected, no conversion needed.' })
  }

  const [wteDocsResult, costResult, qualityResult, countryContextResult, fxRateResult] = await Promise.allSettled([
    fetchWteApiDocUpdateDates(context.fetchImpl, context.progress, context.timeoutsMs.wteDocs, context.log),
    fetchJsonWithMeta<CityCostRecord[]>(WTE_COST_INDEX_URL, 'wteCost', 'application/json', context.fetchImpl, context.progress, context.timeoutsMs.wteCost, context.log),
    fetchJsonWithMeta<QualityIndexRecord[]>(WTE_QUALITY_INDEX_URL, 'wteQuality', 'application/json', context.fetchImpl, context.progress, context.timeoutsMs.wteQuality, context.log),
    fetchCountryContext(settings.country, context.fetchImpl, context.progress, context.timeoutsMs.worldBank, context.log),
    fetchFxRate(settings.currency, context.fetchImpl, context.progress, context.timeoutsMs.ecb, context.log),
  ])

  if (fxRateResult.status !== 'fulfilled') {
    throw new Error(`Currency conversion data for ${settings.currency} is temporarily unavailable.`)
  }

  const costData = costResult.status === 'fulfilled' ? costResult.value.data : []
  const countryRecords = costData.filter((record) => isSameCountry(record.country, settings.country))
  const directCityMatch = countryRecords.find((record) => isSameLocation(record.city, settings.city))

  const countryAverage = averageCityRecords(countryRecords, settings.country)
  const globalAverage = averageCityRecords(costData, settings.country)
  let cityCost: CityCostRecord | null = directCityMatch ?? null
  let benchmarkLevel: BenchmarkProfile['benchmarkLevel'] = 'city'

  if (!cityCost) {
    cityCost = getCachedCityEstimate(database, settings)
    if (cityCost) {
      benchmarkLevel = 'ai-city'
      context.progress.updateProvider('geminiCityEstimate', {
        state: 'fallback',
        detail: 'Using cached city estimate from a previous Gemini fallback.',
      })
    }
  }

  if (!cityCost) {
    context.progress.emit({
      stage: 'estimating-city',
      message: 'Estimating city benchmark with Gemini fallback',
      percent: 62,
      isTerminal: false,
      fallbackSummary: 'Direct city benchmark unavailable, preparing fallback sources.',
    })
    cityCost = await inferCityCostWithAI(client, settings, {
      countryRecords,
      countryAverage,
      globalAverage,
      countryContext: countryContextResult.status === 'fulfilled' ? countryContextResult.value : null,
    }, context.progress, context.timeoutsMs.geminiCityEstimate, context.log)

    if (cityCost) {
      benchmarkLevel = 'ai-city'
      database.setCache(cityEstimateCacheKey(settings), { cityCost })
    }
  }

  if (!cityCost && countryAverage) {
    cityCost = countryAverage
    benchmarkLevel = 'country'
    context.progress.emit({
      fallbackSummary: 'Direct city benchmark unavailable, using country-level average data.',
    })
  }

  if (!cityCost && globalAverage) {
    cityCost = globalAverage
    benchmarkLevel = 'global'
    context.progress.emit({
      fallbackSummary: 'Direct city and country benchmarks unavailable, using a global proxy.',
    })
  }

  if (!cityCost) {
    throw new Error('No benchmark data is available for this city right now. Try again later.')
  }

  const quality =
    qualityResult.status === 'fulfilled'
      ? qualityResult.value.data.find((record) => isSameCountry(record.country, settings.country)) ??
        averageQualityRecords(qualityResult.value.data)
      : null
  const countryContext = countryContextResult.status === 'fulfilled' ? countryContextResult.value : null
  const wteDocDates = wteDocsResult.status === 'fulfilled' ? wteDocsResult.value : null
  const costAsOf = wteDocDates?.costIndexUpdatedAt ?? (costResult.status === 'fulfilled' ? costResult.value.lastModified : null)
  const qualityAsOf =
    wteDocDates?.qualityIndexUpdatedAt ?? (qualityResult.status === 'fulfilled' ? qualityResult.value.lastModified : null)
  const inflationMultiplier = getInflationMultiplier(countryContext?.inflationRate ?? null)
  const housingEur = average([cityCost.rent_1br_center_eur, cityCost.rent_1br_periphery_eur]) * inflationMultiplier
  const monthlyCoreEur = Math.max(cityCost.monthly_cost_single_eur * 0.72, cityCost.monthly_cost_single_eur - housingEur * 0.18)

  return {
    cityCost,
    monthlyCoreEur,
    housingEur,
    quality,
    countryContext,
    benchmarkLevel,
    benchmarkSummary: buildBenchmarkSummary(benchmarkLevel, cityCost, settings),
    fallbackSummary: getFallbackSummary(benchmarkLevel),
    dataSources: buildDataSources({
      currency: settings.currency,
      benchmarkLevel,
      hadStructuredCostData: costData.length > 0,
    }),
    sourceRecency: buildSourceRecency({
      benchmarkLevel,
      costAsOf,
      qualityAsOf,
      inflationAsOf: countryContext?.inflationAsOf ?? null,
      fxAsOf: fxRateResult.value.asOf,
    }),
    fxRate: fxRateResult.value.rate,
  }
}

async function fetchCountryContext(
  countryName: string,
  fetchImpl: typeof fetch,
  progress: ProgressTracker,
  timeoutMs: number,
  log: (message: string, details?: Record<string, unknown>) => void,
): Promise<CountryContext | null> {
  progress.updateProvider('worldBank', { state: 'pending', detail: 'Fetching country context.' })
  const startedAt = Date.now()

  try {
    const response = await fetchJson<[unknown, WorldBankCountryRecord[]]>(WORLD_BANK_COUNTRIES_URL, fetchImpl, timeoutMs, 'worldBank')
    const countries = Array.isArray(response[1]) ? response[1] : []
    const country = countries.find((item) => isSameCountry(item.name, countryName))

    if (!country) {
      progress.updateProvider('worldBank', {
        state: 'success',
        detail: `No World Bank country match for ${countryName}.`,
        durationMs: Date.now() - startedAt,
      })
      return null
    }

    const inflationResponse = await fetchJson<[unknown, WorldBankIndicatorRecord[]]>(
      `${WORLD_BANK_INFLATION_BASE_URL}/${country.iso2Code.toLowerCase()}/indicator/FP.CPI.TOTL.ZG?format=json&mrnev=1&gapfill=Y`,
      fetchImpl,
      timeoutMs,
      'worldBank',
    )
    const inflationRecords = Array.isArray(inflationResponse[1]) ? inflationResponse[1] : []
    const latestInflationRecord = inflationRecords.find((record) => typeof record.value === 'number') ?? null
    const inflationRate = latestInflationRecord?.value ?? null
    const inflationAsOf = latestInflationRecord?.date ?? null

    const result = {
      iso2Code: country.iso2Code,
      name: country.name,
      region: country.region?.value || 'Unknown region',
      incomeLevel: country.incomeLevel?.value || 'Unknown income group',
      inflationRate,
      inflationAsOf,
    }
    progress.updateProvider('worldBank', {
      state: 'success',
      detail: 'Country context loaded.',
      durationMs: Date.now() - startedAt,
    })
    log('Provider completed', { provider: 'worldBank', durationMs: Date.now() - startedAt, country: country.name })
    return result
  } catch (error) {
    const status = toProviderFailureStatus(error)
    progress.updateProvider('worldBank', {
      state: status,
      detail: getErrorMessage(error),
      durationMs: Date.now() - startedAt,
    })
    log('Provider failed', { provider: 'worldBank', state: status, error: getErrorMessage(error) })
    throw error
  }
}

async function fetchFxRate(
  currency: string,
  fetchImpl: typeof fetch,
  progress: ProgressTracker,
  timeoutMs: number,
  log: (message: string, details?: Record<string, unknown>) => void,
): Promise<{ rate: number; asOf: string | null }> {
  if (currency === 'EUR') {
    return { rate: 1, asOf: new Date().toISOString().slice(0, 10) }
  }

  progress.updateProvider('ecb', { state: 'pending', detail: `Fetching ${currency} conversion rate.` })
  const startedAt = Date.now()

  try {
    const response = await fetchWithTimeout('ecb', ECB_FX_RATES_URL, fetchImpl, timeoutMs, { Accept: 'application/xml,text/xml' })
    if (!response.ok) {
      throw new Error(`ECB exchange rate request failed with status ${response.status}.`)
    }

    const xml = await response.text()
    const asOf = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1] ?? null
    const matches = xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)
    const rates = new Map<string, number>()

    for (const match of matches) {
      rates.set(match[1], Number(match[2]))
    }

    const rate = rates.get(currency)
    if (!rate) {
      throw new Error(`No ECB exchange rate was found for ${currency}.`)
    }

    progress.updateProvider('ecb', {
      state: 'success',
      detail: `Loaded ${currency} conversion rate.`,
      durationMs: Date.now() - startedAt,
    })
    log('Provider completed', { provider: 'ecb', durationMs: Date.now() - startedAt, currency })
    return { rate, asOf }
  } catch (error) {
    const status = toProviderFailureStatus(error)
    progress.updateProvider('ecb', {
      state: status,
      detail: getErrorMessage(error),
      durationMs: Date.now() - startedAt,
    })
    log('Provider failed', { provider: 'ecb', state: status, error: getErrorMessage(error) })
    throw error
  }
}

async function fetchJson<T>(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  provider: AIAnalysisProviderKey,
): Promise<T> {
  return (await fetchJsonWithMeta<T>(url, provider, 'application/json', fetchImpl, undefined, timeoutMs)).data
}

async function fetchJsonWithMeta<T>(
  url: string,
  provider?: AIAnalysisProviderKey,
  accept = 'application/json',
  fetchImpl: typeof fetch = fetch,
  progress?: ProgressTracker,
  timeoutMs = 8_000,
  log?: (message: string, details?: Record<string, unknown>) => void,
): Promise<{ data: T; lastModified: string | null }> {
  const startedAt = Date.now()

  if (provider && progress) {
    progress.updateProvider(provider, { state: 'pending', detail: `Fetching ${provider}.` })
  }

  try {
    const response = await fetchWithTimeout(provider ?? 'wteDocs', url, fetchImpl, timeoutMs, { Accept: accept })
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`)
    }

    const result = {
      data: (await response.json()) as T,
      lastModified: normalizeHttpDate(response.headers.get('last-modified') ?? response.headers.get('date')),
    }

    if (provider && progress) {
      progress.updateProvider(provider, {
        state: 'success',
        detail: `${provider} responded successfully.`,
        durationMs: Date.now() - startedAt,
      })
    }

    log?.('Provider completed', { provider, durationMs: Date.now() - startedAt, url })
    return result
  } catch (error) {
    if (provider && progress) {
      const status = toProviderFailureStatus(error)
      progress.updateProvider(provider, {
        state: status,
        detail: getErrorMessage(error),
        durationMs: Date.now() - startedAt,
      })
      log?.('Provider failed', { provider, state: status, error: getErrorMessage(error), url })
    }

    throw error
  }
}

async function fetchWteApiDocUpdateDates(
  fetchImpl: typeof fetch,
  progress: ProgressTracker,
  timeoutMs: number,
  log: (message: string, details?: Record<string, unknown>) => void,
): Promise<WteApiDocUpdateDates> {
  const startedAt = Date.now()
  progress.updateProvider('wteDocs', { state: 'pending', detail: 'Checking WhereToEmigrate API docs.' })

  try {
    const response = await fetchWithTimeout('wteDocs', WTE_API_DOCS_URL, fetchImpl, timeoutMs, { Accept: 'text/html' })
    if (!response.ok) {
      throw new Error(`WTE API docs request failed with status ${response.status}.`)
    }

    const html = await response.text()
    const result = {
      costIndexUpdatedAt: extractWteUpdatedAt(html, '/api/cost-index'),
      qualityIndexUpdatedAt: extractWteUpdatedAt(html, '/api/quality-index'),
    }
    progress.updateProvider('wteDocs', {
      state: 'success',
      detail: 'WhereToEmigrate API docs loaded.',
      durationMs: Date.now() - startedAt,
    })
    log('Provider completed', { provider: 'wteDocs', durationMs: Date.now() - startedAt })
    return result
  } catch (error) {
    const status = toProviderFailureStatus(error)
    progress.updateProvider('wteDocs', {
      state: status,
      detail: getErrorMessage(error),
      durationMs: Date.now() - startedAt,
    })
    log('Provider failed', { provider: 'wteDocs', state: status, error: getErrorMessage(error) })
    throw error
  }
}

function getCachedCityEstimate(database: DatabaseManager, settings: AppSettings) {
  const cached = database.getCache(cityEstimateCacheKey(settings))
  if (!cached) {
    return null
  }

  if (Date.now() - new Date(cached.created_at).getTime() > CITY_ESTIMATE_TTL_MS) {
    return null
  }

  try {
    const parsed = JSON.parse(cached.payload) as Partial<CachedCityEstimate>
    return normalizeCityCostRecord(parsed.cityCost, settings)
  } catch {
    return null
  }
}

async function inferCityCostWithAI(
  client: Pick<GoogleGenAI, 'models'>,
  settings: AppSettings,
  context: {
    countryRecords: CityCostRecord[]
    countryAverage: CityCostRecord | null
    globalAverage: CityCostRecord | null
    countryContext: CountryContext | null
  },
  progress: ProgressTracker,
  timeoutMs: number,
  log: (message: string, details?: Record<string, unknown>) => void,
) {
  const sampleCountryRecords = context.countryRecords.slice(0, 8)
  const response = await runGeminiRequest(
    'geminiCityEstimate',
    client,
    {
      model: 'gemini-2.5-flash',
      contents: buildCityEstimatePrompt(settings, context, sampleCountryRecords),
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    },
    progress,
    timeoutMs,
    log,
  )

  const parsed = parseJson(response.text)
  return normalizeCityCostRecord(parsed, settings)
}

function getFallbackSummary(level: AIAnalysisResult['benchmarkLevel']) {
  if (level === 'ai-city') {
    return 'Direct city benchmark unavailable, using AI-estimated city data.'
  }

  if (level === 'country') {
    return 'Direct city benchmark unavailable, using country-level average data.'
  }

  if (level === 'global') {
    return 'Direct city and country benchmarks unavailable, using a global proxy.'
  }

  return undefined
}

async function fetchWithTimeout(
  provider: AIAnalysisProviderKey,
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  headers: Record<string, string>,
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(new ProviderTimeoutError(provider, timeoutMs)), timeoutMs)

  try {
    return await fetchImpl(url, {
      headers,
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderTimeoutError(provider, timeoutMs)
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function runGeminiRequest(
  provider: 'geminiCityEstimate' | 'geminiInsights',
  client: Pick<GoogleGenAI, 'models'>,
  input: GeminiRequest,
  progress: ProgressTracker,
  timeoutMs: number,
  log: (message: string, details?: Record<string, unknown>) => void,
) {
  progress.updateProvider(provider, { state: 'pending', detail: `Calling ${provider}.` })
  const startedAt = Date.now()

  try {
    const response = await withPromiseTimeout(client.models.generateContent(input), provider, timeoutMs)
    progress.updateProvider(provider, {
      state: 'success',
      detail: `${provider} completed.`,
      durationMs: Date.now() - startedAt,
    })
    log('Provider completed', { provider, durationMs: Date.now() - startedAt })
    return response
  } catch (error) {
    const status = toProviderFailureStatus(error)
    progress.updateProvider(provider, {
      state: status,
      detail: getErrorMessage(error),
      durationMs: Date.now() - startedAt,
    })
    log('Provider failed', { provider, state: status, error: getErrorMessage(error) })
    throw error
  }
}

async function withPromiseTimeout<T>(promise: Promise<T>, provider: AIAnalysisProviderKey, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new ProviderTimeoutError(provider, timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function toProviderFailureStatus(error: unknown): AIAnalysisProviderStatus['state'] {
  return error instanceof ProviderTimeoutError ? 'timeout' : 'failed'
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function averageCityRecords(records: CityCostRecord[], fallbackCountry: string): CityCostRecord | null {
  if (!records.length) {
    return null
  }

  return {
    country: records[0]?.country ?? fallbackCountry,
    city: records.length === 1 ? records[0].city : `${records[0].country} average`,
    currency: 'EUR',
    tier: Math.round(average(records.map((record) => record.tier))),
    monthly_cost_single_eur: average(records.map((record) => record.monthly_cost_single_eur)),
    monthly_cost_family_eur: average(records.map((record) => record.monthly_cost_family_eur)),
    rent_1br_center_eur: average(records.map((record) => record.rent_1br_center_eur)),
    rent_1br_periphery_eur: average(records.map((record) => record.rent_1br_periphery_eur)),
  }
}

function buildCityEstimatePrompt(
  settings: AppSettings,
  context: {
    countryAverage: CityCostRecord | null
    globalAverage: CityCostRecord | null
    countryContext: CountryContext | null
  },
  sampleCountryRecords: CityCostRecord[],
) {
  return `
You estimate city-level cost-of-living data for a budgeting app when the structured dataset does not include the requested city.

Target city: ${settings.city}
Target country: ${settings.country}

Known same-country city records:
${JSON.stringify(sampleCountryRecords, null, 2)}

Same-country average:
${JSON.stringify(context.countryAverage, null, 2)}

Global average:
${JSON.stringify(context.globalAverage, null, 2)}

Country context:
${JSON.stringify(context.countryContext, null, 2)}

Return only JSON with this shape:
{
  "city": "${settings.city}",
  "country": "${settings.country}",
  "tier": 2,
  "currency": "EUR",
  "monthly_cost_single_eur": 0,
  "monthly_cost_family_eur": 0,
  "rent_1br_center_eur": 0,
  "rent_1br_periphery_eur": 0
}

Rules:
- Use EUR for every amount
- Keep the estimate conservative and internally consistent
- monthly_cost_family_eur must be greater than monthly_cost_single_eur
- rent_1br_center_eur must be greater than or equal to rent_1br_periphery_eur
- monthly_cost_single_eur must be greater than rent_1br_center_eur
- tier must be 1, 2, or 3
- Use the known country records when available, otherwise infer from the country context and global average
- Do not include any explanation or markdown
`.trim()
}

function averageQualityRecords(records: QualityIndexRecord[]): QualityIndexRecord | null {
  if (!records.length) {
    return null
  }

  return {
    country: 'Global benchmark',
    security_score: average(records.map((record) => record.security_score)),
    healthcare_score: average(records.map((record) => record.healthcare_score)),
    transport_score: average(records.map((record) => record.transport_score)),
    climate_score: average(records.map((record) => record.climate_score)),
    global_score: average(records.map((record) => record.global_score)),
    internet_speed_mbps: average(records.map((record) => record.internet_speed_mbps)),
    english_proficiency: 'mixed',
  }
}

function buildBenchmarkSummary(
  level: BenchmarkProfile['benchmarkLevel'],
  cityCost: CityCostRecord,
  settings: AppSettings,
) {
  if (level === 'city') {
    return `City benchmark: ${cityCost.city}, ${cityCost.country}`
  }

  if (level === 'ai-city') {
    return `AI city estimate: ${settings.city}, ${settings.country}`
  }

  if (level === 'country') {
    return `Country proxy: averaged city benchmark for ${settings.country}`
  }

  return 'Global proxy: blended cross-country benchmark'
}

function buildDataSources({
  currency,
  benchmarkLevel,
  hadStructuredCostData,
}: {
  currency: string
  benchmarkLevel: BenchmarkProfile['benchmarkLevel']
  hadStructuredCostData: boolean
}) {
  const sources = [] as string[]

  if (hadStructuredCostData) {
    sources.push('City cost + quality: wheretoemigrate.io')
  }

  if (benchmarkLevel === 'ai-city') {
    sources.push('City fallback estimate: Gemini')
  }

  sources.push('Country inflation: World Bank')

  if (currency !== 'EUR') {
    sources.push('FX conversion: ECB reference rates')
  }

  return sources
}

function getInflationMultiplier(inflationRate: number | null) {
  if (inflationRate == null) {
    return 1
  }

  return 1 + Math.min(Math.max(inflationRate, -5), 15) / 100
}

function convertEuroAmount(amount: number, fxRate: number) {
  return amount * fxRate
}

function cityEstimateCacheKey(settings: AppSettings) {
  return `${CITY_ESTIMATE_VERSION}:${normalizeValue(settings.city)}:${normalizeCountryName(settings.country)}`
}

function normalizeCityCostRecord(value: unknown, settings: AppSettings): CityCostRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<CityCostRecord>
  const monthlySingle = toPositiveNumber(candidate.monthly_cost_single_eur)
  const monthlyFamily = toPositiveNumber(candidate.monthly_cost_family_eur)
  const rentCenter = toPositiveNumber(candidate.rent_1br_center_eur)
  const rentPeriphery = toPositiveNumber(candidate.rent_1br_periphery_eur)

  if (
    !monthlySingle ||
    !monthlyFamily ||
    !rentCenter ||
    !rentPeriphery ||
    monthlyFamily <= monthlySingle ||
    rentCenter < rentPeriphery ||
    monthlySingle <= rentCenter
  ) {
    return null
  }

  const tier = clampInteger(candidate.tier, 1, 3, 2)

  return {
    city: typeof candidate.city === 'string' && candidate.city.trim() ? candidate.city.trim() : settings.city,
    country: typeof candidate.country === 'string' && candidate.country.trim() ? candidate.country.trim() : settings.country,
    currency: 'EUR',
    tier,
    monthly_cost_single_eur: monthlySingle,
    monthly_cost_family_eur: monthlyFamily,
    rent_1br_center_eur: rentCenter,
    rent_1br_periphery_eur: rentPeriphery,
  }
}

function buildSourceRecency({
  benchmarkLevel,
  costAsOf,
  qualityAsOf,
  inflationAsOf,
  fxAsOf,
}: {
  benchmarkLevel: BenchmarkProfile['benchmarkLevel']
  costAsOf: string | null
  qualityAsOf: string | null
  inflationAsOf: string | null
  fxAsOf: string | null
}) {
  const notes = [] as string[]

  if (costAsOf) {
    notes.push(`City cost benchmark as of ${costAsOf}`)
  }

  if (qualityAsOf) {
    notes.push(`Quality benchmark as of ${qualityAsOf}`)
  }

  if (inflationAsOf) {
    notes.push(`World Bank inflation observation year ${inflationAsOf}`)
  }

  if (fxAsOf) {
    notes.push(`ECB FX rate date ${fxAsOf}`)
  }

  if (benchmarkLevel === 'ai-city') {
    notes.push(`AI city fallback estimate generated on ${new Date().toISOString().slice(0, 10)}`)
  }

  return notes.length ? notes : ['Source recency not available from upstream responses']
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value))
  if (!valid.length) return 0
  return valid.reduce((sum, value) => sum + value, 0) / valid.length
}

function isSameLocation(left: string, right: string) {
  return normalizeValue(left) === normalizeValue(right)
}

function isSameCountry(left: string, right: string) {
  return normalizeCountryName(left) === normalizeCountryName(right)
}

function normalizeCountryName(value: string) {
  const normalized = normalizeValue(value)
  return COUNTRY_ALIASES[normalized] ?? normalized
}

function normalizeValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function toPositiveNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.trim()) : Number.NaN

  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function normalizeHttpDate(value: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString().slice(0, 10)
}

function extractWteUpdatedAt(html: string, endpoint: string) {
  const escapedEndpoint = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`${escapedEndpoint}[\\s\\S]*?Updated\\s+(\\d{4}-\\d{2}-\\d{2})`, 'i')
  return html.match(pattern)?.[1] ?? null
}
