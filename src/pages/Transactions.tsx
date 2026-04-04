import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, Check, Pencil, Plus, ReceiptText, Search, Trash2, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import type {
  AppSettings,
  RecurringTransaction,
  SortDirection,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionSortField,
  TransactionType,
} from '../../shared/types'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { CsvImportDialog } from '@/components/transactions/CsvImportDialog'
import { RecurringTransactionDialog } from '@/components/transactions/RecurringTransactionDialog'
import { TransactionDialog } from '@/components/transactions/TransactionDialog'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BUDGET_CATEGORIES, INCOME_SOURCES } from '@/lib/constants'
import { formatCurrency, formatDate, formatTransactionTypeLabel } from '@/lib/format'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useCategories } from '@/hooks/useCategories'

export function TransactionsPage() {
  const categoryResult = useCategories()
  const [searchParams] = useSearchParams()

  const initialFilters: TransactionFilters = {
    type: 'all',
    sortBy: 'date',
    sortDirection: 'desc',
    category: searchParams.get('category') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  }

  const [filters, setFilters] = useState<TransactionFilters>(initialFilters)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [pendingReviewTransactions, setPendingReviewTransactions] = useState<Transaction[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null)
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<TransactionInput | null>(null)
  const [savingInline, setSavingInline] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const searchContainerRef = useRef<HTMLLabelElement | null>(null)
  const PAGE_SIZE = 100

  useKeyboardShortcuts([
    { key: 'n', ctrl: true, handler: () => setDialogOpen(true) },
    { key: 'f', ctrl: true, handler: () => searchContainerRef.current?.querySelector('input')?.focus() },
  ])

  useEffect(() => {
    void ipc.getSettings().then(setSettings)
    void ipc.getRecurringTransactions().then(setRecurringTransactions)
    void ipc.getPendingReviewTransactions().then(setPendingReviewTransactions)
  }, [])

  useEffect(() => {
    setPage(0)
  }, [filters])

  useEffect(() => {
    void loadTransactions(filters, page)
  }, [filters, page])

  async function loadTransactions(nextFilters: TransactionFilters, pageNum: number) {
    const rows = await ipc.getTransactions({ ...nextFilters, limit: PAGE_SIZE + 1, offset: pageNum * PAGE_SIZE })
    setHasMore(rows.length > PAGE_SIZE)
    setTransactions(rows.slice(0, PAGE_SIZE))
    setSelectedIds([])
  }

  async function reloadAll() {
    const [rows, appSettings, recurring, pendingReview] = await Promise.all([
      ipc.getTransactions({ ...filters, limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE }),
      ipc.getSettings(),
      ipc.getRecurringTransactions(),
      ipc.getPendingReviewTransactions(),
    ])
    setHasMore(rows.length > PAGE_SIZE)
    setTransactions(rows.slice(0, PAGE_SIZE))
    setSettings(appSettings)
    setRecurringTransactions(recurring)
    setPendingReviewTransactions(pendingReview)
    setSelectedIds([])
  }

  async function saveTransaction(transaction: TransactionInput, options: { rememberPayeeRule: boolean }) {
    await ipc.addTransaction(transaction)
    if (options.rememberPayeeRule && transaction.type === 'expense' && transaction.payee?.trim() && transaction.category) {
      await ipc.upsertPayeeRule({ payee: transaction.payee, category: transaction.category })
    }
    await reloadAll()
    toast.success('Transaction added')
  }

  async function deleteTransactions(ids: string[]) {
    setPendingDeleteIds(null)
    const label = ids.length === 1 ? 'Transaction deleted' : `${ids.length} transactions deleted`
    // Optimistically remove from UI
    setTransactions((current) => current.filter((t) => !ids.includes(t.id)))
    setSelectedIds([])
    toast(label, {
      action: {
        label: 'Undo',
        onClick: () => {
          // Undo: reload data from DB (transaction was not deleted yet if within timeout)
          void reloadAll()
        },
      },
      duration: 5000,
      onAutoClose: () => void ipc.deleteTransactions(ids).then(() => reloadAll()),
      onDismiss: () => void ipc.deleteTransactions(ids).then(() => reloadAll()),
    })
  }

  async function deleteRecurringTransaction(recurring: RecurringTransaction) {
    await ipc.deleteRecurringTransaction(recurring.id)
    await reloadAll()
  }

  async function upsertRecurringTransaction(recurring: Parameters<typeof ipc.saveRecurringTransaction>[0]) {
    await ipc.saveRecurringTransaction(recurring)
    await reloadAll()
  }

  function startInlineEdit(transaction: Transaction) {
    setEditingId(transaction.id)
    setEditDraft({
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category,
      incomeSource: transaction.incomeSource,
      payee: transaction.payee ?? '',
      date: transaction.date,
      note: transaction.note ?? '',
    })
  }

  async function saveInlineEdit() {
    if (!editingId || !editDraft) return

    setSavingInline(true)
    try {
      await ipc.updateTransaction(editingId, {
        ...editDraft,
        amount: Number(editDraft.amount),
      })
      setEditingId(null)
      setEditDraft(null)
      await reloadAll()
      toast.success('Transaction updated')
    } finally {
      setSavingInline(false)
    }
  }

  async function markTransactionsReviewed(ids: string[]) {
    await ipc.markTransactionsReviewed(ids)
    await reloadAll()
    toast.success(ids.length === 1 ? 'Marked as reviewed' : `${ids.length} transactions marked as reviewed`)
  }

  function cancelInlineEdit() {
    setEditingId(null)
    setEditDraft(null)
  }

  function updateEditField<Key extends keyof TransactionInput>(key: Key, value: TransactionInput[Key]) {
    setEditDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  function updateEditType(type: TransactionType) {
    setEditDraft((current) => {
      if (!current) return current

      return type === 'income'
        ? {
            ...current,
            type,
            category: null,
            incomeSource: current.incomeSource ?? INCOME_SOURCES[0],
          }
        : {
            ...current,
            type,
            category: current.category ?? BUDGET_CATEGORIES[0],
            incomeSource: null,
          }
    })
  }

  function toggleSort(field: TransactionSortField) {
    setFilters((current) => {
      const nextDirection: SortDirection =
        current.sortBy === field && current.sortDirection === 'desc' ? 'asc' : 'desc'

      return {
        ...current,
        sortBy: field,
        sortDirection: nextDirection,
      }
    })
  }

  function renderSortIcon(field: TransactionSortField) {
    if (filters.sortBy !== field) return <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
    return filters.sortDirection === 'asc' ? (
      <ArrowUp className="size-4 text-primary" aria-hidden="true" />
    ) : (
      <ArrowDown className="size-4 text-primary" aria-hidden="true" />
    )
  }

  const currency = settings?.currency ?? 'USD'
  const allSelected = Boolean(transactions.length) && selectedIds.length === transactions.length
  const subscriptionRecurring = recurringTransactions.filter(
    (recurring) => recurring.type === 'expense' && Boolean(recurring.subscriptionLabel),
  )
  const subscriptionTotal = subscriptionRecurring.reduce(
    (sum, recurring) => sum + (recurring.expectedAmount || recurring.amount),
    0,
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Search, filter, sort, edit, and delete the full ledger. Income lives here too, alongside expenses."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setCsvImportOpen(true)}>
              Import CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditingRecurring(null)
                setRecurringDialogOpen(true)
              }}
            >
              New recurring
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus data-icon="inline-start" />
              Add Transaction
            </Button>
          </div>
        }
      />

      <Card className="border-border/80 bg-card/90">
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-4 lg:grid-cols-[1.5fr_repeat(6,minmax(0,1fr))]">
            <label className="relative" ref={searchContainerRef}>
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                aria-label="Search transactions"
                autoComplete="off"
                className="pl-10"
                name="transaction-search"
                placeholder="Search note, payee, category, or income type..."
                value={filters.search ?? ''}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              />
            </label>

            <Select
              value={filters.category ?? 'all'}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, category: value === 'all' ? undefined : value }))
              }
            >
              <SelectTrigger aria-label="Filter by category" className="w-full">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {BUDGET_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.type ?? 'all'}
              onValueChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  type: value as TransactionFilters['type'],
                  incomeSource: value === 'expense' ? undefined : current.incomeSource,
                }))
              }
            >
              <SelectTrigger aria-label="Filter by transaction type" className="w-full">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.incomeSource ?? 'all'}
              onValueChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  incomeSource: value === 'all' ? undefined : (value as TransactionFilters['incomeSource']),
                }))
              }
            >
              <SelectTrigger aria-label="Filter by income type" className="w-full" disabled={filters.type === 'expense'}>
                <SelectValue placeholder="Income Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Income Types</SelectItem>
                {INCOME_SOURCES.map((incomeSource) => (
                  <SelectItem key={incomeSource} value={incomeSource}>
                    {incomeSource}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              aria-label="Filter from date"
              autoComplete="off"
              className="focus-ring"
              name="date-from"
              type="date"
              value={filters.from ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value || undefined }))}
            />
            <Input
              aria-label="Filter to date"
              autoComplete="off"
              className="focus-ring"
              name="date-to"
              type="date"
              value={filters.to ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value || undefined }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="Minimum amount"
                inputMode="decimal"
                min="0"
                name="min-amount"
                placeholder="Min..."
                type="number"
                value={filters.minAmount ?? ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    minAmount: event.target.value ? Number(event.target.value) : null,
                  }))
                }
              />
              <Input
                aria-label="Maximum amount"
                inputMode="decimal"
                min="0"
                name="max-amount"
                placeholder="Max..."
                type="number"
                value={filters.maxAmount ?? ''}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    maxAmount: event.target.value ? Number(event.target.value) : null,
                  }))
                }
              />
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">{selectedIds.length} selected</p>
              <div className="flex items-center gap-2">
                <Select
                  value=""
                  onValueChange={async (category) => {
                    if (!category) return
                    await ipc.bulkUpdateTransactionCategory(selectedIds, category)
                    await reloadAll()
                    toast.success(`${selectedIds.length} transactions moved to ${category}`)
                  }}
                >
                  <SelectTrigger aria-label="Re-categorize selected transactions" className="w-44">
                    <SelectValue placeholder="Re-categorize…" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...BUDGET_CATEGORIES, ...categoryResult.all.filter(c => !BUDGET_CATEGORIES.includes(c as typeof BUDGET_CATEGORIES[number]))].map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="destructive"
                  onClick={() => selectedIds.length > 1 ? setPendingDeleteIds(selectedIds) : void deleteTransactions(selectedIds)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete Selected
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pendingReviewTransactions.length ? (
        <Card className="border-border/80 bg-card/90">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>Review inbox</CardTitle>
                <CardDescription>CSV rows that were defaulted or auto-filled. Confirm them before they fade into the regular ledger.</CardDescription>
              </div>
              <Button variant="outline" onClick={() => void markTransactionsReviewed(pendingReviewTransactions.map((transaction) => transaction.id))}>
                Mark all reviewed
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {pendingReviewTransactions.map((transaction) => (
              <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">{transaction.payee || transaction.category || 'Pending review'}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(transaction.date)} · {transaction.origin.toUpperCase()} · {transaction.category || transaction.incomeSource || transaction.type}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Pending review</Badge>
                  <Button size="sm" variant="outline" onClick={() => void markTransactionsReviewed([transaction.id])}>
                    Mark reviewed
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/80 bg-card/90">
        <CardContent className="pt-6">
          {transactions.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      aria-label={allSelected ? 'Deselect all transactions' : 'Select all transactions'}
                      checked={allSelected}
                      className="focus-ring size-4 rounded border border-input"
                      type="checkbox"
                      onChange={(event) =>
                        setSelectedIds(event.target.checked ? transactions.map((transaction) => transaction.id) : [])
                      }
                    />
                  </TableHead>
                  <SortableHead field="date" label="Date" onSort={toggleSort} renderIcon={renderSortIcon} />
                  <SortableHead field="category" label="Category" onSort={toggleSort} renderIcon={renderSortIcon} />
                  <SortableHead field="payee" label="Payee" onSort={toggleSort} renderIcon={renderSortIcon} />
                  <SortableHead field="note" label="Note" onSort={toggleSort} renderIcon={renderSortIcon} />
                  <SortableHead field="type" label="Type" onSort={toggleSort} renderIcon={renderSortIcon} />
                  <SortableHead field="amount" label="Amount" onSort={toggleSort} renderIcon={renderSortIcon} className="text-right" />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => {
                  const isEditing = editingId === transaction.id && editDraft

                  return (
                    <TableRow
                      key={transaction.id}
                      onDoubleClick={() => !isEditing && startInlineEdit(transaction)}
                      className={!isEditing ? 'cursor-pointer' : undefined}
                    >
                      <TableCell>
                        <input
                          aria-label={`Select transaction ${transaction.category ?? transaction.incomeSource ?? transaction.type} on ${formatDate(transaction.date)}`}
                          checked={selectedIds.includes(transaction.id)}
                          className="focus-ring size-4 rounded border border-input"
                          type="checkbox"
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...current, transaction.id]
                                : current.filter((value) => value !== transaction.id),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input type="date" value={editDraft.date} onChange={(event) => updateEditField('date', event.target.value)} />
                        ) : (
                          formatDate(transaction.date)
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          editDraft.type === 'expense' ? (
                            <Select value={editDraft.category ?? undefined} onValueChange={(value) => updateEditField('category', value)}>
                              <SelectTrigger aria-label="Edit transaction category" className="h-9 w-full min-w-[11rem]">
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
                          ) : (
                            <Select
                              value={editDraft.incomeSource ?? undefined}
                              onValueChange={(value) => updateEditField('incomeSource', value as TransactionInput['incomeSource'])}
                            >
                              <SelectTrigger aria-label="Edit income type" className="h-9 w-full min-w-[11rem]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INCOME_SOURCES.map((incomeSource) => (
                                  <SelectItem key={incomeSource} value={incomeSource}>
                                    {incomeSource}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{transaction.category ?? '—'}</span>
                            {transaction.recurringTransactionId ? <Badge variant="outline">Recurring</Badge> : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[14rem] min-w-0">
                        {isEditing ? (
                          <Input
                            aria-label="Edit transaction payee"
                            autoComplete="off"
                            className="h-9"
                            value={editDraft.payee ?? ''}
                            onChange={(event) => updateEditField('payee', event.target.value)}
                          />
                        ) : (
                          <span className="block truncate text-muted-foreground">{transaction.payee || 'No payee'}</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[18rem] min-w-0">
                        {isEditing ? (
                          <Input
                            aria-label="Edit transaction note"
                            autoComplete="off"
                            className="h-9"
                            placeholder="Optional note..."
                            value={editDraft.note ?? ''}
                            onChange={(event) => updateEditField('note', event.target.value)}
                          />
                        ) : (
                          <span className="block truncate text-muted-foreground">{transaction.note || 'No note'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Select value={editDraft.type} onValueChange={(value) => updateEditType(value as TransactionType)}>
                            <SelectTrigger aria-label="Edit transaction type" className="h-9 w-full min-w-[8rem]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="expense">Expense</SelectItem>
                              <SelectItem value="income">Income</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{formatTransactionTypeLabel(transaction.type, transaction.incomeSource)}</span>
                            {transaction.reviewStatus === 'pending' ? <Badge variant="secondary">Review</Badge> : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {isEditing ? (
                          <Input
                            aria-label="Edit transaction amount"
                            className="ml-auto h-9 w-28 text-right"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            type="number"
                            value={editDraft.amount}
                            onChange={(event) => updateEditField('amount', Number(event.target.value))}
                          />
                        ) : (
                          formatCurrency(transaction.amount, currency)
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button size="sm" onClick={() => void saveInlineEdit()} disabled={savingInline}>
                                <Check data-icon="inline-start" />
                                {savingInline ? 'Saving...' : 'Save'}
                              </Button>
                              <Button variant="outline" size="sm" onClick={cancelInlineEdit}>
                                <X data-icon="inline-start" />
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="outline" size="sm" onClick={() => startInlineEdit(transaction)}>
                                    <Pencil data-icon="inline-start" />
                                    Edit
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit transaction (or double-click row)</TooltipContent>
                              </Tooltip>
                              <Button variant="ghost" size="sm" onClick={() => void deleteTransactions([transaction.id])}>
                                <Trash2 data-icon="inline-start" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<ReceiptText />}
              title="No transactions found"
              description="Try relaxing your filters, or add your first transaction to start the ledger."
              action={<Button onClick={() => setDialogOpen(true)}>Add Transaction</Button>}
            />
          )}
          {(page > 0 || hasMore) && (
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/90">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recurring transactions</CardTitle>
              <CardDescription>Monthly templates can auto-post or stay as reminders. Add a label to track a recurring expense like a subscription.</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setEditingRecurring(null)
                setRecurringDialogOpen(true)
              }}
            >
              Add recurring
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {subscriptionRecurring.length ? (
            <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-3">
              <p className="font-medium text-foreground">Subscription center</p>
              <p className="text-sm text-muted-foreground">
                {subscriptionRecurring.length} tracked subscriptions · {formatCurrency(subscriptionTotal, currency)} expected per month
              </p>
            </div>
          ) : null}
          {recurringTransactions.length ? (
            recurringTransactions.map((recurring) => (
              <div key={recurring.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-muted/20 px-4 py-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{recurring.payee}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(recurring.expectedAmount || recurring.amount, currency)} · {recurring.type === 'income' ? recurring.incomeSource ?? 'Unspecified' : recurring.category ?? '—'} · {recurring.postingMode === 'auto' ? 'Auto-post' : 'Reminder'} · due {recurring.nextDueDate}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {recurring.subscriptionLabel
                      ? `${recurring.subscriptionLabel} subscription`
                      : recurring.lastPostedMonth
                        ? `Last posted: ${recurring.lastPostedMonth}`
                        : 'Never posted'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const currentMonth = new Date().toISOString().slice(0, 7)
                    const hasGap = recurring.active && (
                      (recurring.lastPostedMonth !== null && recurring.lastPostedMonth < currentMonth &&
                        (() => {
                          const [ly, lm] = recurring.lastPostedMonth.split('-').map(Number)
                          const [cy, cm] = currentMonth.split('-').map(Number)
                          return (cy - ly) * 12 + (cm - lm) > 1
                        })()) ||
                      (recurring.lastPostedMonth === null && recurring.startMonth < currentMonth)
                    )
                    return hasGap ? (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="size-3" />
                        Gap detected
                      </Badge>
                    ) : null
                  })()}
                  {recurring.subscriptionLabel ? <Badge variant="outline">{recurring.subscriptionLabel}</Badge> : null}
                  <Badge variant={recurring.postingMode === 'auto' ? 'secondary' : 'outline'}>
                    {recurring.postingMode === 'auto' ? 'Auto-post' : 'Reminder'}
                  </Badge>
                  <Badge variant={recurring.active ? 'secondary' : 'outline'}>{recurring.active ? 'Active' : 'Paused'}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingRecurring(recurring)
                      setRecurringDialogOpen(true)
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void deleteRecurringTransaction(recurring)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<CalendarClock />}
              title="No recurring transactions yet"
              description="Create monthly templates for rent, subscriptions, or salary so Budgeter can post them automatically."
            />
          )}
        </CardContent>
      </Card>

      <TransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={saveTransaction} categories={categoryResult.all} />
      <CsvImportDialog open={csvImportOpen} onOpenChange={setCsvImportOpen} onComplete={reloadAll} />
      <RecurringTransactionDialog
        open={recurringDialogOpen}
        recurring={editingRecurring}
        onOpenChange={(open) => {
          setRecurringDialogOpen(open)
          if (!open) {
            setEditingRecurring(null)
          }
        }}
        onSubmit={upsertRecurringTransaction}
      />

      <AlertDialog open={Boolean(pendingDeleteIds)} onOpenChange={(open) => !open && setPendingDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDeleteIds?.length ?? 0} transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected records permanently from your local budget database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pendingDeleteIds && void deleteTransactions(pendingDeleteIds)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface SortableHeadProps {
  field: TransactionSortField
  label: string
  className?: string
  onSort: (field: TransactionSortField) => void
  renderIcon: (field: TransactionSortField) => ReactNode
}

function SortableHead({ field, label, className, onSort, renderIcon }: SortableHeadProps) {
  return (
    <TableHead className={className}>
      <button
        className={cn('focus-ring inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-left hover:text-foreground')}
        type="button"
        onClick={() => onSort(field)}
      >
        <span>{label}</span>
        {renderIcon(field)}
      </button>
    </TableHead>
  )
}
