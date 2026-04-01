import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AIInsightsPage } from '@/pages/AIInsights'
import { AnalyticsPage } from '@/pages/Analytics'
import { BudgetsPage } from '@/pages/Budgets'
import { DashboardPage } from '@/pages/Dashboard'
import { SettingsPage } from '@/pages/Settings'
import { TransactionsPage } from '@/pages/Transactions'

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/ai-insights" element={<AIInsightsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  )
}

export default App
