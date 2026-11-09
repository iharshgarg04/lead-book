/* Small layout pieces shared by the invoice and settings screens (legacy .panel/.fsec/.fl/.seg). */
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common'
import { cn } from '@/lib/utils'

export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border bg-card', className)} {...rest}>{children}</div>
}

export const sectionTitleCls = 'm-0 flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase'

/** A titled block inside a panel, separated from the previous one by a rule. */
export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3 border-t px-[18px] py-4 first:border-t-0', className)}>
      <h3 className={sectionTitleCls}>{title}{action && <><span className="flex-1" />{action}</>}</h3>
      {children}
    </section>
  )
}

/** Label wrapping its control, with an optional hint and error. */
export function Field({ label, hint, error, htmlFor, className, children }: {
  label: ReactNode; hint?: ReactNode; error?: string; htmlFor: string; className?: string; children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[5px]', className)}>
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-2">
        {label}{hint && <span className="ml-1 text-[11.5px] font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
      {error && <span className="text-[12px] text-destructive">{error}</span>}
    </div>
  )
}

/** Segmented toggle (aria-pressed buttons). */
export function Segmented<T extends string>({ label, value, options, onChange, disabled }: {
  label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex self-start overflow-hidden rounded-[9px] border border-input bg-card">
      {options.map((o, i) => (
        <button key={o.v} type="button" aria-pressed={o.v === value} disabled={disabled} onClick={() => onChange(o.v)}
          className={cn('px-3 py-[9px] text-[13px] font-semibold text-ink-2 focus-visible:relative focus-visible:z-10 disabled:opacity-50',
            i > 0 && 'border-l', o.v === value && 'bg-foreground text-background')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Two-column key/value list (legacy .kv). */
export function KeyValues({ rows }: { rows: [ReactNode, ReactNode, boolean?][] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 text-[13.5px]">
      {rows.map(([k, v, strong], i) => (
        <div key={i} className="contents">
          <dt className={cn('text-muted-foreground', strong && 'font-bold text-foreground')}>{k}</dt>
          <dd className={cn('m-0 text-right font-mono tabular', strong && 'font-bold')}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function LoadingBlock({ msg = 'Loading invoices…' }: { msg?: string }) {
  return (
    <div className="mt-6" role="status">
      <div className="flex flex-col gap-2.5">{[0, 1, 2].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-card" />)}</div>
      <p className="mt-3 text-[12.5px] text-muted-foreground">{msg}</p>
    </div>
  )
}

export function InvoiceNotFound() {
  return (
    <EmptyState title="Invoice not found" className="mt-6">
      It may have been deleted. <Link to="/invoices" className="text-foreground underline">Back to invoices</Link>
    </EmptyState>
  )
}

/** Invoice screens open at the top (legacy scrolled to top on every invoices route). */
export function useScrollTop(key?: unknown) {
  useEffect(() => { window.scrollTo(0, 0) }, [key])
}
