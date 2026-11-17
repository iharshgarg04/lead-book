/* Day-by-day activity rebuilt from each lead's history: which follow-ups were due on a day, what
   happened to them, and which leads were worked (an outcome or a note logged) — plus the monthly goal. */
import { addDays, dkey, monthKeyOf, todayKey } from '@/lib/format'
import type { Lead, LeadNote, LeadStatus } from '@/types'
import { CLOSED, entryText } from './model'

/** Outcomes that mean the client picked up. */
const CONNECTED = new Set<LeadStatus>(['callback', 'talking', 'portfolio', 'meeting_set', 'meeting_done', 'won', 'lost'])

/** Local 'YYYY-MM-DD' of an ISO time ('' when missing). */
export const dayOf = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(+d) ? '' : dkey(d)
}

/** A history entry that counts as working the lead: a call outcome or a note. */
export const isWork = (e: LeadNote) => !!e.at && (e.kind === 'note' || (e.kind === 'status' && e.s !== 'new'))

/** done = called/noted that day · pending = still planned · missed = the day passed without a call · moved = rescheduled on the day */
export type FollowState = 'done' | 'pending' | 'missed' | 'moved'

export interface DueItem {
  lead: Lead
  /** the planned value, e.g. '2026-11-17T11:00' */
  planned: string
  /** when it was planned (ISO); null when it came from an import */
  setAt: string | null
  setBy: string | null
  state: FollowState
  /** where it went when rescheduled or handled later */
  movedTo: string | null
  /** last thing logged on the day (done) */
  outcome: string
}

export interface WorkItem {
  lead: Lead
  /** last outcome / note logged that day */
  outcome: string
  /** status of the last outcome that day, if any */
  s?: LeadStatus
  connected: boolean
  /** outcomes logged that day */
  calls: number
  by: string | null
  /** time of the last entry that day (ISO) */
  at: string
}

export interface DayData {
  due: DueItem[]
  worked: WorkItem[]
}

interface Segment { value: string; setAt: string | null; setBy: string | null; endAt: string | null; next: string | null }

/** Every follow-up a lead has had, in order, with when it stopped being the plan. */
function segments(l: Lead): Segment[] {
  const out: Segment[] = []
  let open: Segment | null = null
  const change = (value: string | null, at: string | null, by: string | null) => {
    if ((open?.value ?? null) === value) return
    if (open) { open.endAt = at; open.next = value }
    open = value ? { value, setAt: at, setBy: by, endAt: null, next: null } : null
    if (open) out.push(open)
  }
  for (const e of l.notes) {
    if (!e.at) continue
    if (e.kind === 'follow') change(e.next || null, e.at, e.by)
    else if (e.kind === 'status') {
      if (e.next) change(e.next, e.at, e.by)
      else if (e.s && CLOSED.has(e.s as LeadStatus)) change(null, e.at, e.by)
    }
  }
  // Imported follow-ups (or edits outside the app) have no history entry.
  const current = CLOSED.has(l.status) ? null : l.nextAt || null
  const last = open as Segment | null
  if ((last?.value ?? null) !== current) {
    if (last) { last.endAt = l.updatedAt || new Date().toISOString(); last.next = current }
    if (current) out.push({ value: current, setAt: null, setBy: null, endAt: null, next: null })
  }
  return out
}

/** Follow-ups due and leads worked for each day from `from` to `to` (inclusive 'YYYY-MM-DD').
 *  `who` limits the worked counts to one person's uid. */
