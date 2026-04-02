import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CompactNavigation } from './CompactNavigation'

describe('CompactNavigation', () => {
  it('renders all primary destinations for narrow windows', () => {
    render(
      <MemoryRouter initialEntries={['/analytics']}>
        <CompactNavigation />
      </MemoryRouter>,
    )

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/transactions')
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('aria-current', 'page')
  })
})
