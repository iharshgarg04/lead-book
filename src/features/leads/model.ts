/* Lead domain model shared by Leads, Overview and Invoices. */
import { addDays, dkey, digits, fmtAbs, parseNext, todayKey } from '@/lib/format'
import type { Lead, LeadDoc, LeadNote, LeadRating, LeadStatus, PackageKey, TimelineKey } from '@/types'

export interface StatusDef { k: LeadStatus; label: string; btn?: string; tip?: string }
export const STATUS: StatusDef[] = [
  { k: 'new', label: 'New' },
  { k: 'no_answer', label: 'Not picked', btn: 'Not picked', tip: 'np' },
  { k: 'callback', label: 'Call back', btn: 'Call back later' },
  { k: 'talking', label: 'Spoke', btn: 'Spoke' },
  { k: 'portfolio', label: 'Portfolio sent', btn: 'Sent portfolio' },
  { k: 'meeting_set', label: 'Meeting set', btn: 'Meeting set' },
  { k: 'meeting_done', label: 'Meeting done', btn: 'Meeting done' },
  { k: 'won', label: 'Won', btn: 'Won' },
  { k: 'lost', label: 'Not interested', btn: 'Not interested' },
  { k: 'junk', label: 'Junk', btn: 'Junk / wrong no.' },
]
export const SMAP = Object.fromEntries(STATUS.map(s => [s.k, s])) as Record<LeadStatus, StatusDef>
export const CLOSED = new Set<LeadStatus>(['won', 'lost', 'junk'])
export const WARM_STATUSES = new Set<LeadStatus>(['talking', 'portfolio', 'meeting_done'])
/** Outcome buttons grouped as in the lead panel */
export const OUTCOME_GROUPS: { label: string; keys: LeadStatus[] }[] = [
  { label: 'Call', keys: ['no_answer', 'callback', 'talking'] },
  { label: 'Progress', keys: ['portfolio', 'meeting_set', 'meeting_done', 'won'] },
  { label: 'Close', keys: ['lost', 'junk'] },
]

export interface RatingDef { k: LeadRating; label: string; hint: string; key: string; rank: number }
export const RATING: RatingDef[] = [
  { k: 'hot', label: 'Hot', hint: 'Ready to buy soon', key: 'h', rank: 4 },
  { k: 'warm', label: 'Warm', hint: 'Interested, needs nurturing', key: 'w', rank: 3 },
  { k: 'cold', label: 'Cold', hint: 'Low interest or far off', key: 'c', rank: 2 },
  { k: 'unqualified', label: 'Unqualified', hint: 'Not a fit — budget, creator, student', key: 'u', rank: 1 },
]
export const RMAP = Object.fromEntries(RATING.map(r => [r.k, r])) as Record<LeadRating, RatingDef>

export const PKG: Record<PackageKey, { label: string; ads: string; rank: number }> = {
  launch: { label: 'Launch', ads: '3–5', rank: 1 },
  advance: { label: 'Advance', ads: '5–10', rank: 2 },
  growth: { label: 'Growth', ads: '10–20', rank: 3 },
  scaling: { label: 'Scaling', ads: '20+', rank: 4 },
}
export const TL: Record<TimelineKey, { label: string; short: string; rank: number }> = {
  now: { label: 'Within 7 days', short: '7 days', rank: 1 },
  '2-3w': { label: 'In 2–3 weeks', short: '2–3 wks', rank: 2 },
  '1m': { label: 'In 1 month', short: '1 month', rank: 3 },
  flexible: { label: 'Flexible / planning', short: 'Flexible', rank: 4 },
}

export const displayName = (l: Partial<Lead> | null | undefined) =>
  (l && (l.name || l.company || l.phone || l.email)) || 'Unnamed lead'

/** Human text for one history entry. */
export function entryText(e: LeadNote | undefined): string {
  if (!e) return ''
  if (e.kind === 'follow') return e.next ? `Follow-up set for ${fmtAbs(e.next)}` : 'Follow-up cleared'
  if (e.kind === 'rating') return e.r ? `Rated ${RMAP[e.r]?.label || e.r}` : 'Rating cleared'
  if (e.kind === 'status') return e.note ? `${e.t} — ${e.note}` : (e.t || '')
  return e.t || ''
}
/** Latest meaningful note/outcome (skips follow-up and rating entries). */
export function lastText(l: Pick<Lead, 'notes'>): string {
  const n = l.notes || []
  for (let i = n.length - 1; i >= 0; i--) {
    if (n[i].kind === 'follow' || n[i].kind === 'rating') continue
    const t = entryText(n[i]); if (t) return t
  }
  return ''
}

export type DueState = 'overdue' | 'today' | 'future' | null
export function dueState(l: Pick<Lead, 'nextAt' | 'status'>): DueState {
  if (!l.nextAt || CLOSED.has(l.status)) return null
  const n = parseNext(l.nextAt); if (!n) return null
  const t = todayKey()
  return n.date < t ? 'overdue' : n.date === t ? 'today' : 'future'
}
export const isWithinDays = (l: Pick<Lead, 'nextAt'>, days: number) => {
  const n = parseNext(l.nextAt); return !!n && n.date <= dkey(addDays(new Date(), days))
}

/** Sort helpers */
export const newestCmp = (a: Lead, b: Lead) => (b.month || '').localeCompare(a.month || '') || (b.seq || 0) - (a.seq || 0)
export const nextCmp = (a: Lead, b: Lead) => {
  const pa = parseNext(a.nextAt), pb = parseNext(b.nextAt)
  if (!pa && !pb) return newestCmp(a, b); if (!pa) return 1; if (!pb) return -1
  if (pa.date !== pb.date) return pa.date < pb.date ? -1 : 1
  if (!!pa.time !== !!pb.time) return pa.time ? -1 : 1
  return (pa.time || '').localeCompare(pb.time || '') || newestCmp(a, b)
}

/** Turn a Firestore document into a Lead with path + search text. */
export function hydrateLead(month: string, id: string, data: Partial<LeadDoc>): Lead {
  const notes = Array.isArray(data.notes) ? data.notes : []
  const l = {
    name: '', company: '', email: '', phone: '', package: '', timeline: '', status: 'new', rating: null, nextAt: null,
    attempts: 0, enquiries: 1, seq: 0, createdAt: null, updatedAt: null, updatedBy: null, lastCallAt: null,
    ...data, notes, id, month, path: `months/${month}/leads/${id}`, hay: '',
  } as Lead
  if (!l.status) l.status = 'new'
  l.hay = [l.name, l.company, l.email, digits(l.phone), l.rating ? RMAP[l.rating]?.label : '', ...notes.map(entryText)]
    .join(' ').toLowerCase()
  return l
}
