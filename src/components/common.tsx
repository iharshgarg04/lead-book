/* Small presentational pieces shared across modules. */
import { Flame, Snowflake, Sun, Ban } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PKG, RMAP, SMAP, TL } from '@/features/leads/model'
import { cn } from '@/lib/utils'
import type { InvoiceStatus, InvoiceType, LeadRating, LeadStatus, PackageKey, TimelineKey } from '@/types'

export function PageHeader({ title, sub, actions, crumbs }: {
  title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[]
}) {
  return (
    <div className="pt-1">
      {crumbs && (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {c.to ? <Link to={c.to} className="hover:text-foreground hover:underline">{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-tight font-bold">{title}</h1>
          {sub && <div className="mt-1 text-[13px] text-muted-foreground">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function StatTile({ label, value, detail, tone, to }: {
  label: string; value: ReactNode; detail?: ReactNode; tone?: 'warn' | 'good' | 'hot'; to?: string
}) {
  const body = (
    <>
      <div className="text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">{label}</div>
      <div className={cn('mt-1.5 font-mono text-[22px] leading-tight font-semibold tracking-tight tabular',
        tone === 'warn' && 'text-warn', tone === 'good' && 'text-good', tone === 'hot' && 'text-[var(--r-hot)]')}>{value}</div>
      {detail && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{detail}</div>}
    </>
  )
  const cls = 'block rounded-xl border bg-card px-4 py-3.5'
  return to ? <Link to={to} className={cn(cls, 'transition-colors hover:border-input')}>{body}</Link> : <div className={cls}>{body}</div>
}

export function EmptyState({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-dashed border-input px-5 py-6 text-center text-muted-foreground', className)}>
      <div className="mb-1 font-display text-base font-semibold text-foreground">{title}</div>
      {children}
    </div>
  )
}

export function Pill({ className, children, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('status-pill inline-flex items-center gap-1.5 rounded-full py-[5px] pr-2.5 pl-2 text-[11.5px] leading-none font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-[""]', className)} {...rest}>{children}</span>
}

export const StatusPill = ({ s }: { s: LeadStatus }) => <Pill data-s={s}>{SMAP[s]?.label || 'New'}</Pill>

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { unpaid: 'Unpaid', partial: 'Partly paid', paid: 'Paid', cancelled: 'Cancelled' }
export const InvoiceStatusPill = ({ st }: { st: InvoiceStatus }) =>
  <Pill data-st={st} className={st === 'cancelled' ? 'line-through' : ''}>{INVOICE_STATUS_LABEL[st]}</Pill>

export function InvoiceTypeBadge({ t }: { t: InvoiceType }) {
  return <span className={cn('rounded-[5px] px-1.5 py-1 text-[10.5px] leading-none font-bold tracking-[0.07em] whitespace-nowrap uppercase',
    t === 'gst' ? 'bg-[var(--s-talking-bg)] text-[var(--s-talking)]' : 'bg-muted text-ink-2')}>{t === 'gst' ? 'GST' : 'Non-GST'}</span>
}

const RATE_ICON = { hot: Flame, warm: Sun, cold: Snowflake, unqualified: Ban }
export function RatingBadge({ r, className }: { r: LeadRating | null | undefined; className?: string }) {
  if (!r || !RMAP[r]) return null
  const Icon = RATE_ICON[r]
  return (
    <span data-r={r} title={`${RMAP[r].label} lead · ${RMAP[r].hint}`}
      className={cn('inline-flex items-center gap-1 rounded-[5px] bg-[var(--rb)] py-1 pr-1.5 pl-1 align-middle text-[10.5px] leading-none font-bold tracking-[0.07em] whitespace-nowrap text-[var(--rc)] uppercase', className)}>
      <Icon className="size-3" aria-hidden />{RMAP[r].label}
    </span>
  )
}
export const RatingIcon = RATE_ICON

export function PackagePill({ p }: { p: PackageKey | '' | undefined }) {
  if (!p || !PKG[p]) return null
  const P = PKG[p]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs leading-none font-medium whitespace-nowrap text-ink-2" title={`${P.label} package · ${P.ads} UGC ads`}>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map(i => (
          <i key={i} style={{ height: 4 + i * 2 }} className={cn('w-1 rounded-[1px]', i <= P.rank ? (P.rank >= 3 ? 'bg-primary' : 'bg-ink-2') : 'bg-input')} />
        ))}
      </span>
      {P.label} <em className="font-mono text-[11.5px] text-muted-foreground not-italic">{P.ads}</em>
    </span>
  )
}

export function TimelinePill({ t }: { t: TimelineKey | '' | undefined }) {
  if (!t || !TL[t]) return null
  return <span title={`Wants content live: ${TL[t].label}`} className={cn('text-xs whitespace-nowrap', t === 'now' ? 'font-semibold text-primary' : 'text-muted-foreground')}>{TL[t].short}</span>
}

/** Native <select> styled like the shadcn inputs — mobile-friendly and accessible. */
export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('field w-auto', className)} {...rest}>{children}</select>
}
