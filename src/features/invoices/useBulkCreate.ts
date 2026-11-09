/* Create the grouped bulk invoices: reserve a block of numbers per series, then one batch write. */
import { collection, doc, writeBatch } from 'firebase/firestore'
import { useStore } from '@/data/store'
import { db } from '@/lib/firebase'
import { nowIso } from '@/lib/format'
import type { Invoice, InvoiceDoc } from '@/types'
import type { BulkInvoice } from './bulkParser'
import { calcTotals, INVOICE_TYPES, sellerFromProfile } from './model'
import { reserveNumbers } from './numbering'
import { useGuardedWrite } from './writes'

export function useBulkCreate() {
  const { settings, meId } = useStore()
  const guarded = useGuardedWrite()
  return (invs: BulkInvoice[]) => guarded(async (): Promise<Invoice[]> => {
    const created: Invoice[] = []
    const batch = writeBatch(db)
    for (const type of INVOICE_TYPES) {
      const group = invs.filter(i => i.type === type)
      if (!group.length) continue
      const start = await reserveNumbers(type, group.length)
      const prof = settings.profiles[type]
      const prefix = prof.prefix || ''
      group.forEach((src, k) => {
        const number = start + k
        const base = {
          type, number, prefix, label: `${prefix}${number}`, date: src.date, dueDate: '', seller: sellerFromProfile(prof), client: src.client,
          items: src.items, taxRate: type === 'gst' ? settings.taxRate : 0, paid: 0, notes: '', leadPath: '', payments: [], cancelled: false,
        }
        const t = calcTotals(base)
        const now = nowIso()
        const data: InvoiceDoc = {
          ...base, subtotal: t.subtotal, tax: t.tax, total: t.total, balance: t.balance, status: 'unpaid',
          createdAt: now, createdBy: meId, updatedAt: now, updatedBy: meId,
        }
        const ref = doc(collection(db, 'invoices'))
        batch.set(ref, data)
        created.push({ id: ref.id, ...data })
      })
    }
    await batch.commit()
    return created
  })
}
