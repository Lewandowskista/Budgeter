import { describe, expect, it } from 'vitest'
import { sanitizeSettingsForSnapshot } from './snapshot'

describe('sanitizeSettingsForSnapshot', () => {
  it('removes the Gemini API key from snapshot settings', () => {
    expect(
      sanitizeSettingsForSnapshot({
        currency: 'USD',
        city: 'Cluj-Napoca',
        country: 'Romania',
        geminiApiKey: 'secret-key',
        theme: 'dark',
        onboardingCompleted: 'true',
        notifyUpcomingBills: 'true',
        notifyBudgetAlerts: 'true',
        notifyIncomeAlerts: 'false',
        notifyRecurringGaps: 'true',
      }),
    ).toEqual({
      currency: 'USD',
      city: 'Cluj-Napoca',
      country: 'Romania',
      geminiApiKey: '',
      theme: 'dark',
      onboardingCompleted: 'true',
      notifyUpcomingBills: 'true',
      notifyBudgetAlerts: 'true',
      notifyIncomeAlerts: 'false',
      notifyRecurringGaps: 'true',
    })
  })
})
