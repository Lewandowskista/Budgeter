import * as React from 'react'

type SelectContextValue = {
  disabled?: boolean
  onValueChange?: (value: string) => void
  options: Array<{ label: string; value: string }>
  value?: string
}

const SelectContext = React.createContext<SelectContextValue>({
  options: [],
})

function getText(children: React.ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }

  if (Array.isArray(children)) {
    return children.map(getText).join('')
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    return getText(children.props.children)
  }

  return ''
}

function collectOptions(children: React.ReactNode): Array<{ label: string; value: string }> {
  const options: Array<{ label: string; value: string }> = []

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; value?: string }>(child)) {
      return
    }

    if ((child.type as { displayName?: string }).displayName === 'MockSelectItem' && child.props.value) {
      options.push({
        label: getText(child.props.children),
        value: child.props.value,
      })
      return
    }

    if ('children' in child.props) {
      options.push(...collectOptions(child.props.children))
    }
  })

  return options
}

export function Select({
  children,
  disabled,
  onValueChange,
  value,
}: {
  children: React.ReactNode
  disabled?: boolean
  onValueChange?: (value: string) => void
  value?: string
}) {
  return (
    <SelectContext.Provider value={{ value, onValueChange, disabled, options: collectOptions(children) }}>
      <div>{children}</div>
    </SelectContext.Provider>
  )
}

export function SelectTrigger({
  'aria-label': ariaLabel,
}: {
  'aria-label'?: string
  children?: React.ReactNode
  className?: string
}) {
  const { disabled, onValueChange, options, value } = React.useContext(SelectContext)

  return (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={value ?? ''}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {value == null ? <option value="">Select</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function SelectValue() {
  return null
}

export function SelectContent() {
  return null
}

export function SelectItem({
}: {
  value: string
}) {
  return null
}

SelectItem.displayName = 'MockSelectItem'
