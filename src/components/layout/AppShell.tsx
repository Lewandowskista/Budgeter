import type { PropsWithChildren } from 'react'
import { useState } from 'react'
import { CompactNavigation } from '@/components/layout/CompactNavigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { TitleBar } from '@/components/layout/TitleBar'

export function AppShell({ children }: PropsWithChildren) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <CompactNavigation />
      <div className="flex min-h-0 flex-1">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
        <main className="page-transition min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[radial-gradient(circle_at_top_right,_rgba(176,141,87,0.08),_transparent_24%),linear-gradient(180deg,rgba(243,241,236,0.6),transparent_35%)] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
