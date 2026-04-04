import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIAnalysisProgress, AIAnalysisResult, AppSettings } from '../../shared/types'
import { AIInsightsPage } from './AIInsights'

const mockIpc = vi.hoisted(() => ({
  getSettings: vi.fn(),
  analyzeInsights: vi.fn(),
  onAIInsightsProgress: vi.fn(),
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
  onboardingCompleted: '',
  notifyUpcomingBills: 'true',
  notifyBudgetAlerts: 'true',
  notifyIncomeAlerts: 'false',
  notifyRecurringGaps: 'true',
  savingsGoal: '20',
}

const analysis: AIAnalysisResult = {
  location: 'Cluj-Napoca, Romania',
  periodMonth: '2026-04',
  healthScore: 73,
  explanation: 'Reasonable baseline.',
  varianceSummary: 'Dining and subscriptions increased against last month.',
  tips: ['Trim subscriptions.'],
  riskSignals: ['Upcoming recurring bills consume most of the remaining budget.'],
  safeCutIdeas: ['Pause one streaming plan this month.'],
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
    mockIpc.onAIInsightsProgress.mockReset()
    mockIpc.onAIInsightsProgress.mockReturnValue(() => {})
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
    expect(screen.getByText(/dining and subscriptions increased against last month/i)).toBeInTheDocument()
    expect(screen.getByText(/pause one streaming plan this month/i)).toBeInTheDocument()
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

  it('shows live progress updates and ignores stale progress events', async () => {
    mockIpc.getSettings.mockResolvedValue(completeSettings)

    let resolveAnalysis: ((value: AIAnalysisResult) => void) | null = null
    const analysisPromise = new Promise<AIAnalysisResult>((resolve) => {
      resolveAnalysis = resolve
    })
    mockIpc.analyzeInsights.mockReturnValue(analysisPromise)

    let progressListener: ((progress: AIAnalysisProgress) => void) | null = null
    mockIpc.onAIInsightsProgress.mockImplementation((listener: (progress: AIAnalysisProgress) => void) => {
      progressListener = listener
      return () => {}
    })

    render(
      <MemoryRouter>
        <AIInsightsPage />
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /analyze/i }))

    const [{ requestId }] = mockIpc.analyzeInsights.mock.calls[0]

    await act(async () => {
      progressListener?.({
        requestId: 'stale-request',
        stage: 'fetching-benchmarks',
        message: 'Stale update',
        percent: 40,
        isTerminal: false,
        providerStatuses: {},
      })
    })

    expect(screen.queryByText('Stale update')).not.toBeInTheDocument()

    await act(async () => {
      progressListener?.({
        requestId,
        stage: 'fetching-benchmarks',
        message: 'Checking public benchmark services',
        percent: 40,
        isTerminal: false,
        fallbackSummary: 'Direct city benchmark unavailable, preparing fallback sources.',
        providerStatuses: {
          wteCost: { state: 'failed', detail: '403 Forbidden' },
          worldBank: { state: 'success', durationMs: 612 },
        },
      })
    })

    expect(await screen.findByText('Analysis in progress')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /checking public benchmark services/i })).toBeInTheDocument()
    expect(screen.getByText('Direct city benchmark unavailable, preparing fallback sources.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /provider details/i }))
    expect(screen.getByText('wteCost')).toBeInTheDocument()
    expect(screen.getByText('403 Forbidden')).toBeInTheDocument()
    expect(screen.getByText('worldBank')).toBeInTheDocument()

    await act(async () => {
      resolveAnalysis?.(analysis)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /refresh analysis/i })).toBeInTheDocument()
    })
  })
})
