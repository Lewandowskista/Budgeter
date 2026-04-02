import { useEffect, useState } from 'react'
import type { AppInfo, AppSettings, AppSnapshotSummary, PayeeRule } from '../../shared/types'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CURRENCY_OPTIONS, BUDGET_CATEGORIES } from '@/lib/constants'
import { ipc } from '@/lib/ipc'
import { useTheme } from '@/lib/theme'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [snapshots, setSnapshots] = useState<AppSnapshotSummary[]>([])
  const [payeeRules, setPayeeRules] = useState<PayeeRule[]>([])
  const [payeeRuleSearch, setPayeeRuleSearch] = useState('')
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [creatingSnapshot, setCreatingSnapshot] = useState(false)
  const [showGemini, setShowGemini] = useState(false)
  const [startFreshOpen, setStartFreshOpen] = useState(false)
  const [factoryResetOpen, setFactoryResetOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<AppSnapshotSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppSnapshotSummary | null>(null)
  const [recoveryAction, setRecoveryAction] = useState<'start-fresh' | 'restore' | 'factory-reset' | null>(null)
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null)
  const { setTheme } = useTheme()

  useEffect(() => {
    void loadSettings()
  }, [])

  useEffect(() => {
    void loadPayeeRules(payeeRuleSearch)
  }, [payeeRuleSearch])

  async function loadSettings() {
    const [currentSettings, currentAppInfo, currentSnapshots, currentPayeeRules] = await Promise.all([
      ipc.getSettings(),
      ipc.getAppInfo(),
      ipc.listSnapshots(),
      ipc.getPayeeRules(),
    ])
    setSettings(currentSettings)
    setAppInfo(currentAppInfo)
    setSnapshots(currentSnapshots)
    setPayeeRules(currentPayeeRules)
  }

  async function loadPayeeRules(search = '') {
    setPayeeRules(await ipc.getPayeeRules(search))
  }

  if (!settings) {
    return <div className="text-muted-foreground">Loading settings…</div>
  }

  async function handleSave() {
    if (!settings) {
      return
    }

    setSaving(true)
    try {
      const saved = await ipc.updateSettings(settings)
      setSettings(saved)
      await setTheme(saved.theme)
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateSnapshot() {
    setCreatingSnapshot(true)
    try {
      await ipc.createSnapshot(snapshotLabel.trim() || undefined)
      setSnapshotLabel('')
      await loadSettings()
    } finally {
      setCreatingSnapshot(false)
    }
  }

  async function handleStartFresh() {
    setRecoveryAction('start-fresh')
    try {
      await ipc.startFresh()
      window.location.reload()
    } finally {
      setRecoveryAction(null)
    }
  }

  async function handleRestoreSnapshot() {
    if (!restoreTarget) return

    setRecoveryAction('restore')
    try {
      await ipc.restoreSnapshot(restoreTarget.id)
      window.location.reload()
    } finally {
      setRecoveryAction(null)
    }
  }

  async function handleDeleteSnapshot() {
    if (!deleteTarget) return

    setDeletingSnapshotId(deleteTarget.id)
    try {
      await ipc.deleteSnapshot(deleteTarget.id)
      setDeleteTarget(null)
      await loadSettings()
    } finally {
      setDeletingSnapshotId(null)
    }
  }

  async function handleFactoryReset() {
    setRecoveryAction('factory-reset')
    try {
      await ipc.factoryReset()
      window.location.reload()
    } finally {
      setRecoveryAction(null)
    }
  }

  async function updatePayeeRule(rule: PayeeRule, category: string) {
    await ipc.upsertPayeeRule({ payee: rule.payeeDisplay, category })
    await loadPayeeRules(payeeRuleSearch)
  }

  async function deletePayeeRule(id: string) {
    await ipc.deletePayeeRule(id)
    await loadPayeeRules(payeeRuleSearch)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure local preferences, Gemini access, theme behavior, exports, and recovery actions."
        action={<Button onClick={handleSave}>{saving ? 'Saving…' : 'Save Settings'}</Button>}
      />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/80 bg-card/90">
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>Core app behavior and inputs used by the AI analysis flow.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Currency
              <Select
                value={settings.currency}
                onValueChange={(value) => setSettings((current) => (current ? { ...current, currency: value } : current))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                City
                <Input
                  autoComplete="off"
                  name="city"
                  value={settings.city}
                  onChange={(event) => setSettings((current) => (current ? { ...current, city: event.target.value } : current))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Country
                <Input
                  autoComplete="country-name"
                  name="country"
                  value={settings.country}
                  onChange={(event) =>
                    setSettings((current) => (current ? { ...current, country: event.target.value } : current))
                  }
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-foreground">
              Gemini API key
              <div className="flex gap-2">
                <Input
                  autoComplete="off"
                  name="gemini-api-key"
                  type={showGemini ? 'text' : 'password'}
                  value={settings.geminiApiKey}
                  onChange={(event) =>
                    setSettings((current) => (current ? { ...current, geminiApiKey: event.target.value } : current))
                  }
                />
                <Button type="button" variant="outline" onClick={() => setShowGemini((value) => !value)}>
                  {showGemini ? 'Hide' : 'Show'}
                </Button>
              </div>
              <span className="text-xs font-normal text-muted-foreground">
                Budgeter now uses free public benchmark data automatically. Only Gemini needs an API key, and snapshots never include it.
              </span>
            </label>

            <label className="grid gap-2 text-sm font-medium text-foreground">
              Theme
              <Select
                value={settings.theme}
                onValueChange={async (value) => {
                  const nextTheme = value as AppSettings['theme']
                  setSettings((current) => (current ? { ...current, theme: nextTheme } : current))
                  await setTheme(nextTheme)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="border-border/80 bg-card/90">
            <CardHeader>
              <CardTitle>Data management</CardTitle>
              <CardDescription>Export records, create recovery points, start fresh, or restore a previous local state.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => void ipc.exportTransactionsCsv()}>
                  Export CSV
                </Button>
                <Button variant="secondary" onClick={() => setStartFreshOpen(true)}>
                  Start fresh
                </Button>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-foreground" htmlFor="snapshot-label">
                    Create snapshot
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="snapshot-label"
                      autoComplete="off"
                      placeholder="Optional label, like End of March"
                      value={snapshotLabel}
                      onChange={(event) => setSnapshotLabel(event.target.value)}
                    />
                    <Button onClick={() => void handleCreateSnapshot()} disabled={creatingSnapshot}>
                      {creatingSnapshot ? 'Saving snapshot…' : 'Save snapshot'}
                    </Button>
                  </div>
                </div>

                {snapshots.length ? (
                  <div className="grid gap-3">
                    {snapshots.map((snapshot) => (
                      <div
                        key={snapshot.id}
                        className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3"
                      >
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{snapshot.label || formatSnapshotTrigger(snapshot.trigger)}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatSnapshotDate(snapshot.createdAt)} | {formatSnapshotTrigger(snapshot.trigger)} | App {snapshot.appVersion}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => setRestoreTarget(snapshot)}>
                            Restore
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(snapshot)}>
                            Delete snapshot
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No snapshots yet. Start fresh and factory reset will create one automatically before clearing local data.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="font-medium text-foreground">Advanced</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Factory reset also creates an auto snapshot first, then clears transactions, budgets, AI cache, recurring templates, budget templates, payee rules, and restores default settings. Recovery snapshots exclude the Gemini API key by design.
                </p>
                <Button className="mt-3" variant="destructive" onClick={() => setFactoryResetOpen(true)}>
                  Factory reset
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90">
            <CardHeader>
              <CardTitle>Payee rules</CardTitle>
              <CardDescription>Review and adjust local payee-to-category mappings used by manual entry and CSV import.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Input
                autoComplete="off"
                placeholder="Search payees…"
                value={payeeRuleSearch}
                onChange={(event) => setPayeeRuleSearch(event.target.value)}
              />
              {payeeRules.length ? (
                payeeRules.map((rule) => (
                  <div key={rule.id} className="grid gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div>
                      <p className="font-medium text-foreground">{rule.payeeDisplay}</p>
                      <p className="text-sm text-muted-foreground">{rule.normalizedPayee}</p>
                    </div>
                    <Select value={rule.category} onValueChange={(value) => void updatePayeeRule(rule, value)}>
                      <SelectTrigger className="w-full min-w-[12rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BUDGET_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" onClick={() => void deletePayeeRule(rule.id)}>
                      Delete
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No payee rules match the current search.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/80 bg-card/90">
            <CardHeader>
              <CardTitle>About</CardTitle>
              <CardDescription>Local desktop build metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>App: {appInfo?.name ?? 'Budgeter'}</p>
              <p>Version: {appInfo?.version ?? '1.0.0'}</p>
              <p>Storage: Local SQLite database and private recovery snapshots in the Electron user data directory.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <AlertDialog open={startFreshOpen} onOpenChange={setStartFreshOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start fresh with a blank budget?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes transactions, budgets, recurring templates, budget templates, payee rules, and AI cache, while keeping your app settings and creating a snapshot first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleStartFresh()} disabled={recoveryAction === 'start-fresh'}>
              {recoveryAction === 'start-fresh' ? 'Clearing…' : 'Start fresh'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={factoryResetOpen} onOpenChange={setFactoryResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factory reset this app?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a snapshot first, then wipes all local data and restores default settings. Your Gemini API key is excluded from the snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleFactoryReset()} disabled={recoveryAction === 'factory-reset'}>
              {recoveryAction === 'factory-reset' ? 'Resetting…' : 'Factory reset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(restoreTarget)} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the current local data with the selected snapshot. Gemini API keys are never restored from snapshots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRestoreSnapshot()} disabled={recoveryAction === 'restore'}>
              {recoveryAction === 'restore' ? 'Restoring…' : 'Restore snapshot'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>This removes the selected recovery point from local storage.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleDeleteSnapshot()} disabled={deletingSnapshotId === deleteTarget?.id}>
              {deletingSnapshotId === deleteTarget?.id ? 'Deleting…' : 'Delete snapshot'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatSnapshotDate(value: string) {
  return new Date(value).toLocaleString()
}

function formatSnapshotTrigger(trigger: AppSnapshotSummary['trigger']) {
  switch (trigger) {
    case 'manual':
      return 'Manual snapshot'
    case 'start-fresh':
      return 'Start fresh'
    case 'factory-reset':
      return 'Factory reset'
    default:
      return trigger
  }
}
