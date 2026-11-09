/* Invoice maths and status, shared by Invoices and Overview. */
import { num, nowIso, round2 } from '@/lib/format'
import type {
  BusinessSettings, ClientDetails, Counters, Invoice, InvoiceItem, InvoiceStatus, InvoiceType, Payment, SellerProfile, SellerSnapshot,
} from '@/types'
import type { PrintableInvoice } from './pdf'

export interface Totals { subtotal: number; tax: number; total: number; paid: number; balance: number; rate: number }

export function calcTotals(inv: { type: InvoiceType; items?: InvoiceItem[]; taxRate?: number; paid?: number }): Totals {
  const subtotal = round2((inv.items || []).reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0))
  const rate = inv.type === 'gst' ? Number(inv.taxRate) || 0 : 0
  const tax = Math.round(subtotal * rate) / 100
  const total = round2(subtotal + tax)
  const paid = Math.min(Number(inv.paid) || 0, total)
  return { subtotal, tax, total, paid, balance: round2(total - paid), rate }
}

export function invoiceStatus(inv: Pick<Invoice, 'cancelled' | 'type' | 'items' | 'taxRate' | 'paid'>): InvoiceStatus {
  if (inv.cancelled) return 'cancelled'
  const t = calcTotals(inv)
  if (t.total > 0 && t.balance <= 0) return 'paid'
  return t.paid > 0 ? 'partial' : 'unpaid'
}

export const TYPE_LABEL: Record<InvoiceType, string> = { gst: 'GST', nongst: 'Non-GST' }
export const STATUS_OPTIONS: [InvoiceStatus, string][] = [['unpaid', 'Unpaid'], ['partial', 'Partly paid'], ['paid', 'Paid'], ['cancelled', 'Cancelled']]

/* ---------- helpers used by the invoices screens (legacy invoices.js) ---------- */

export const TAX_RATES = [0, 5, 12, 18, 28]
export const INVOICE_TYPES: InvoiceType[] = ['gst', 'nongst']
export const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS) as Record<InvoiceStatus, string>
export const CLIENT_FIELDS = ['address', 'gstin', 'pan', 'email', 'phone'] as const
export const blankClient = (): ClientDetails => ({ company: '', address: '', gstin: '', pan: '', email: '', phone: '' })

/** e.g. 'NG-12' — the label the next auto number would get. */
export const nextLabel = (settings: BusinessSettings, counters: Counters, type: InvoiceType) =>
  `${settings.profiles[type].prefix || ''}${counters[type]}`

/** Seller snapshot stored on an invoice (the profile without its prefix). */
export const sellerFromProfile = (p: SellerProfile): SellerSnapshot =>
  ({ legalName: p.legalName || '', gstin: p.gstin || '', address: p.address || '', pan: p.pan || '', terms: p.terms || '' })

/** Fields the PDF/preview renderer needs; the logo always comes from settings. */
export function toPrintable(inv: Invoice, logo: string): PrintableInvoice {
  return {
    type: inv.type, label: inv.label, date: inv.date, dueDate: inv.dueDate || '', seller: inv.seller,
    client: inv.client || {}, items: inv.items || [], taxRate: inv.taxRate, paid: inv.paid, notes: inv.notes || '', logo,
  }
}

/** Another invoice of this type already uses this label. */
export const isDuplicateLabel = (invoices: Invoice[], type: InvoiceType, label: string, exceptId?: string | null) =>
  invoices.some(x => x.id !== exceptId && x.type === type && String(x.label) === String(label))

/** Each client's details from their latest invoice, keyed by lower-cased company name. */
export function pastClients(invoices: Invoice[]): Map<string, ClientDetails> {
  const m = new Map<string, ClientDetails>()
  for (const inv of [...invoices].sort((a, b) => (b.date || '').localeCompare(a.date || ''))) {
    const c = inv.client; const k = (c?.company || '').trim().toLowerCase()
    if (k && !m.has(k)) m.set(k, { ...blankClient(), ...c })
  }
  return m
}

/** Payments with any amount recorded before payments were itemised added as a first entry. */
export function legacyPayments(inv: Pick<Invoice, 'payments' | 'paid' | 'date' | 'updatedAt' | 'updatedBy'>): Payment[] {
  const p = Array.isArray(inv.payments) ? inv.payments.slice() : []
  const recorded = p.reduce((a, x) => a + num(x.amount), 0)
  const paid = num(inv.paid)
  if (paid > recorded + 0.004) p.unshift({ amount: round2(paid - recorded), date: inv.date, at: inv.updatedAt || nowIso(), by: inv.updatedBy || null })
  return p
}

/** Fields to write after the payments list changes. */
export function paymentsPatch(inv: Invoice, payments: Payment[]) {
  const paid = round2(payments.reduce((a, p) => a + num(p.amount), 0))
  const next = { ...inv, payments, paid }
  const t = calcTotals(next)
  return { payments, paid: t.paid, balance: t.balance, status: invoiceStatus(next) }
}

/** Lower-cased text the list search matches against. */
export const searchHay = (inv: Invoice) => {
  const c: Partial<ClientDetails> = inv.client || {}
  return [inv.label, c.company, c.gstin, c.address, c.email, inv.notes, ...(inv.items || []).map(i => i.desc)].join(' ').toLowerCase()
}

export const fmtStamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
