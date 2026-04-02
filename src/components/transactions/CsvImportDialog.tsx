import { useMemo, useState } from 'react'
import type { CsvImportFile, CsvImportPreviewRequest, CsvImportPreviewResult, TransactionType } from '../../../shared/types'
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
  }

  async function chooseFile() {
    const selected = await ipc.selectTransactionCsvFile()
    if (!selected) {
      return
    }

    setFile(selected)
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
    if (!request) {
      return
    }

    setSaving(true)
    try {
      await ipc.commitTransactionCsvImport(request)
      await onComplete()
      onOpenChange(false)
      reset()
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
