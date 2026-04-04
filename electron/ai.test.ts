import { describe, expect, it, vi } from 'vitest'
import type { AIAnalysisProgress, AIAnalysisResult, AppSettings } from '../shared/types'
import { analyzeInsights, getBenchmarkConfidence, readCachedAnalysis } from './ai'

const cachedAnalysis: AIAnalysisResult = {
  location: 'Cluj-Napoca, Romania',
  periodMonth: '2026-04',
  healthScore: 77,
  explanation: 'Steady budget.',
  tips: ['Reduce subscription sprawl.'],
  positives: ['Savings are consistent.'],
  comparisons: [],
  benchmarkConfidence: 'high',
  benchmarkSummary: 'City benchmark: Cluj-Napoca, Romania',
  dataSources: ['City cost + quality: wheretoemigrate.io'],
  cachedAt: '2026-04-02T08:00:00.000Z',
}

describe('readCachedAnalysis', () => {
  it('returns a fresh cached result when refresh is false', () => {
    const cached = {
      payload: JSON.stringify(cachedAnalysis),
      created_at: '2026-04-02T08:00:00.000Z',
    }

    expect(readCachedAnalysis(cached, false, Date.parse('2026-04-02T12:00:00.000Z'))).toEqual(cachedAnalysis)
  })

  it('ignores cached data when the caller explicitly refreshes', () => {
    const cached = {
      payload: JSON.stringify(cachedAnalysis),
      created_at: '2026-04-02T08:00:00.000Z',
    }

    expect(readCachedAnalysis(cached, true, Date.parse('2026-04-02T12:00:00.000Z'))).toBeNull()
  })

  it('ignores expired cached data', () => {
    const cached = {
      payload: JSON.stringify(cachedAnalysis),
      created_at: '2026-03-30T08:00:00.000Z',
    }

    expect(readCachedAnalysis(cached, false, Date.parse('2026-04-02T12:00:00.000Z'))).toBeNull()
  })
})

describe('getBenchmarkConfidence', () => {
  it('maps benchmark levels to confidence badges', () => {
    expect(getBenchmarkConfidence('city')).toBe('high')
    expect(getBenchmarkConfidence('ai-city')).toBe('medium')
    expect(getBenchmarkConfidence('country')).toBe('medium')
    expect(getBenchmarkConfidence('global')).toBe('low')
  })
})

const testSettings: AppSettings = {
  currency: 'RON',
  city: 'Bucharest',
  country: 'Romania',
  geminiApiKey: 'secret',
  theme: 'system',
  onboardingCompleted: '',
  notifyUpcomingBills: 'true',
  notifyBudgetAlerts: 'true',
  notifyIncomeAlerts: 'false',
  notifyRecurringGaps: 'true',
}

function createSnapshot() {
  return {
    spendingByCategory: [{ category: 'Food & Dining', amount: 400 }],
    totalIncome: 5000,
    totalSpent: 400,
    monthOverMonthChanges: [{ category: 'Food & Dining', currentAmount: 400, previousAmount: 300, delta: 100 }],
    pendingReviewCount: 0,
    upcomingBills: [],
    budgetOverview: {
      totalBudget: 1000,
      totalAvailable: 1000,
      totalSpent: 400,
      percentage: 40,
    },
  }
}

