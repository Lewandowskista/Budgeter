import { useMemo, useState } from 'react'
import type { CsvImportFile, CsvImportPreviewRequest, CsvImportPreviewResult, SavedCsvMapping, TransactionType } from '../../../shared/types'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ipc } from '@/lib/ipc'

function computeHeadersKey(headers: string[]): string {
  return headers
    .map((h) => h.trim().toLowerCase())
    .sort()
    .join('|')
}

interface CsvImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => Promise<void>
}

type Step = 'choose' | 'map' | 'preview'

export function CsvImportDialog({ open, onOpenChange, onComplete }: CsvImportDialogProps) {
  const [step, setStep] = useState<Step>('choose')
  const [file, setFile] = useState<CsvImportFile | null>(null)
  const [dateColumn, setDateColumn] = useState('')
  const [amountColumn, setAmountColumn] = useState('')
  const [typeColumn, setTypeColumn] = useState('__none__')
  const [categoryColumn, setCategoryColumn] = useState('__none__')
  const [incomeSourceColumn, setIncomeSourceColumn] = useState('__none__')
  const [payeeColumn, setPayeeColumn] = useState('__none__')
  const [noteColumn, setNoteColumn] = useState('__none__')
  const [amountMode, setAmountMode] = useState<'signed' | 'absolute'>('signed')
  const [defaultExpenseType, setDefaultExpenseType] = useState<TransactionType>('expense')
  const [learnRules, setLearnRules] = useState(true)
  const [preview, setPreview] = useState<CsvImportPreviewResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMapping, setSavedMapping] = useState<SavedCsvMapping | null>(null)
  const [savedMappingDismissed, setSavedMappingDismissed] = useState(false)

  const canPreview = Boolean(file && dateColumn && amountColumn)
  const request = useMemo<CsvImportPreviewRequest | null>(() => {
    if (!file || !dateColumn || !amountColumn) {
      return null
    }

    return {
      filePath: file.filePath,
      mapping: {
        date: dateColumn,
        amount: amountColumn,
        type: typeColumn !== '__none__' ? typeColumn : undefined,
        category: categoryColumn !== '__none__' ? categoryColumn : undefined,
        incomeSource: incomeSourceColumn !== '__none__' ? incomeSourceColumn : undefined,
        payee: payeeColumn !== '__none__' ? payeeColumn : undefined,
        note: noteColumn !== '__none__' ? noteColumn : undefined,
      },
      amountMode,
      defaultExpenseType,
      learnRules,
    }
  }, [amountColumn, amountMode, categoryColumn, dateColumn, defaultExpenseType, file, incomeSourceColumn, learnRules, noteColumn, payeeColumn, typeColumn])

  function reset() {
    setStep('choose')
    setFile(null)
    setDateColumn('')
    setAmountColumn('')
    setTypeColumn('__none__')
    setCategoryColumn('__none__')
    setIncomeSourceColumn('__none__')
    setPayeeColumn('__none__')
    setNoteColumn('__none__')
    setAmountMode('signed')
    setDefaultExpenseType('expense')
    setLearnRules(true)
    setPreview(null)
    setSavedMapping(null)
    setSavedMappingDismissed(false)
  }

  function applySavedMapping(saved: SavedCsvMapping, fileHeaders: string[]) {
    const m = saved.mapping
    // Only apply column values that still exist in the current file's headers
    if (fileHeaders.includes(m.date)) setDateColumn(m.date)
    if (fileHeaders.includes(m.amount)) setAmountColumn(m.amount)
    setTypeColumn(m.type && fileHeaders.includes(m.type) ? m.type : '__none__')
    setCategoryColumn(m.category && fileHeaders.includes(m.category) ? m.category : '__none__')
    setIncomeSourceColumn(m.incomeSource && fileHeaders.includes(m.incomeSource) ? m.incomeSource : '__none__')
    setPayeeColumn(m.payee && fileHeaders.includes(m.payee) ? m.payee : '__none__')
    setNoteColumn(m.note && fileHeaders.includes(m.note) ? m.note : '__none__')
    setAmountMode(saved.amountMode)
    setDefaultExpenseType(saved.defaultExpenseType)
  }

  async function chooseFile() {
    const selected = await ipc.selectTransactionCsvFile()
    if (!selected) {
      return
    }

    setFile(selected)
    setSavedMappingDismissed(false)

    const key = computeHeadersKey(selected.headers)
    const found = await ipc.findCsvImportMapping(key)
    if (found) {
      setSavedMapping(found)
      applySavedMapping(found, selected.headers)
    } else {
      setSavedMapping(null)
    }

    setStep('map')
  }

  async function buildPreview() {
    if (!request) {
      return
    }

    const nextPreview = await ipc.previewTransactionCsvImport(request)
    setPreview(nextPreview)
    setStep('preview')
  }

  async function commit() {
    if (!request || !file) {
      return
    }

    setSaving(true)
    try {
      const result = await ipc.commitTransactionCsvImport(request)

      // Persist the column mapping for next time this CSV format is used
      const headersKey = computeHeadersKey(file.headers)
      const now = new Date().toISOString()
      await ipc.saveCsvImportMapping({
        id: savedMapping?.id ?? crypto.randomUUID(),
        headersKey,
        mapping: request.mapping,
        amountMode: request.amountMode,
        defaultExpenseType: request.defaultExpenseType,
        createdAt: savedMapping?.createdAt ?? now,
        updatedAt: now,
      })

      await onComplete()
      onOpenChange(false)
      reset()

      const parts: string[] = [`${result.insertedCount} imported`]
      if (result.skippedDuplicateCount > 0) parts.push(`${result.skippedDuplicateCount} duplicates skipped`)
      if (result.invalidCount > 0) parts.push(`${result.invalidCount} invalid`)
      if ((result.pendingReviewCount ?? 0) > 0) parts.push(`${result.pendingReviewCount} need review`)
      toast.success('CSV import complete', { description: parts.join(' · ') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) {
          reset()
        }
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import transactions from CSV</DialogTitle>
          <DialogDescription>Choose a CSV file, map its columns, review the preview, then import the valid rows.</DialogDescription>
        </DialogHeader>

        {step === 'choose' ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6">
            <p className="text-sm text-muted-foreground">Select a UTF-8 CSV file with a header row.</p>
            <Button className="mt-4" onClick={() => void chooseFile()}>
              Choose CSV file
            </Button>
          </div>
        ) : null}

        {step === 'map' && file ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Selected file: <span className="font-medium text-foreground">{file.fileName}</span>
            </div>

            {savedMapping && !savedMappingDismissed ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/8 px-4 py-3 text-sm">
                <p className="text-foreground">Saved mapping found for this file format — columns have been pre-filled.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSavedMappingDismissed(true)
                    setDateColumn('')
                    setAmountColumn('')
                    setTypeColumn('__none__')
                    setCategoryColumn('__none__')
                    setIncomeSourceColumn('__none__')
                    setPayeeColumn('__none__')
                    setNoteColumn('__none__')
                    setAmountMode('signed')
                    setDefaultExpenseType('expense')
                  }}
                >
                  Start fresh
                </Button>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <ColumnSelect label="Date column" headers={file.headers} value={dateColumn} onChange={setDateColumn} />
              <ColumnSelect label="Amount column" headers={file.headers} value={amountColumn} onChange={setAmountColumn} />
              <ColumnSelect label="Type column" headers={file.headers} value={typeColumn} onChange={setTypeColumn} optional />
              <ColumnSelect label="Category column" headers={file.headers} value={categoryColumn} onChange={setCategoryColumn} optional />
              <ColumnSelect label="Income type column" headers={file.headers} value={incomeSourceColumn} onChange={setIncomeSourceColumn} optional />
              <ColumnSelect label="Payee column" headers={file.headers} value={payeeColumn} onChange={setPayeeColumn} optional />
              <ColumnSelect label="Note column" headers={file.headers} value={noteColumn} onChange={setNoteColumn} optional />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Amount mode
                <Select value={amountMode} onValueChange={(value) => setAmountMode(value as 'signed' | 'absolute')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="signed">Signed amounts decide income vs expense</SelectItem>
                    <SelectItem value="absolute">Use absolute amounts + default type</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-foreground">
                Default type for absolute amounts
                <Select value={defaultExpenseType} onValueChange={(value) => setDefaultExpenseType(value as TransactionType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                checked={learnRules}
                className="focus-ring size-4 rounded border border-input"
                type="checkbox"
                onChange={(event) => setLearnRules(event.target.checked)}
              />
              Learn payee rules from imported rows
            </label>
          </div>
        ) : null}

        {step === 'preview' && preview ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Previewing <span className="font-medium text-foreground">{preview.fileName}</span>
            </div>
            <div className="max-h-[26rem] overflow-auto rounded-2xl border border-border/80">
              <Table>
                <caption className="sr-only">CSV import preview</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Income Type</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell className="capitalize">{row.status}</TableCell>
                      <TableCell>{row.transaction?.payee || '—'}</TableCell>
                      <TableCell>{row.transaction?.category || '—'}</TableCell>
                      <TableCell>{row.transaction?.incomeSource || '—'}</TableCell>
                      <TableCell>{row.transaction?.type || '—'}</TableCell>
                      <TableCell>{row.transaction ? row.transaction.amount.toFixed(2) : '—'}</TableCell>
                      <TableCell>{row.errors.join(', ') || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        <DialogFooter className="border-t-0 bg-transparent p-0">
          {step === 'map' ? (
            <>
              <Button variant="outline" onClick={() => setStep('choose')}>
                Back
              </Button>
              <Button disabled={!canPreview} onClick={() => void buildPreview()}>
                Preview import
              </Button>
            </>
          ) : null}
          {step === 'preview' ? (
            <>
              <Button variant="outline" onClick={() => setStep('map')}>
                Back to mapping
              </Button>
              <Button disabled={saving} onClick={() => void commit()}>
                {saving ? 'Importing...' : 'Import transactions'}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ColumnSelect({
  label,
  headers,
  optional = false,
  value,
  onChange,
}: {
  label: string
  headers: string[]
  optional?: boolean
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a column" />
        </SelectTrigger>
        <SelectContent>
          {optional ? <SelectItem value="__none__">Not mapped</SelectItem> : null}
          {headers.map((header) => (
            <SelectItem key={header} value={header}>
              {header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
