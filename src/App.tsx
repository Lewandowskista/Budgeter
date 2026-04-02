import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/skeleton'

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
  return (
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
    </AppShell>
  )
}

export default App
