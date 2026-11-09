/* "Create multiple": row model, paste parser, grouping by Ref and validation. */
import { parseDelimited } from '@/lib/files'
import { dkey, num, pad, todayKey } from '@/lib/format'
import type { ClientDetails, InvoiceItem, InvoiceType } from '@/types'

export const BULK_COLS = [
  ['ref', 'Ref', 70], ['type', 'Type', 104], ['date', 'Date', 140], ['company', 'Company name', 190],
  ['address', 'Billing address', 230], ['gstin', 'GSTIN', 150], ['pan', 'PAN', 120], ['desc', 'Item', 200],
  ['qty', 'Qty', 64], ['rate', 'Rate (₹)', 100],
] as const
export type BulkKey = (typeof BULK_COLS)[number][0]
export type BulkRow = Record<Exclude<BulkKey, 'type'>, string> & { type: InvoiceType }
export interface BulkDefaults { type: InvoiceType; date: string }

export const blankRow = (d: BulkDefaults): BulkRow =>
  ({ ref: '', type: d.type, date: d.date, company: '', address: '', gstin: '', pan: '', desc: '', qty: '1', rate: '' })

const CONTENT_KEYS = ['company', 'address', 'gstin', 'pan', 'desc', 'rate', 'ref'] as const
/** Nothing typed apart from the defaults (type, date, qty). */
export const rowEmpty = (r: BulkRow) => !CONTENT_KEYS.some(k => String(r[k] || '').trim())

/** 'YYYY-MM-DD' from '2026-11-05', '05/11/2026', '5.11.26' or anything Date understands; '' if unreadable. */
export function normDate(s: unknown): string {
  const v = String(s || '').trim(); if (!v) return ''
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(+m[2])}-${pad(+m[1])}`
  const d = new Date(v); return isNaN(+d) ? '' : dkey(d)
}

const ALIAS: Record<BulkKey, string[]> = {
  ref: ['ref', 'invoice ref', 'group'], type: ['type', 'gst/non-gst', 'invoice type'], date: ['date', 'invoice date'],
  company: ['company', 'company name', 'client', 'customer', 'bill to'], address: ['address', 'billing address'],
  gstin: ['gstin', 'gst', 'gst number', 'gst no'], pan: ['pan', 'pan number'], desc: ['item', 'description', 'service'],
  qty: ['qty', 'quantity'], rate: ['rate', 'price', 'amount'],
}
const KEYS = BULK_COLS.map(c => c[0]) as BulkKey[]

/** Rows pasted from Sheets/Excel (tab or comma separated). A header row may name the columns in any order. */
export function parseBulk(text: string, d: BulkDefaults): BulkRow[] {
  const rows = parseDelimited(text || '').map(r => r.map(c => (c || '').trim())).filter(r => r.some(Boolean))
  if (!rows.length) return []
  let map: (BulkKey | null)[] = KEYS
  const head = rows[0].map(c => c.toLowerCase())
  if (head.some(h => ['company', 'company name', 'item', 'rate', 'client'].includes(h))) {
    map = head.map(h => KEYS.find(k => ALIAS[k].includes(h)) || null); rows.shift()
  }
  return rows.map(r => {
    const raw: Record<string, string> = { ...blankRow(d) }
    map.forEach((k, j) => { if (k && r[j] != null && r[j] !== '') raw[k] = r[j] })
    const t = raw.type
    const type: InvoiceType = /non|without|no\s*gst/i.test(t) ? 'nongst' : /gst/i.test(t) ? 'gst' : t === 'nongst' ? 'nongst' : d.type || 'gst'
    return {
      ...(raw as BulkRow), type,
      date: normDate(raw.date) || d.date || todayKey(),
      rate: String(raw.rate).replace(/[₹,\s]/g, ''),
      qty: String(raw.qty || '1').replace(/[,\s]/g, ''),
    }
  })
}

export interface BulkInvoice {
  type: InvoiceType
  date: string
  client: ClientDetails
  items: InvoiceItem[]
  /** row indexes this invoice came from */
  idx: number[]
  problems: string[]
}

/** Group rows into invoices (same Ref = one invoice) and validate each. */
export function bulkGroups(rows: BulkRow[], today: string): { invs: BulkInvoice[]; bad: Map<number, string[]> } {
  const groups = new Map<string, { rows: BulkRow[]; idx: number[] }>()
  rows.forEach((r, i) => {
    if (rowEmpty(r)) return
    const ref = String(r.ref || '').trim()
    const key = ref ? 'ref:' + ref.toLowerCase() : 'row:' + i
    const g = groups.get(key) || { rows: [], idx: [] }
    g.rows.push(r); g.idx.push(i); groups.set(key, g)
  })
  const invs: BulkInvoice[] = [], bad = new Map<number, string[]>()
  for (const g of groups.values()) {
    const pick = (k: BulkKey) => String(g.rows.find(r => String(r[k] || '').trim())?.[k] || '')
    const inv: BulkInvoice = {
      type: pick('type') === 'nongst' ? 'nongst' : 'gst',
      date: pick('date') || today,
      client: { company: pick('company').trim(), address: pick('address').trim(), gstin: pick('gstin').trim().toUpperCase(), pan: pick('pan').trim().toUpperCase(), email: '', phone: '' },
      items: g.rows.filter(r => String(r.desc || '').trim() || String(r.rate || '').trim())
        .map(r => ({ desc: String(r.desc || '').trim(), qty: num(r.qty || 1), rate: num(r.rate) })),
      idx: g.idx, problems: [],
    }
    if (!inv.client.company) inv.problems.push('company name')
    if (!inv.items.length) inv.problems.push('an item')
    if (inv.items.some(it => !it.desc)) inv.problems.push('item descriptions')
    if (inv.items.some(it => it.qty <= 0)) inv.problems.push('quantity above 0')
    if (inv.problems.length) g.idx.forEach(i => bad.set(i, inv.problems))
    invs.push(inv)
  }
  return { invs, bad }
}

/** Downloadable example sheet (generic sample data only). */
export const BULK_TEMPLATE = 'ref,type,date,company,address,gstin,pan,item,qty,rate\n' +
  'A1,GST,05/11/2026,Example Brand Pvt Ltd,"Street, City, State PIN",GSTIN here,PAN here,1 Story Reshare,1,5000\n' +
  'A2,Non-GST,05/11/2026,Another Brand,"Street, City, State PIN",,,UGC video (30s),3,4500\n' +
  'A2,Non-GST,05/11/2026,Another Brand,"Street, City, State PIN",,,Raw footage add-on,1,1500\n'
