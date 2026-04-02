import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { TransactionDialog } from './TransactionDialog'

const mockIpc = vi.hoisted(() => ({
  findPayeeRule: vi.fn(),
}))

vi.mock('@/lib/ipc', () => ({
  ipc: mockIpc,
}))

vi.mock('@/components/ui/select', async () => await import('@/test/selectMock'))

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

describe('TransactionDialog', () => {
  it('shows income type instead of expense category for income transactions and submits a normalized payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    mockIpc.findPayeeRule.mockResolvedValue(null)

    render(<TransactionDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />)

    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.queryByText('Income Type')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Income' }))

    expect(screen.getByText('Income Type')).toBeInTheDocument()
    expect(screen.queryByText('Category')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1500' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-04-02' } })

    fireEvent.submit(screen.getByRole('button', { name: /add transaction/i }).closest('form')!)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          category: null,
          incomeSource: 'Salary',
        }),
        expect.any(Object),
      )
    })
  })
})
