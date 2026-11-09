/* Invoice maths and status, shared by Invoices and Overview. */
import { round2 } from '@/lib/format'
import type { Invoice, InvoiceItem, InvoiceStatus, InvoiceType } from '@/types'

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