export function buildActivity(leads: Lead[], from: string, to: string, who = ''): Map<string, DayData> {
  const days = new Map<string, DayData>()
  const get = (d: string) => { let x = days.get(d); if (!x) days.set(d, (x = { due: [], worked: [] })); return x }
  const today = todayKey()
  const inRange = (d: string) => d >= from && d <= to

  for (const l of leads) {
    // Worked: outcomes and notes, newest of the day wins the "outcome" text.
    const workDays = new Map<string, WorkItem>()
    const anyWork = new Map<string, { at: string; t: string }[]>()
    for (const e of l.notes) {
      if (!isWork(e)) continue
      const d = dayOf(e.at)
      anyWork.set(d, [...(anyWork.get(d) || []), { at: e.at as string, t: entryText(e) }])
      if (!inRange(d) || (who && e.by !== who)) continue
      const s = e.kind === 'status' ? (e.s as LeadStatus) : undefined
      const w = workDays.get(d) || { lead: l, outcome: '', connected: false, calls: 0, by: e.by, at: e.at as string }
      w.outcome = entryText(e)
      w.by = e.by
      w.at = e.at as string
      if (s) { w.s = s; w.calls++; if (CONNECTED.has(s)) w.connected = true }
      workDays.set(d, w)
    }
    for (const [d, w] of workDays) get(d).worked.push(w)

    // Due: a follow-up planned for day D that was still the plan when D began.
    const seen = new Map<string, DueItem>()
    for (const sg of segments(l)) {
      const d = sg.value.slice(0, 10)
      if (!inRange(d)) continue
      const end = dayOf(sg.endAt)
      if (sg.endAt && end < d) continue
      // Only work logged after the follow-up was planned handles it (a 2 pm call-back set at 11 am is still open).
      const handled = (anyWork.get(d) || []).filter(w => !sg.setAt || w.at > sg.setAt)
      let state: FollowState
      if (handled.length) state = 'done'
      else if (!sg.endAt) state = d < today ? 'missed' : 'pending'
      else state = end === d ? 'moved' : 'missed'
      seen.set(d, { lead: l, planned: sg.value, setAt: sg.setAt, setBy: sg.setBy, state, movedTo: sg.endAt ? sg.next : null, outcome: handled.at(-1)?.t || '' })
    }
    for (const [d, item] of seen) get(d).due.push(item)
  }
  return days
}

/** First and last day of a 'YYYY-MM' month. */
export function monthRange(key: string): [string, string] {
  const [y, m] = key.split('-').map(Number)
  return [`${key}-01`, dkey(new Date(y, m, 0))]
}

export interface DayStats { worked: number; connected: number; notPicked: number; calls: number; due: number; done: number; open: number }
export function dayStats(d: DayData | undefined): DayStats {
  const worked = d?.worked || [], due = d?.due || []
  return {
    worked: worked.length,
    connected: worked.filter(w => w.connected).length,
    notPicked: worked.filter(w => !w.connected && w.s === 'no_answer').length,
    calls: worked.reduce((a, w) => a + w.calls, 0),
    due: due.length,
    done: due.filter(x => x.state === 'done').length,
    open: due.filter(x => x.state === 'pending').length,
  }
}

export interface MonthProgress {
  /** distinct leads worked this month */
  done: number
  target: number
  /** distinct leads worked today */
  today: number
  /** leads a day needed from today to reach the target (0 once reached or after the month) */
  perDay: number
  /** days left in the month, today included */
  daysLeft: number
  /** month key */
  month: string
}

/** Progress towards the monthly goal. A lead counts once a month however often it is called. */
export function monthProgress(act: Map<string, DayData>, month: string, target: number): MonthProgress {
  const tk = todayKey()
  const all = new Set<string>(), before = new Set<string>()
  for (const [d, x] of act) {
    if (d.slice(0, 7) !== month) continue
    for (const w of x.worked) { all.add(w.lead.path); if (d < tk) before.add(w.lead.path) }
  }
  const [, last] = monthRange(month)
  const isCurrent = month === monthKeyOf(new Date())
  let daysLeft = 0
  if (isCurrent) for (let d = new Date(); dkey(d) <= last; d = addDays(d, 1)) daysLeft++
  else if (month > monthKeyOf(new Date())) daysLeft = Number(last.slice(8))
  const left = Math.max(0, target - before.size)
  return {
    done: all.size, target, month, daysLeft,
    today: act.get(tk)?.worked.length || 0,
    perDay: daysLeft ? Math.ceil(left / daysLeft) : 0,
  }
}
