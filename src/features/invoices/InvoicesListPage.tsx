/* Invoice history: stats, filters, selectable rows, bulk download / mark paid. */
import { doc, writeBatch } from 'firebase/firestore'
import { Download, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useStore } from '@/data/store'
import { db } from '@/lib/firebase'
import { nowIso, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/types'
import { useInvoiceDownloads } from './downloads'
import { InvoiceFilterBar, InvoiceStats, SelectionBar } from './InvoiceListParts'
import { CELL, checkboxCls, InvoiceRow, ROW_GRID } from './InvoiceRow'
import { calcTotals, legacyPayments, nextLabel, plural } from './model'
import { useInvoiceFilters } from './useInvoiceFilters'
import { useScrollTop } from './ui'
import { useGuardedWrite } from './writes'

const PAGE = 100

export default function InvoicesListPage() {
  const { invoices, invoicesReady, settings, counters, readOnly, meId } = useStore()
  const [params, setParams] = useSearchParams()
  const filters = useInvoiceFilters(invoices, params)
  const { f, list, totals, active } = filters
  const { downloadOne, downloadMany } = useInvoiceDownloads()
  const guarded = useGuardedWrite()
  const [shown, setShown] = useState(PAGE)
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  useScrollTop()

  // Query params only seed the filters; drop them so they don't stick in the URL.
  useEffect(() => { if ([...params.keys()].length) setParams({}, { replace: true }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Any filter change starts the list from the top again.
  useEffect(() => { setShown(PAGE) }, [f])
  // Forget selected invoices that no longer exist.
  useEffect(() => {
    setSel(prev => {
      const ids = new Set(invoices.map(i => i.id))
      const next = new Set([...prev].filter(id => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [invoices])

  const t = useCallback((i: Invoice) => totals.get(i.id) || calcTotals(i), [totals])
  const visible = list.slice(0, shown)
  const allSel = visible.length > 0 && visible.every(i => sel.has(i.id))
  const selected = useMemo(() => invoices.filter(i => sel.has(i.id)), [invoices, sel])
  const selTotal = selected.reduce((a, i) => a + t(i).total, 0)

  const onSelect = useCallback((id: string, on: boolean) => setSel(prev => {
    const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n
  }), [])
  const selectAll = (on: boolean) => setSel(prev => {
    const n = new Set(prev); visible.forEach(i => (on ? n.add(i.id) : n.delete(i.id))); return n
  })

  async function markPaid() {
    const due = selected.filter(i => !i.cancelled && t(i).balance > 0)
    if (!due.length) { toast('Those invoices are already paid.'); return }
    setBusy(true)
    try {
      await guarded(() => {
        const batch = writeBatch(db)
        const at = nowIso()
        for (const inv of due) {
          const tt = t(inv)
          const payments = [...legacyPayments(inv), { amount: tt.balance, date: todayKey(), at, by: meId }]
          batch.update(doc(db, `invoices/${inv.id}`), { payments, paid: tt.total, balance: 0, status: 'paid', updatedAt: at, updatedBy: meId })
        }
        return batch.commit()
      })
      toast.success(`Marked ${plural(due.length, 'invoice')} paid`)
      setSel(new Set())
    } catch { /* reported by useGuardedWrite */ }
    setBusy(false)
  }

  const newButtons = (
    <>
      <Button variant="outline" asChild><Link to="/invoices/bulk"><Plus aria-hidden />Create multiple</Link></Button>
      <Button asChild><Link to="/invoices/new"><Plus aria-hidden />New invoice</Link></Button>
    </>
  )

  let body: React.ReactNode
  if (!invoicesReady && !invoices.length) body = <p className="px-5 py-6 text-center text-muted-foreground" role="status">Loading invoices…</p>
  else if (!invoices.length) body = (
    <EmptyState title="No invoices yet" className="border-0">
      Create your first one — it continues from invoice #{nextLabel(settings, counters, 'gst')}.
      <div className="mt-3 flex flex-wrap justify-center gap-2">{newButtons}</div>
    </EmptyState>
  )
  else if (!list.length) body = <EmptyState title="No invoices match" className="border-0">Try removing a filter.</EmptyState>
  else body = (
    <>
      <div className={cn(ROW_GRID, 'hidden bg-muted py-[9px] text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase min-[720px]:grid')}>
        <div><input type="checkbox" className={checkboxCls} checked={allSel} onChange={e => selectAll(e.target.checked)} aria-label="Select all shown" /></div>
        <div>Invoice</div><div>Date</div><div>Client</div><div className={CELL.type}>Type</div>
        <div className="text-right">Amount</div><div className={cn(CELL.bal, 'text-right')}>Balance</div><div>Status</div><div><span className="sr-only">Download</span></div>
      </div>
      <label className="flex items-center gap-2 bg-muted px-3.5 py-2 text-[12.5px] text-muted-foreground min-[720px]:hidden">
        <input type="checkbox" className={checkboxCls} checked={allSel} onChange={e => selectAll(e.target.checked)} />Select all shown
      </label>
      {visible.map(inv => <InvoiceRow key={inv.id} inv={inv} t={t(inv)} selected={sel.has(inv.id)} onSelect={onSelect} onDownload={downloadOne} />)}
      {list.length > shown && (
        <div className="border-t p-3.5 text-center">
          <Button size="sm" variant="outline" onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</Button>
        </div>
      )}
    </>
  )

  return (
    <>
      <PageHeader title="Invoices" sub="GST and non-GST invoices" actions={newButtons} />
      <InvoiceStats list={list} totals={t} />
      <InvoiceFilterBar f={f} set={filters.set} options={filters} />
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 text-[13px] text-muted-foreground">
        <span aria-live="polite">{list.length} of {invoices.length} invoices</span>
        <span className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" onClick={() => downloadMany(list)}><Download aria-hidden />Download these</Button>
          {active && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={filters.clear}>Clear filters</Button>}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">{body}</div>
      <SelectionBar count={selected.length} total={selTotal} busy={busy} readOnly={readOnly}
        onDownload={() => downloadMany(selected)} onMarkPaid={markPaid} onClear={() => setSel(new Set())} />
    </>
  )
}
