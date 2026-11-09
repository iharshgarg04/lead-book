/* Pieces of the invoice list: stat tiles, filter bar and the selection bar. */
import { Download, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Select, StatTile } from '@/components/common'
import { Button } from '@/components/ui/button'
import { money } from '@/lib/format'
import type { Invoice } from '@/types'
import { plural, type Totals } from './model'
import { Segmented } from './ui'
import { SORTS, type InvoiceFilters, type Option, type SortKey } from './useInvoiceFilters'

export function InvoiceStats({ list, totals }: { list: Invoice[]; totals: (i: Invoice) => Totals }) {
  const live = list.filter(i => !i.cancelled)
  const sum = (k: 'total' | 'paid' | 'balance') => live.reduce((a, i) => a + totals(i)[k], 0)
  const unpaidN = live.filter(i => totals(i).balance > 0).length
  const outstanding = sum('balance')
  const gst = live.filter(i => i.type === 'gst').reduce((a, i) => a + totals(i).tax, 0)
  return (
    <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      <StatTile label="Invoices" value={list.length} detail={`${list.filter(i => i.type === 'gst').length} GST · ${list.filter(i => i.type === 'nongst').length} non-GST`} />
      <StatTile label="Billed" value={money(sum('total'))} detail="excluding cancelled" />
      <StatTile label="Received" value={money(sum('paid'))} tone="good" />
      <StatTile label="Outstanding" value={money(outstanding)} detail={`${plural(unpaidN, 'invoice')} unpaid`} tone={outstanding > 0 ? 'warn' : undefined} />
      <StatTile label="GST collected" value={money(gst)} detail="on GST invoices" />
    </div>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(value)
  const focused = useRef(false)
  // Follow outside changes (e.g. "Clear filters") unless the user is typing.
  useEffect(() => { if (!focused.current) setQ(value) }, [value])
  useEffect(() => {
    if (q === value) return
    const t = setTimeout(() => onChange(q), 120)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative min-w-0 flex-[1_1_280px]">
      <Search className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <label htmlFor="iv-q" className="sr-only">Search invoices</label>
      <input id="iv-q" type="search" className="field pl-[34px]" placeholder="Search client, invoice #, item, GSTIN…" autoComplete="off"
        value={q} onChange={e => setQ(e.target.value)} onFocus={() => { focused.current = true }} onBlur={() => { focused.current = false }} />
    </div>
  )
}

function FilterSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Select id={id} value={value} onChange={e => onChange(e.target.value)} className="max-w-full flex-[0_1_auto]">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </>
  )
}

export function InvoiceFilterBar({ f, set, options }: {
  f: InvoiceFilters
  set: (patch: Partial<InvoiceFilters>) => void
  options: { statusOptions: Option[]; clientOptions: Option[]; monthOptions: Option[]; yearOptions: Option[] }
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-[18px] pb-2.5">
      <SearchBox value={f.q} onChange={q => set({ q })} />
      <Segmented label="Invoice type" value={f.type} onChange={type => set({ type })}
        options={[{ v: '', label: 'All' }, { v: 'gst', label: 'GST' }, { v: 'nongst', label: 'Non-GST' }]} />
      <FilterSelect id="iv-status" label="Status" value={f.status} options={options.statusOptions} onChange={v => set({ status: v as InvoiceFilters['status'] })} />
      <FilterSelect id="iv-client" label="Client" value={f.client} options={options.clientOptions} onChange={client => set({ client })} />
      <FilterSelect id="iv-mon" label="Month" value={f.mon} options={options.monthOptions} onChange={mon => set({ mon })} />
      <FilterSelect id="iv-year" label="Year" value={f.year} options={options.yearOptions} onChange={year => set({ year })} />
      <label htmlFor="iv-from" className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">From
        <input id="iv-from" type="date" className="field w-auto" value={f.from} onChange={e => set({ from: e.target.value })} />
      </label>
      <label htmlFor="iv-to" className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">To
        <input id="iv-to" type="date" className="field w-auto" value={f.to} onChange={e => set({ to: e.target.value })} />
      </label>
      <FilterSelect id="iv-sort" label="Sort" value={f.sort} onChange={v => set({ sort: v as SortKey })}
        options={(Object.keys(SORTS) as SortKey[]).map(k => ({ value: k, label: `Sort: ${SORTS[k][0]}` }))} />
    </div>
  )
}

export function SelectionBar({ count, total, onDownload, onMarkPaid, onClear, busy, readOnly }: {
  count: number; total: number; onDownload: () => void; onMarkPaid: () => void; onClear: () => void; busy: boolean; readOnly: boolean
}) {
  if (!count) return null
  const btn = 'border-background/35 bg-transparent text-background hover:border-background hover:bg-transparent hover:text-background dark:bg-transparent'
  return (
    <div role="region" aria-label="Selected invoices"
      className="sticky bottom-[calc(80px+env(safe-area-inset-bottom,0px))] z-[6] mt-3 flex flex-wrap items-center gap-2.5 rounded-xl bg-foreground py-2.5 pr-3 pl-4 text-background shadow-lg md:bottom-4">
      <b>{count} selected</b>
      <span className="font-mono opacity-80 tabular">{money(total)}</span>
      <span className="flex-1" />
      <Button size="sm" variant="outline" className={btn} onClick={onDownload}><Download aria-hidden />Download PDFs</Button>
      <Button size="sm" variant="outline" className={btn} onClick={onMarkPaid} disabled={busy || readOnly}>Mark paid</Button>
      <Button size="sm" variant="outline" className={btn} onClick={onClear}>Clear</Button>
    </div>
  )
}
