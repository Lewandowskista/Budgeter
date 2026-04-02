import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('keeps accessible names on collapsed icon-only links', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed onToggle={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('Dashboard')).toHaveAttribute('href', '/dashboard')
    expect(screen.getByLabelText('Settings')).toHaveAttribute('href', '/settings')
  })
})
