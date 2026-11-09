/* Saving the editor: number allocation, the stored document, the lead note, then
   navigation (and optionally the PDF download). */
import { addDoc, collection } from 'firebase/firestore'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useStore, useWriter } from '@/data/store'
import { db } from '@/lib/firebase'
import { money, nowIso } from '@/lib/format'
import type { Invoice, InvoiceDoc, LeadNote } from '@/types'
import { useInvoiceDownloads } from '../downloads'
import { calcTotals, invoiceStatus, isDuplicateLabel } from '../model'
import { bumpPast, reserveNumbers } from '../numbering'
import { useGuardedWrite } from '../writes'
import { sellerFor, type InvoiceFormOutput, type KeptSeller } from './schema'

export class DuplicateNumberError extends Error {}

export function useSaveInvoice(editId: string | null, kept: KeptSeller | null) {
  const { invoices, settings, meId, getInvoice, getLead } = useStore()
  const writer = useWriter()
  const guarded = useGuardedWrite()
  const navigate = useNavigate()
  const { downloadOne } = useInvoiceDownloads()

  return async function save(v: InvoiceFormOutput, andDownload: boolean) {
    const prefix = settings.profiles[v.type].prefix || ''
    let number: number
    if (v.number != null) {
      number = v.number
      if (isDuplicateLabel(invoices, v.type, `${prefix}${number}`, editId)) {
        throw new DuplicateNumberError(`Invoice ${prefix}${number} already exists. Use another number or leave it blank for auto.`)
      }
    } else {
      number = await guarded(() => reserveNumbers(v.type, 1))
    }

    const t = calcTotals(v)
    const prev = editId ? getInvoice(editId) : undefined
    const now = nowIso()
    const data: Omit<InvoiceDoc, 'createdAt' | 'createdBy' | 'cancelled'> & { cancelled?: boolean } = {
      type: v.type, number, prefix, label: `${prefix}${number}`,
      date: v.date, dueDate: v.dueDate,
      seller: sellerFor(v.type, settings, kept, v.terms),
      client: v.client, items: v.items, taxRate: v.taxRate, notes: v.notes,
      subtotal: t.subtotal, tax: t.tax, total: t.total, paid: t.paid, balance: t.balance,
      leadPath: v.leadPath || '',
      payments: Array.isArray(prev?.payments) ? prev.payments : [],
      status: 'unpaid', updatedAt: now, updatedBy: meId,
    }
    if (prev?.cancelled) data.cancelled = true
    data.status = invoiceStatus({ ...data, cancelled: !!data.cancelled })

    let id = editId
    if (id) {
      await writer.update(`invoices/${id}`, data)
    } else {
      const full: InvoiceDoc = { ...data, cancelled: false, createdAt: now, createdBy: meId }
      id = (await guarded(() => addDoc(collection(db, 'invoices'), full))).id
    }
    if (v.number != null) bumpPast(v.type, number).catch(() => {})

    if (!editId && v.leadPath) {
      const lead = getLead(v.leadPath)
      if (lead) {
        const note: LeadNote = { kind: 'note', t: `Invoice #${data.label} created — ${money(t.total)}`, at: nowIso(), by: meId }
        writer.update(lead.path, { notes: [...(lead.notes || []), note] }).catch(() => {})
      }
    }
    toast.success(editId ? `Saved invoice #${data.label}` : `Created invoice #${data.label}`)
    if (andDownload) {
      const saved = { ...prev, ...data, id } as Invoice
      downloadOne(saved)
    }
    navigate(`/invoices/${id}`)
  }
}
