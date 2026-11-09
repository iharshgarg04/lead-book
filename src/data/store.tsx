/* Live data for the whole portal. Subscribes once after sign-in and exposes
   leads, months, invoices, settings, counters and people through context. */
import {
  collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, type DocumentData, type Unsubscribe,
} from 'firebase/firestore'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { hydrateLead } from '@/features/leads/model'
import { db } from '@/lib/firebase'
import { monthLabelOf, nowIso } from '@/lib/format'
import { DEFAULT_COUNTERS, DEFAULT_SETTINGS, mergeCounters, mergeSettings } from '@/lib/settings'
import type { BusinessSettings, Counters, Invoice, InvoiceDoc, Lead, Month, Person } from '@/types'
import { useAuth } from './auth'

interface StoreCtx {
  /** all leads across months (stable array between unrelated updates) */
  leads: Lead[]
  months: Month[]
  invoices: Invoice[]
  settings: BusinessSettings
  counters: Counters
  people: Record<string, Person>
  /** true once months + every month's leads + invoices have answered from the server */
  ready: boolean
  invoicesReady: boolean
  /** the signed-in account isn't on the allowed list */
  denied: boolean
  /** a listener stopped with an error */
  error: string | null
  /** still waiting for the server after 10 s */
  slow: boolean
  readOnly: boolean
  setReadOnly: (v: boolean) => void
  meId: string | null
  getLead: (path: string | null | undefined) => Lead | undefined
  getInvoice: (id: string | null | undefined) => Invoice | undefined
}
const Ctx = createContext<StoreCtx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth()
  const [byMonth, setByMonth] = useState<Record<string, Lead[]>>({})
  const [months, setMonths] = useState<Month[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS)
  const [counters, setCounters] = useState<Counters>(DEFAULT_COUNTERS)
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [monthsReady, setMonthsReady] = useState(false)
  const [monthReady, setMonthReady] = useState<Record<string, boolean>>({})
  const [invoicesReady, setInvoicesReady] = useState(false)
  const [denied, setDenied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const monthSubs = useRef(new Map<string, Unsubscribe>())

  useEffect(() => {
    if (status !== 'signedIn' || !user) return
    const subs: Unsubscribe[] = []
    const fail = (e: { code?: string }) => {
      if (e.code === 'permission-denied') setDenied(true)
      else setError(e.code || 'error')
    }
    const slowTimer = setTimeout(() => setSlow(true), 10000)

    subs.push(onSnapshot(collection(db, 'months'), { includeMetadataChanges: true }, snap => {
      setDenied(false)
      setMonths(snap.docs.map(d => ({ key: d.id, label: (d.data().label as string) || monthLabelOf(d.id), tab: d.data().tab as string | undefined }))
        .sort((a, b) => a.key.localeCompare(b.key)))
      for (const d of snap.docs) {
        const key = d.id
        if (monthSubs.current.has(key)) continue
        monthSubs.current.set(key, onSnapshot(collection(db, `months/${key}/leads`), { includeMetadataChanges: true }, ls => {
          setByMonth(prev => ({ ...prev, [key]: ls.docs.map(x => hydrateLead(key, x.id, x.data())) }))
          if (!ls.metadata.fromCache) setMonthReady(prev => (prev[key] ? prev : { ...prev, [key]: true }))
        }, fail))
      }
      if (!snap.metadata.fromCache) setMonthsReady(true)
    }, fail))

    subs.push(onSnapshot(collection(db, 'invoices'), { includeMetadataChanges: true }, snap => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...(d.data() as InvoiceDoc) })))
      if (!snap.metadata.fromCache) setInvoicesReady(true)
    }, fail))
    subs.push(onSnapshot(doc(db, 'settings/business'), d => setSettings(mergeSettings(d.exists() ? (d.data() as Partial<BusinessSettings>) : null)), () => {}))
    subs.push(onSnapshot(doc(db, 'settings/counters'), d => setCounters(mergeCounters(d.exists() ? d.data() : null)), () => {}))
    subs.push(onSnapshot(collection(db, 'people'), snap => {
      setPeople(Object.fromEntries(snap.docs.map(d => [d.id, d.data() as Person])))
    }, () => {}))

    setDoc(doc(db, `people/${user.uid}`), { name: user.displayName || '', email: user.email || '', lastSeen: nowIso() }, { merge: true }).catch(() => {})

    const ms = monthSubs.current
    return () => {
      clearTimeout(slowTimer)
      subs.forEach(u => u()); ms.forEach(u => u()); ms.clear()
    }
  }, [status, user])

  const leads = useMemo(() => Object.values(byMonth).flat(), [byMonth])
  const leadIndex = useMemo(() => new Map(leads.map(l => [l.path, l])), [leads])
  const invoiceIndex = useMemo(() => new Map(invoices.map(i => [i.id, i])), [invoices])
  const ready = monthsReady && months.every(m => monthReady[m.key])
  useEffect(() => { if (ready) setSlow(false) }, [ready])

  const getLead = useCallback((p: string | null | undefined) => (p ? leadIndex.get(p) : undefined), [leadIndex])
  const getInvoice = useCallback((id: string | null | undefined) => (id ? invoiceIndex.get(id) : undefined), [invoiceIndex])

  const value: StoreCtx = {
    leads, months, invoices, settings, counters, people, ready, invoicesReady, denied, error, slow,
    readOnly, setReadOnly, meId: user?.uid ?? null, getLead, getInvoice,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be used inside <StoreProvider>')
  return c
}

/* ---------------- writes ---------------- */
const chains = new Map<string, Promise<unknown>>()

export function writeErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code
  if (code === 'permission-denied') return 'Not saved — this Google account can’t edit the lead book.'
  if (code === 'resource-exhausted') return 'Today’s free database limit is used up. Saving works again after midnight (US Pacific time).'
  if (code === 'not-found') return 'That record no longer exists — someone may have deleted it.'
  return 'Not saved. Check your connection and try again.'
}

/** Serialised, error-reporting writes. One write at a time per document. */
export function useWriter() {
  const { readOnly, setReadOnly, meId } = useStore()
  return useMemo(() => {
    const guard = () => {
      if (readOnly) { toast.error('View only — this Google account can’t make changes.'); return false }
      return true
    }
    const run = <T,>(path: string, fn: () => Promise<T>): Promise<T> => {
      const p = (chains.get(path) || Promise.resolve()).catch(() => {}).then(fn)
      chains.set(path, p)
      return p.catch(e => {
        if ((e as { code?: string })?.code === 'permission-denied') setReadOnly(true)
        toast.error(writeErrorMessage(e))
        throw e
      })
    }
    return {
      meId,
      /** Merge fields into an existing document; stamps updatedAt/updatedBy. */
      update(path: string, patch: DocumentData) {
        if (!guard()) return Promise.reject(new Error('read_only'))
        return run(path, () => updateDoc(doc(db, path), { ...patch, updatedAt: nowIso(), updatedBy: meId }))
      },
      /** Create or replace a whole document. */
      set(path: string, data: DocumentData, opts?: { merge?: boolean }) {
        if (!guard()) return Promise.reject(new Error('read_only'))
        return run(path, () => setDoc(doc(db, path), data, opts ?? {}))
      },
      remove(path: string) {
        if (!guard()) return Promise.reject(new Error('read_only'))
        return run(path, () => deleteDoc(doc(db, path)))
      },
    }
  }, [readOnly, setReadOnly, meId])
}
