import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--color-card)',
          '--normal-border': 'var(--color-border)',
          '--normal-text': 'var(--color-card-foreground)',
          '--success-bg': 'var(--color-card)',
          '--success-border': 'var(--color-income)',
          '--success-text': 'var(--color-card-foreground)',
          '--error-bg': 'var(--color-card)',
          '--error-border': 'var(--color-destructive)',
          '--error-text': 'var(--color-card-foreground)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'border shadow-md font-sans text-sm',
          title: 'font-medium',
          description: 'text-muted-foreground text-xs',
          actionButton: 'bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-md',
          cancelButton: 'bg-muted text-muted-foreground text-xs font-medium px-3 py-1 rounded-md',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
