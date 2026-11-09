/* Filtering, sorting and the Today sections — ported from the legacy `filtering` and `today` blocks. */
import { addDays, digits, dkey, parseNext } from '@/lib/format'
import type { Lead, LeadStatus, Month } from '@/types'
import { leadName } from './helpers'
import { CLOSED, dueState, newestCmp, nextCmp, PKG, RMAP, SMAP, WARM_STATUSES } from './model'

export type SortKey = 'newest' | 'followup' | 'updated' | 'hottest' | 'package' | 'name'
export type FollowFilter = '' | 'overdue' | 'today' | 'week' | 'none'

export interface Filters {
  q: string
  st: LeadStatus[]
  /** '' | rating key | 'rated' | 'none' */
  rate: string
  /** '' | package key | 'none' */
  pkg: string
  /** '' | timeline key | 'none' */
  tl: string
  /** 'YYYY' */
  year: string
  /** 'MM' */
  mon: string
  fu: FollowFilter
  sort: SortKey
}
export const BLANK_F = (): Filters => ({ q: '', st: [], rate: '', pkg: '', tl: '', year: '', mon: '', fu: '', sort: 'newest' })

export const isFiltered = (f: Filters) => !!(f.q || f.st.length || f.rate || f.pkg || f.tl || f.year || f.mon || f.fu)

export function matches(l: Lead, f: Filters, skipStatus = false): boolean {
  if (!skipStatus && f.st.length && !f.st.includes(l.status || 'new')) return false
  if (f.rate && (f.rate === 'rated' ? !l.rating : (l.rating || 'none') !== f.rate)) return false
  if (f.pkg && (l.package || 'none') !== f.pkg) return false
  if (f.tl && (l.timeline || 'none') !== f.tl) return false
  if (f.year && (l.month || '').slice(0, 4) !== f.year) return false
  if (f.mon && (l.month || '').slice(5, 7) !== f.mon) return false
  if (f.fu) {
    const ds = dueState(l)
    if (f.fu === 'overdue' && ds !== 'overdue') return false
    if (f.fu === 'today' && ds !== 'today') return false
    if (f.fu === 'week') {
      const n = parseNext(l.nextAt)
      if (!ds || ds === 'overdue' || !n || n.date > dkey(addDays(new Date(), 7))) return false
    }
    if (f.fu === 'none' && l.nextAt && !CLOSED.has(l.status)) return false
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase()
    if (q) {
      const qd = digits(q)
      if (qd.length >= 4 && /^[\d\s+()-]+$/.test(q)) { if (!digits(l.phone).includes(qd)) return false }
      else if (!q.split(/\s+/).every(w => l.hay.includes(w))) return false
    }
  }
  return true
}

const rateRank = (l: Lead) => (l.rating ? RMAP[l.rating]?.rank || 0 : 0)
const pkgRank = (l: Lead) => (l.package ? PKG[l.package]?.rank || 0 : 0)
export const SORTS: Record<SortKey, { label: string; fn: (a: Lead, b: Lead) => number }> = {
  newest: { label: 'Newest first', fn: newestCmp },
  followup: { label: 'Follow-up date', fn: nextCmp },
  updated: { label: 'Recently updated', fn: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || newestCmp(a, b) },
  hottest: { label: 'Hottest first', fn: (a, b) => rateRank(b) - rateRank(a) || nextCmp(a, b) },
  package: { label: 'Biggest package', fn: (a, b) => pkgRank(b) - pkgRank(a) || newestCmp(a, b) },
  name: { label: 'Name A–Z', fn: (a, b) => leadName(a).localeCompare(leadName(b)) },
}

export const filterLeads = (leads: Lead[], f: Filters) =>
  leads.filter(l => matches(l, f)).sort((SORTS[f.sort] || SORTS.newest).fn)

/** Counts per status for the chips (every filter except status applies). */
export function statusCounts(leads: Lead[], f: Filters) {
  const base = leads.filter(l => matches(l, f, true))
  const counts: Partial<Record<LeadStatus, number>> = {}
  for (const l of base) { const s = l.status || 'new'; counts[s] = (counts[s] || 0) + 1 }
  return { total: base.length, counts }
}

/** Year and month options with counts, like legacy renderDateFilters. */
export function dateFilterOptions(leads: Lead[], months: Month[], f: Filters) {
  const years = new Map<string, number>(), mons = new Map<string, number>()
  for (const l of leads) {
    const y = (l.month || '').slice(0, 4), m = (l.month || '').slice(5, 7)
    if (!y) continue
    if (!f.mon || m === f.mon) years.set(y, (years.get(y) || 0) + 1)
    if (!f.year || y === f.year) mons.set(m, (mons.get(m) || 0) + 1)
  }
  for (const mo of months) { const y = mo.key.slice(0, 4); if (!years.has(y)) years.set(y, 0) }
  return {
    years: [...years.keys()].sort().reverse().map(y => ({ y, n: years.get(y) || 0 })),
    mons,
  }
}

