import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { AppSettings } from '../shared/types'
import { AppShell } from '@/components/layout/AppShell'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories } from '@/hooks/useCategories'
import { ipc } from '@/lib/ipc'

const DashboardPage = lazy(async () => import('@/pages/Dashboard').then((module) => ({ default: module.DashboardPage })))
const TransactionsPage = lazy(async () =>
  import('@/pages/Transactions').then((module) => ({ default: module.TransactionsPage })),
)
const BudgetsPage = lazy(async () => import('@/pages/Budgets').then((module) => ({ default: module.BudgetsPage })))
const AnalyticsPage = lazy(async () =>
  import('@/pages/Analytics').then((module) => ({ default: module.AnalyticsPage })),
)
const AIInsightsPage = lazy(async () =>
  import('@/pages/AIInsights').then((module) => ({ default: module.AIInsightsPage })),
)
const SettingsPage = lazy(async () => import('@/pages/Settings').then((module) => ({ default: module.SettingsPage })))

function App() {
  const categoryResult = useCategories()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  useEffect(() => {
    void ipc.getSettings().then((s) => {
      setSettings(s)
      if (s.onboardingCompleted !== 'true' && s.city === '' && s.country === '') {
        setOnboardingOpen(true)
      }
    })
  }, [])

  return (
    <TooltipProvider delayDuration={400}>
    <AppShell>
      <Suspense
        fallback={
          <div className="grid gap-4">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-72 rounded-3xl" />
            <Skeleton className="h-72 rounded-3xl" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/ai-insights" element={<AIInsightsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
      {settings && (
        <OnboardingWizard
          open={onboardingOpen}
          settings={settings}
          categories={categoryResult.all}
          onComplete={() => setOnboardingOpen(false)}
        />
      )}
    </AppShell>
    <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}

export default App