describe('analyzeInsights progress', () => {
  it('emits cache-hit progress and completes without contacting providers', async () => {
    const onProgress = vi.fn<(progress: AIAnalysisProgress) => void>()
    const database = {
      getSettings: () => testSettings,
      getCache: () => ({
        payload: JSON.stringify(cachedAnalysis),
        created_at: new Date().toISOString(),
      }),
    }

    const result = await analyzeInsights(database as never, '2026-04', false, { onProgress })

    expect(result).toEqual(cachedAnalysis)
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'checking-cache' }))
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'completed', usedCache: true, isTerminal: true }))
  })

  it('emits fallback progress when WTE is forbidden and Gemini city estimate is used', async () => {
    const onProgress = vi.fn<(progress: AIAnalysisProgress) => void>()
    const database = {
      getSettings: () => testSettings,
      getCache: vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(null),
      getMonthlySpendingSnapshot: () => createSnapshot(),
      setCache: vi.fn(),
    }
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          city: 'Bucharest',
          country: 'Romania',
          tier: 2,
          currency: 'EUR',
          monthly_cost_single_eur: 1200,
          monthly_cost_family_eur: 2200,
          rent_1br_center_eur: 700,
          rent_1br_periphery_eur: 520,
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          healthScore: 80,
          explanation: 'Stable.',
          varianceSummary: 'Food spending increased.',
          tips: ['Trim dining.'],
          riskSignals: [],
          safeCutIdeas: [],
          positives: ['Savings remain steady.'],
        }),
      })

    await analyzeInsights(database as never, '2026-04', false, {
      onProgress,
      client: { models: { generateContent } },
      fetchImpl: vi.fn(async (url: string) => {
        if (url.includes('wheretoemigrate.io')) {
          return new Response(null, { status: 403 })
        }

        if (url.includes('api.worldbank.org/v2/country?')) {
          return new Response(
            JSON.stringify([{}, [{ iso2Code: 'RO', name: 'Romania', region: { value: 'Europe' }, incomeLevel: { value: 'High income' } }]]),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        if (url.includes('/indicator/FP.CPI.TOTL.ZG')) {
          return new Response(JSON.stringify([{}, [{ value: 5.4, date: '2025' }]]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        return new Response(`<?xml version="1.0"?><Cube><Cube time="2026-04-02"><Cube currency="RON" rate="4.97" /></Cube></Cube>`, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        })
      }),
    })

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'estimating-city',
        fallbackSummary: expect.stringMatching(/fallback/i),
      }),
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'completed',
        providerStatuses: expect.objectContaining({
          wteCost: expect.objectContaining({ state: 'failed' }),
          geminiCityEstimate: expect.objectContaining({ state: 'success' }),
        }),
      }),
    )
  })

  it('emits a failed terminal progress update when final Gemini insight generation fails', async () => {
    const onProgress = vi.fn<(progress: AIAnalysisProgress) => void>()
    const database = {
      getSettings: () => testSettings,
      getCache: vi.fn().mockReturnValueOnce(null).mockReturnValueOnce({
        payload: JSON.stringify({
          cityCost: {
            city: 'Bucharest',
            country: 'Romania',
            tier: 2,
            currency: 'EUR',
            monthly_cost_single_eur: 1200,
            monthly_cost_family_eur: 2200,
            rent_1br_center_eur: 700,
            rent_1br_periphery_eur: 520,
          },
        }),
        created_at: '2026-04-03T08:00:00.000Z',
      }),
      getMonthlySpendingSnapshot: () => createSnapshot(),
      setCache: vi.fn(),
    }
    const generateContent = vi.fn().mockRejectedValue(new Error('Gemini final generation failed'))

    await expect(
      analyzeInsights(database as never, '2026-04', false, {
        onProgress,
        client: { models: { generateContent } },
        fetchImpl: vi.fn(async (url: string) => {
          if (url.includes('api.worldbank.org/v2/country?')) {
            return new Response(
              JSON.stringify([{}, [{ iso2Code: 'RO', name: 'Romania', region: { value: 'Europe' }, incomeLevel: { value: 'High income' } }]]),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            )
          }

          if (url.includes('/indicator/FP.CPI.TOTL.ZG')) {
            return new Response(JSON.stringify([{}, [{ value: 5.4, date: '2025' }]]), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          if (url.includes('wheretoemigrate.io')) {
            return new Response(null, { status: 403 })
          }

          return new Response(`<?xml version="1.0"?><Cube><Cube time="2026-04-02"><Cube currency="RON" rate="4.97" /></Cube></Cube>`, {
            status: 200,
            headers: { 'Content-Type': 'application/xml' },
          })
        }),
      }),
    ).rejects.toThrow('Gemini final generation failed')

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'failed', isTerminal: true }))
  })
})
