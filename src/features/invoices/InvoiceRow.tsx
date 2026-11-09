/* One invoice in the list: a table row on wide screens, a two-line card on phones. */
import { Download } from 'lucide-react'
import { memo } from 'react'
import { Link, useNavigate } from 'react-router'
import { InvoiceStatusPill, InvoiceTypeBadge } from '@/components/common'
import { fmtDate, money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/types'
import { invoiceStatus, type Totals } from './model'

/** Shared grid template for the header and rows (legacy .irow). */
export const ROW_GRID = cn(
  'grid items-center gap-x-2.5 gap-y-1 px-3.5',
  'grid-cols-[26px_1fr_auto] [grid-template-areas:"ck_cl_amt"_"ck_meta_st"]',
  'min-[720px]:gap-2.5 min-[720px]:[grid-template-areas:none] min-[720px]:grid-cols-[30px_84px_92px_minmax(150px,1fr)_112px_100px_40px]',
  'min-[1080px]:grid-cols-[34px_96px_98px_minmax(170px,1.6fr)_74px_118px_118px_104px_44px]',
)
const AUTO = 'min-[720px]:[grid-area:auto]'
export const CELL = {
  ck: cn('[grid-area:ck] self-start pt-0.5 min-[720px]:self-center min-[720px]:pt-0', AUTO),
  num: 'hidden min-[720px]:block',
  date: 'hidden min-[720px]:block',
  cl: cn('[grid-area:cl] min-w-0', AUTO),
  meta: '[grid-area:meta] flex min-w-0 items-center gap-2 text-[12.5px] text-muted-foreground min-[720px]:hidden',
  type: 'hidden min-[1080px]:block',
  tot: cn('[grid-area:amt]', AUTO),
  bal: 'hidden min-[1080px]:block',
  st: cn('[grid-area:st] justify-self-end min-[720px]:justify-self-auto', AUTO),
  dl: 'hidden min-[720px]:block',
}
export const checkboxCls = 'size-4 cursor-pointer accent-primary'

export const InvoiceRow = memo(function InvoiceRow({ inv, t, selected, onSelect, onDownload }: {
  inv: Invoice; t: Totals; selected: boolean; onSelect: (id: string, on: boolean) => void; onDownload: (inv: Invoice) => void
}) {
  const navigate = useNavigate()
  const st = invoiceStatus(inv)
  const items = (inv.items || []).map(i => i.desc).filter(Boolean)
  const balance = st === 'cancelled' ? 0 : t.balance
  return (
    <div
      className={cn(ROW_GRID, 'cursor-pointer border-t py-2.5 hover:bg-muted')}
      onClick={e => { if (!(e.target as HTMLElement).closest('input,button,a')) navigate(`/invoices/${inv.id}`) }}
    >
      <div className={CELL.ck}>
        <input type="checkbox" className={checkboxCls} checked={selected} onChange={e => onSelect(inv.id, e.target.checked)} aria-label={`Select invoice ${inv.label}`} />
      </div>
      <div className={cn(CELL.num, 'font-mono text-[13.5px] font-semibold')}>#{inv.label}</div>
      <div className={cn(CELL.date, 'font-mono text-[13px]')}>{fmtDate(inv.date)}</div>
      <div className={CELL.cl}>
        <Link to={`/invoices/${inv.id}`} className="block truncate font-semibold hover:underline" aria-label={`Invoice #${inv.label}, ${inv.client?.company || 'no client'}`}>
          {inv.client?.company || '—'}
        </Link>
        <span className="block truncate text-[12.5px] text-muted-foreground">{items.join(', ') || '—'}</span>
      </div>
      <div className={CELL.meta}>
        <span className="font-mono">#{inv.label}</span><InvoiceTypeBadge t={inv.type} /><span className="truncate">{fmtDate(inv.date)}</span>
      </div>
      <div className={CELL.type}><InvoiceTypeBadge t={inv.type} /></div>
      <div className={cn(CELL.tot, 'text-right font-mono text-[13.5px] font-medium tabular')}>{money(t.total)}</div>
      <div className={cn(CELL.bal, 'text-right font-mono text-[13.5px] font-medium tabular', balance > 0 ? 'text-warn' : 'text-muted-foreground')}>{money(balance)}</div>
      <div className={CELL.st}><InvoiceStatusPill st={st} /></div>
      <div className={CELL.dl}>
        <button type="button" onClick={() => onDownload(inv)} title="Download PDF" aria-label={`Download invoice ${inv.label}`}
          className="grid size-8 place-items-center rounded-lg border bg-card text-ink-2 hover:border-ink-2 hover:text-foreground">
          <Download className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
})
