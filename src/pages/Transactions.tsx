import { type ReactNode, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import type {
  AppSettings,
  SortDirection,
  Transaction,
  TransactionFilters,
  TransactionInput,
  TransactionSortField,
  TransactionType,
} from '../../shared/types'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BUDGET_CATEGORIES } from '@/lib/constants'
import { formatCurrency, formatDate } from '@/lib/format'
import { ipc } from '@/lib/ipc'
import { cn } from '@/lib/utils'

const defaultFilters: TransactionFilters = {
  type: 'all',
  sortBy: 'date',
  sortDirection: 'desc',
}

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>(defaultFilters)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<TransactionInput | null>(null)
  const [savingInline, setSavingInline] = useState(false)

  useEffect(() => {
    void loadTransactions(filters)
  }, [filters])

  async function loadTransactions(nextFilters: TransactionFilters) {
    const [rows, appSettings] = await Promise.all([ipc.getTransactions(nextFilters), ipc.getSettings()])
    setTransactions(rows)
    setSettings(appSettings)
    setSelectedIds([])
  }

  async function saveTransaction(transaction: TransactionInput) {
    await ipc.addTransaction(transaction)
    await loadTransactions(filters)
  }

  async function deleteTransactions(ids: string[]) {
    await ipc.deleteTransactions(ids)
    setPendingDeleteIds(null)
    await loadTransactions(filters)
  }

  function startInlineEdit(transaction: Transaction) {
    setEditingId(transaction.id)
    setEditDraft({
      amount: transaction.amount,
      type: transaction.type,
      category: transaction.category,
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
      await loadTransactions(filters)
    } finally {
      setSavingInline(false)
    }
  }

  function cancelInlineEdit() {
    setEditingId(null)
    setEditDraft(null)
  }

  function updateEditField<Key extends keyof TransactionInput>(key: Key, value: TransactionInput[Key]) {
    setEditDraft((current) => (current ? { ...current, [key]: value } : current))
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Search, filter, sort, edit, and delete the full ledger. Income lives here too, alongside expenses."
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            Add Transaction
          </Button>
        }
      />

      <Card className="border-border/80 bg-card/90">
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-4 lg:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                aria-label="Search transactions"
                autoComplete="off"
                className="pl-10"
                name="transaction-search"
                placeholder="Search note or category…"
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
              onValueChange={(value) => setFilters((current) => ({ ...current, type: value as TransactionFilters['type'] }))}
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
                placeholder="Min…"
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
                placeholder="Max…"
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
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-muted/40 px-4 py-3">
              <p className="text-sm text-muted-foreground">{selectedIds.length} selected</p>
              <Button variant="destructive" onClick={() => setPendingDeleteIds(selectedIds)}>
                <Trash2 data-icon="inline-start" />
                Delete Selected
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <input
                          aria-label={`Select transaction ${transaction.category} on ${formatDate(transaction.date)}`}
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
                          <Input
                            aria-label="Edit transaction date"
                            autoComplete="off"
                            className="h-9"
                            name={`edit-date-${transaction.id}`}
                            type="date"
                            value={editDraft.date}
                            onChange={(event) => updateEditField('date', event.target.value)}
                          />
                        ) : (
                          formatDate(transaction.date)
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Select value={editDraft.category} onValueChange={(value) => updateEditField('category', value)}>
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
                          transaction.category
                        )}
                      </TableCell>
                      <TableCell className="max-w-[18rem] min-w-0">
                        {isEditing ? (
                          <Input
                            aria-label="Edit transaction note"
                            autoComplete="off"
                            className="h-9"
                            name={`edit-note-${transaction.id}`}
                            placeholder="Optional note…"
                            value={editDraft.note ?? ''}
                            onChange={(event) => updateEditField('note', event.target.value)}
                          />
                        ) : (
                          <span className="block truncate text-muted-foreground">{transaction.note || 'No note'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Select value={editDraft.type} onValueChange={(value) => updateEditField('type', value as TransactionType)}>
                            <SelectTrigger aria-label="Edit transaction type" className="h-9 w-full min-w-[8rem]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="expense">Expense</SelectItem>
                              <SelectItem value="income">Income</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="capitalize">{transaction.type}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {isEditing ? (
                          <Input
                            aria-label="Edit transaction amount"
                            className="ml-auto h-9 w-28 text-right"
                            inputMode="decimal"
                            min="0"
                            name={`edit-amount-${transaction.id}`}
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
                                {savingInline ? 'Saving…' : 'Save'}
                              </Button>
                              <Button variant="outline" size="sm" onClick={cancelInlineEdit}>
                                <X data-icon="inline-start" />
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="outline" size="sm" onClick={() => startInlineEdit(transaction)}>
                                <Pencil data-icon="inline-start" />
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setPendingDeleteIds([transaction.id])}>
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
              title="No transactions found"
              description="Try relaxing your filters, or add your first transaction to start the ledger."
              action={<Button onClick={() => setDialogOpen(true)}>Add Transaction</Button>}
            />
          )}
        </CardContent>
      </Card>

      <TransactionDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={saveTransaction} />

      <AlertDialog open={Boolean(pendingDeleteIds)} onOpenChange={(open) => !open && setPendingDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected records permanently from your local budget database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pendingDeleteIds && deleteTransactions(pendingDeleteIds)}
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
