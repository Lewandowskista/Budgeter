import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIAnalysisResult, AppSettings } from '../../shared/types'
import { AIInsightsPage } from './AIInsights'

const mockIpc = vi.hoisted(() => ({
  getSettings: vi.fn(),
  analyzeInsights: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({
  ipc: mockIpc,
}))

const completeSettings: AppSettings = {
  currency: 'USD',
  city: 'Cluj-Napoca',
  country: 'Romania',
  geminiApiKey: 'secret',
  theme: 'system',
}

const analysis: AIAnalysisResult = {
  location: 'Cluj-Napoca, Romania',
  periodMonth: '2026-04',
  healthScore: 73,
  explanation: 'Reasonable baseline.',
  tips: ['Trim subscriptions.'],
  positives: ['Savings are healthy.'],
  comparisons: [
    {
      category: 'Transport',
      userAmount: 100,
      averageAmount: 120,
      percentDiff: -16.7,
    },
  ],
  benchmarkLevel: 'ai-city',
  benchmarkConfidence: 'medium',
  benchmarkSummary: 'Estimated city benchmark for Cluj-Napoca',
  dataSources: ['WhereToEmigrate cost index'],
  sourceRecency: ['Estimated city benchmark generated from country-level public sources.'],
  cachedAt: '2026-04-02T08:00:00.000Z',
}

describe('AIInsightsPage', () => {
  beforeEach(() => {
    mockIpc.getSettings.mockReset()
    mockIpc.analyzeInsights.mockReset()
  })

  it('shows a missing-settings state before analysis can run', async () => {
    mockIpc.getSettings.mockResolvedValue({
      ...completeSettings,
      geminiApiKey: '',
    })

    render(
      <MemoryRouter>
        <AIInsightsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('AI setup incomplete')).toBeInTheDocument()
    expect(screen.getByText(/add your city, country, and gemini api key/i)).toBeInTheDocument()
  })

  it('shows confidence and proxy fallback messaging for estimated benchmarks', async () => {
    mockIpc.getSettings.mockResolvedValue(completeSettings)
    mockIpc.analyzeInsights.mockResolvedValue(analysis)

    render(
      <MemoryRouter>
        <AIInsightsPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /analyze/i }))

    expect(await screen.findByText('Estimated city benchmark')).toBeInTheDocument()
    expect(screen.getByText('Confidence: medium')).toBeInTheDocument()
    expect(screen.getByText(/uses an estimated city benchmark/i)).toBeInTheDocument()
  })

  it('shows a retryable error state when analysis fails after setup is complete', async () => {
    mockIpc.getSettings.mockResolvedValue(completeSettings)
    mockIpc.analyzeInsights.mockRejectedValue(new Error('Service unavailable'))

    render(
      <MemoryRouter>
        <AIInsightsPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /analyze/i }))

    expect(await screen.findByText('Analysis request failed')).toBeInTheDocument()
    expect(screen.getByText('Service unavailable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    await waitFor(() => {
      expect(mockIpc.analyzeInsights).toHaveBeenCalledTimes(2)
    })
  })

  it('shows a no-expense-data state when analysis returns no comparisons', async () => {
    mockIpc.getSettings.mockResolvedValue(completeSettings)
    mockIpc.analyzeInsights.mockResolvedValue({
      ...analysis,
      comparisons: [],
      tips: [],
      positives: [],
    })

    render(
      <MemoryRouter>
        <AIInsightsPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /analyze/i }))

    expect(await screen.findByText('No expense data for this month')).toBeInTheDocument()
  })
})
