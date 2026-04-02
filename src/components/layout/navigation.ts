import {
  BarChart3,
  LayoutDashboard,
  PiggyBank,
  ReceiptText,
  Settings2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export interface NavigationItem {
  to: string
  label: string
  icon: LucideIcon
}

export const primaryNavigationItems: NavigationItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ReceiptText },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/ai-insights', label: 'AI Insights', icon: Sparkles },
]

export const settingsNavigationItem: NavigationItem = {
  to: '/settings',
  label: 'Settings',
  icon: Settings2,
}
