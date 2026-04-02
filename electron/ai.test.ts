import { describe, expect, it } from 'vitest'
import type { AIAnalysisResult } from '../shared/types'
import { getBenchmarkConfidence, readCachedAnalysis } from './ai'

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
