import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { RecurringTransactionDialog } from './RecurringTransactionDialog'

vi.mock('@/components/ui/select', async () => await import('@/test/selectMock'))

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

describe('RecurringTransactionDialog', () => {
  it('shows income type instead of category for recurring income entries and submits a normalized payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(<RecurringTransactionDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />)

    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.queryByText('Income Type')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'income' } })

    expect(screen.getByText('Income Type')).toBeInTheDocument()
    expect(screen.queryByText('Category')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Employer' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '3200' } })

    fireEvent.submit(screen.getByRole('button', { name: /create recurring transaction/i }).closest('form')!)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          category: null,
          incomeSource: 'Salary',
        }),
      )
    })
  })
})
