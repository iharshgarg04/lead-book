/* Invoice number allocation on settings/counters (same rules as the legacy app). */
import { doc, runTransaction } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { DEFAULT_COUNTERS } from '@/lib/settings'
import type { InvoiceType } from '@/types'

const countersRef = () => doc(db, 'settings/counters')

/** Reserve `n` consecutive numbers for a series; resolves to the first one. */
export function reserveNumbers(type: InvoiceType, n = 1): Promise<number> {
  const ref = countersRef()
  return runTransaction(db, async tx => {
    const s = await tx.get(ref)
    const cur = (s.exists() && Number(s.data()[type])) || DEFAULT_COUNTERS[type]
    tx.set(ref, { [type]: cur + n }, { merge: true })
    return cur
  })
}

/** After a manually numbered invoice, keep the counter ahead of it. */
export function bumpPast(type: InvoiceType, number: number): Promise<void> {
  const ref = countersRef()
  return runTransaction(db, async tx => {
    const s = await tx.get(ref)
    const cur = (s.exists() && Number(s.data()[type])) || DEFAULT_COUNTERS[type]
    if (number >= cur) tx.set(ref, { [type]: number + 1 }, { merge: true })
  })
}
