import type { PropsWithChildren } from 'react'
import { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'

export function AppShell({ children }: PropsWithChildren) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      <main className="page-transition flex-1 overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_top_right,_rgba(176,141,87,0.08),_transparent_24%),linear-gradient(180deg,rgba(243,241,236,0.6),transparent_35%)] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
