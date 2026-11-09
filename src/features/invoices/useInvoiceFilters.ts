/* Invoice list filters: state (persisted in localStorage, seeded from ?query), the
   filtered + sorted list, and the option counts for each filter (cross-filtered). */
import { useEffect, useMemo, useState } from 'react'
import { MONTH_FULL, pad } from '@/lib/format'
import type { Invoice, InvoiceStatus, InvoiceType } from '@/types'
import { calcTotals, invoiceStatus, searchHay, STATUS_OPTIONS, type Totals } from './model'

export interface InvoiceFilters {
  q: string
  type: InvoiceType | ''
  status: InvoiceStatus | ''
  /** lower-cased company name */
  client: string
  year: string
  /** '01'…'12' */
  mon: string
  from: string
  to: string
  sort: SortKey
}
export type SortKey = 'newest' | 'oldest' | 'high' | 'low' | 'due' | 'number'

const LS_KEY = 'pagesdesk.invoices.f'
export const BLANK_FILTERS: InvoiceFilters = { q: '', type: '', status: '', client: '', year: '', mon: '', from: '', to: '', sort: 'newest' }
const FILTER_KEYS = Object.keys(BLANK_FILTERS) as (keyof InvoiceFilters)[]

type TotalsOf = (inv: Invoice) => Totals
export const SORTS: Record<SortKey, [string, (t: TotalsOf) => (a: Invoice, b: Invoice) => number]> = {
  newest: ['Newest first', () => (a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || 0) - (a.number || 0)],
  oldest: ['Oldest first', () => (a, b) => (a.date || '').localeCompare(b.date || '') || (a.number || 0) - (b.number || 0)],
  high: ['Amount: high to low', t => (a, b) => t(b).total - t(a).total],
  low: ['Amount: low to high', t => (a, b) => t(a).total - t(b).total],
  due: ['Balance due', t => (a, b) => t(b).balance - t(a).balance],
  number: ['Invoice number', () => (a, b) => (a.type || '').localeCompare(b.type || '') || (b.number || 0) - (a.number || 0)],
}

function sanitize(raw: Partial<Record<keyof InvoiceFilters, unknown>>): InvoiceFilters {
  const f = { ...BLANK_FILTERS }
  for (const k of FILTER_KEYS) if (typeof raw[k] === 'string') (f as Record<string, string>)[k] = raw[k] as string
  if (!(f.sort in SORTS)) f.sort = 'newest'
  if (f.type && f.type !== 'gst' && f.type !== 'nongst') f.type = ''
  if (f.status && !STATUS_OPTIONS.some(([k]) => k === f.status)) f.status = ''
  return f
}
function loadFilters(params: URLSearchParams): InvoiceFilters {
  let saved: Partial<InvoiceFilters> = {}
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {} } catch { /* ignore */ }
  const fromUrl = FILTER_KEYS.filter(k => params.has(k))
  // A link such as /invoices?status=unpaid starts from clean filters (keeping the saved sort).
  if (!fromUrl.length) return sanitize(saved)
  const base: Partial<Record<keyof InvoiceFilters, unknown>> = { sort: saved.sort }
  for (const k of fromUrl) base[k] = k === 'client' ? (params.get(k) || '').toLowerCase() : params.get(k)
  return sanitize(base)
}

type Skip = 'type' | 'status' | 'client' | 'date'
function matches(inv: Invoice, f: InvoiceFilters, words: string[], skip?: Skip) {
  if (skip !== 'type' && f.type && inv.type !== f.type) return false
  if (skip !== 'status' && f.status && invoiceStatus(inv) !== f.status) return false
  if (skip !== 'client' && f.client && (inv.client?.company || '').trim().toLowerCase() !== f.client) return false
  const d = inv.date || ''
  if (skip !== 'date' && f.year && d.slice(0, 4) !== f.year) return false
  if (skip !== 'date' && f.mon && d.slice(5, 7) !== f.mon) return false
  if (f.from && d < f.from) return false
  if (f.to && d > f.to) return false
  if (words.length) { const hay = searchHay(inv); if (!words.every(w => hay.includes(w))) return false }
  return true
}

export interface Option { value: string; label: string }

export function useInvoiceFilters(invoices: Invoice[], params: URLSearchParams) {
  const [f, setF] = useState<InvoiceFilters>(() => loadFilters(params))
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(f)) } catch { /* ignore */ } }, [f])

  const set = (patch: Partial<InvoiceFilters>) => setF(prev => ({ ...prev, ...patch }))
  const clear = () => setF(prev => ({ ...BLANK_FILTERS, sort: prev.sort }))
  const active = !!(f.q || f.type || f.status || f.client || f.year || f.mon || f.from || f.to)

  const totals = useMemo(() => new Map(invoices.map(i => [i.id, calcTotals(i)])), [invoices])

  const derived = useMemo(() => {
    const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const by = (skip?: Skip) => invoices.filter(inv => matches(inv, f, words, skip))
    const t: TotalsOf = inv => totals.get(inv.id) || calcTotals(inv)
    const list = by().sort(SORTS[f.sort][1](t))

    const sc: Partial<Record<InvoiceStatus, number>> = {}
    for (const i of by('status')) { const s = invoiceStatus(i); sc[s] = (sc[s] || 0) + 1 }
    const statusOptions: Option[] = [{ value: '', label: 'Any status' }, ...STATUS_OPTIONS.map(([k, l]) => ({ value: k, label: `${l} · ${sc[k] || 0}` }))]

    const clients = new Map<string, { name: string; n: number }>()
    for (const i of invoices) {
      const n = (i.client?.company || '').trim(); if (!n) continue
      const k = n.toLowerCase(); const c = clients.get(k) || { name: n, n: 0 }; c.n++; clients.set(k, c)
    }
    const clientOptions: Option[] = [{ value: '', label: 'All clients' },
      ...[...clients.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, c]) => ({ value: k, label: `${c.name} · ${c.n}` }))]
    if (f.client && !clients.has(f.client)) clientOptions.push({ value: f.client, label: `${f.client} · 0` })

    const years = new Map<string, number>(), mons = new Map<string, number>()
    for (const i of by('date')) {
      const y = (i.date || '').slice(0, 4), m = (i.date || '').slice(5, 7)
      if (!y) continue
      if (!f.mon || m === f.mon) years.set(y, (years.get(y) || 0) + 1)
      if (!f.year || y === f.year) mons.set(m, (mons.get(m) || 0) + 1)
    }
    const yearOptions: Option[] = [{ value: '', label: 'Any year' }, ...[...years.keys()].sort().reverse().map(y => ({ value: y, label: `${y} · ${years.get(y)}` }))]
    if (f.year && !years.has(f.year)) yearOptions.push({ value: f.year, label: `${f.year} · 0` })
    const monthOptions: Option[] = [{ value: '', label: 'Any month' }, ...MONTH_FULL.flatMap((n, i) => {
      const k = pad(i + 1); const c = mons.get(k) || 0
      return c || k === f.mon ? [{ value: k, label: `${n} · ${c}` }] : []
    })]
    return { list, statusOptions, clientOptions, yearOptions, monthOptions }
  }, [invoices, f, totals])

  return { f, set, clear, active, totals, ...derived }
}