/* ---------- Today ---------- */
export type SectionId = 'overdue' | 'due' | 'hot' | 'meetings' | 'fresh' | 'retry' | 'nostep'
export interface TodaySection {
  id: SectionId
  title: string
  hint: string
  items: Lead[]
  /** filters for "See all N in All leads" */
  all?: Partial<Filters>
}
export const TODAY_LIMIT = 24

export function todaySections(L: Lead[]): TodaySection[] {
  const wk = dkey(addDays(new Date(), 7))
  return [
    { id: 'overdue', title: 'Overdue', hint: 'Follow-ups you planned for an earlier day.', items: L.filter(l => dueState(l) === 'overdue').sort(nextCmp), all: { fu: 'overdue', sort: 'followup' } },
    { id: 'due', title: 'Due today', hint: 'Call-backs, meetings and retries planned for today.', items: L.filter(l => dueState(l) === 'today').sort(nextCmp), all: { fu: 'today', sort: 'followup' } },
    { id: 'hot', title: 'Hot leads', hint: 'Rated hot — closest to paying. Keep every one of them on a dated next step.', items: L.filter(l => l.rating === 'hot' && !CLOSED.has(l.status)).sort(nextCmp), all: { rate: 'hot', sort: 'followup' } },
    { id: 'meetings', title: 'Meetings this week', hint: 'Get the portfolio and pricing ready.', items: L.filter(l => l.status === 'meeting_set' && dueState(l) === 'future' && (parseNext(l.nextAt)?.date || '') <= wk).sort(nextCmp), all: { st: ['meeting_set'], fu: 'week', sort: 'followup' } },
    { id: 'fresh', title: 'Fresh leads', hint: 'Never called — newest first. The sooner you call, the warmer they are.', items: L.filter(l => (l.status || 'new') === 'new' && !l.nextAt).sort(newestCmp), all: { st: ['new'], fu: 'none' } },
    { id: 'retry', title: 'Try again', hint: 'Didn’t pick up and have no retry date — fewest tries first.', items: L.filter(l => l.status === 'no_answer' && !l.nextAt).sort((a, b) => (a.attempts || 0) - (b.attempts || 0) || newestCmp(a, b)), all: { st: ['no_answer'], fu: 'none' } },
    { id: 'nostep', title: 'Spoke, no next step', hint: 'You’ve spoken to them but nothing is scheduled. Pick a follow-up date so they don’t go cold.', items: L.filter(l => WARM_STATUSES.has(l.status) && !l.nextAt).sort(newestCmp), all: { st: ['talking', 'portfolio', 'meeting_done'], fu: 'none' } },
  ]
}

/* ---------- prefs + URL presets ---------- */
const LS = 'leadbook.v1'
export type LeadsView = 'today' | 'all'

function cleanFilters(raw: unknown): Filters {
  const f = BLANK_F()
  if (!raw || typeof raw !== 'object') return f
  const r = raw as Record<string, unknown>
  for (const k of ['q', 'rate', 'pkg', 'tl', 'year', 'mon'] as const) if (typeof r[k] === 'string') f[k] = r[k] as string
  if (typeof r.fu === 'string' && ['', 'overdue', 'today', 'week', 'none'].includes(r.fu)) f.fu = r.fu as FollowFilter
  if (typeof r.sort === 'string' && r.sort in SORTS) f.sort = r.sort as SortKey
  if (Array.isArray(r.st)) f.st = r.st.filter((s): s is LeadStatus => typeof s === 'string' && s in SMAP)
  return f
}
export function loadPrefs(): { view: LeadsView | null; f: Filters } {
  try {
    const p = JSON.parse(localStorage.getItem(LS) || '{}') as { view?: string; f?: unknown }
    return { view: p.view === 'all' || p.view === 'today' ? p.view : null, f: cleanFilters(p.f) }
  } catch {
    return { view: null, f: BLANK_F() }
  }
}
export function savePrefs(view: LeadsView, f: Filters) {
  try { localStorage.setItem(LS, JSON.stringify({ view, f })) } catch { /* storage blocked */ }
}

/** Query keys that preset the All-leads filters, e.g. /leads/all?rate=hot&st=new,no_answer&fu=none */
export const PRESET_KEYS = ['q', 'st', 'rate', 'pkg', 'tl', 'year', 'mon', 'fu', 'sort'] as const

export function presetFromQuery(sp: URLSearchParams): Filters | null {
  if (!PRESET_KEYS.some(k => sp.has(k))) return null
  const raw: Record<string, unknown> = {}
  for (const k of PRESET_KEYS) {
    if (!sp.has(k)) continue
    raw[k] = k === 'st' ? sp.getAll('st').flatMap(v => v.split(',')).map(s => s.trim()).filter(Boolean) : sp.get(k) || ''
  }
  return cleanFilters(raw)
}
export function presetToQuery(p: Partial<Filters>) {
  const sp = new URLSearchParams()
  for (const k of PRESET_KEYS) {
    const v = p[k]
    if (Array.isArray(v)) { if (v.length) sp.set(k, v.join(',')) }
    else if (v) sp.set(k, v)
  }
  return sp.toString()
}
