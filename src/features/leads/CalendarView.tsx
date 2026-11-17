/* Calendar: the month at a glance (leads worked + follow-ups per day) and the full list for one day —
   which follow-ups were due, which got done, which are still open, and every other lead worked. */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { RatingBadge, StatusPill } from '@/components/common'
import { useStore } from '@/data/store'
import { addDays, dkey, fmtAbs, fmtDay, fmtTime, MONTH_FULL, monthKeyOf, parseNext, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'
import { dayStats, monthRange, type DayData, type DueItem, type FollowState, type WorkItem } from './activity'
import { Btn, cssVar } from './bits'
import { leadName, personName } from './helpers'
import { PROPOSAL_OPEN, rupees } from '@/features/proposals/model'
import { ProgressCard, useMonthActivity, useWho } from './progress'

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/

const STATE: Record<FollowState, { label: string; c: string; order: number }> = {
  pending: { label: 'To call', c: 'callback', order: 0 },
  missed: { label: 'Missed', c: 'lost', order: 1 },
  moved: { label: 'Moved', c: 'no_answer', order: 2 },
  done: { label: 'Done', c: 'won', order: 3 },
}
const stateVars = (c: string) => ({ ...cssVar('--c', `var(--s-${c})`), ...cssVar('--cb', `var(--s-${c}-bg)`) })

function shiftMonth(key: string, n: number) {
  const [y, m] = key.split('-').map(Number)
  return monthKeyOf(new Date(y, m - 1 + n, 1))
}
const longDay = (k: string) => { const d = parseNext(k)!.dt; return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]}, ${d.getDate()} ${MONTH_FULL[d.getMonth()]}` }

/* ---------- month grid ---------- */
function MonthGrid({ month, act, day, onPick, dailyGoal }: {
  month: string; act: Map<string, DayData>; day: string; onPick: (d: string) => void; dailyGoal: number
}) {
  const [first, last] = monthRange(month)
  const lead = (parseNext(first)!.dt.getDay() + 6) % 7
  const n = Number(last.slice(8))
  const tk = todayKey()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  while (cells.length % 7) cells.push(null)
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden>
        {WEEK.map(w => <div key={w} className="text-center text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{w.slice(0, 2)}<span className="max-sm:hidden">{w.slice(2)}</span></div>)}
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={`${MONTH_FULL[Number(month.slice(5)) - 1]} days`}>
        {cells.map((k, i) => {
          if (!k) return <div key={i} />
          const s = dayStats(act.get(k))
          const missed = act.get(k)?.due.some(x => x.state === 'missed')
          const met = dailyGoal > 0 && s.worked >= dailyGoal
          const future = k > tk
          const label = `${fmtAbs(k)}: ${s.worked} lead${s.worked === 1 ? '' : 's'} worked, ${s.due} follow-up${s.due === 1 ? '' : 's'} due${s.due ? `, ${s.done} done` : ''}`
          return (
            <button key={k} type="button" aria-pressed={k === day} aria-label={label} onClick={() => onPick(k)}
              className={cn('relative flex min-h-[64px] flex-col items-start rounded-lg border bg-card px-1.5 pt-1 pb-1.5 text-left transition-colors hover:border-input sm:min-h-[76px] sm:px-2',
                met && 'border-[color-mix(in_srgb,var(--good)_35%,transparent)] bg-[color-mix(in_srgb,var(--good)_10%,var(--card))]',
                k === tk && 'shadow-[inset_0_0_0_1.5px_var(--primary)]',
                'aria-pressed:border-foreground aria-pressed:shadow-[inset_0_0_0_1.5px_var(--foreground)]')}>
              <span className={cn('text-[11.5px] font-semibold text-muted-foreground', k === tk && 'text-primary')}>{Number(k.slice(8))}</span>
              {s.worked > 0 && <span className={cn('font-mono text-[17px] leading-tight font-semibold tabular sm:text-xl', met ? 'text-good' : 'text-foreground')}>{s.worked}</span>}
              {s.due > 0 && (
                <span className={cn('mt-auto font-mono text-[10.5px] leading-none font-semibold whitespace-nowrap sm:text-[11.5px]',
                  missed ? 'text-destructive' : s.done === s.due ? 'text-good' : future ? 'text-muted-foreground' : 'text-warn')}>
                  {s.done && !future ? `${s.done}/${s.due}` : s.due}<span className="max-sm:hidden"> f/u</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 mb-0 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span><b className="font-mono text-foreground">12</b> leads worked</span>
        <span><b className="font-mono text-warn">2/5</b> follow-ups done / due</span>
        {dailyGoal > 0 && <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-[color-mix(in_srgb,var(--good)_25%,var(--card))] align-[-1px]" />{dailyGoal}+ a day (goal pace)</span>}
        <span className="text-destructive">red = a follow-up was missed</span>
      </p>
    </div>
  )
}

/* ---------- day list ---------- */
function Row({ l, time, children, badge, onOpen }: { l: Lead; time: string; children: React.ReactNode; badge: React.ReactNode; onOpen: () => void }) {
  return (
    <li className="border-t first:border-t-0">
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[58px_1fr_auto] items-start gap-x-3 px-3.5 py-2.5 text-left hover:bg-muted sm:grid-cols-[70px_1fr_auto] sm:px-4">
        <span className="pt-px font-mono text-[12.5px] font-medium text-ink-2 tabular">{time}</span>
        <span className="min-w-0">
          <strong className="flex min-w-0 items-center gap-1.5 font-semibold">
            {l.rating && <RatingBadge r={l.rating} />}<span className="truncate">{leadName(l)}</span>
            {l.name && l.company && <span className="truncate font-normal text-muted-foreground max-sm:hidden">· {l.company}</span>}
          </strong>
          <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted-foreground">{children}</span>
        </span>
        <span className="flex flex-col items-end gap-1">{badge}</span>
      </button>
    </li>
  )
}

const StateBadge = ({ s, extra }: { s: FollowState; extra?: string }) => (
  <span style={stateVars(STATE[s].c)} className="status-pill inline-flex items-center gap-1.5 rounded-full py-[5px] pr-2.5 pl-2 text-[11.5px] leading-none font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:content-['']">
    {STATE[s].label}{extra ? ` → ${extra}` : ''}
  </span>
)

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className="rounded-full border bg-card px-2.5 py-1.5 text-[12.5px] leading-none font-semibold text-ink-2 hover:border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-card">
      {children}
    </button>
  )
}

function Stat({ n, label, tone }: { n: number | string; label: string; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5 text-[13px] text-ink-2">
      <b className={cn('font-mono text-xl leading-none font-semibold tabular text-foreground', tone)}>{n}</b>{label}
    </div>
  )
}

function DayPanel({ day, data, onDay, onOpen }: {
  day: string
  data: DayData | undefined
  onDay: (d: string) => void
  onOpen: (path: string, queue: string[]) => void
}) {
  const { people, meId, proposals } = useStore()
  const [show, setShow] = useState<'' | FollowState>('')
  const s = dayStats(data)
  const tk = todayKey()
  const due = useMemo(() => [...(data?.due || [])].sort((a, b) =>
    STATE[a.state].order - STATE[b.state].order || (parseNext(a.planned)?.time || '99').localeCompare(parseNext(b.planned)?.time || '99')), [data])
  const dueSet = new Set(due.map(x => x.lead.path))
  const others = useMemo(() => (data?.worked || []).filter(w => !dueSet.has(w.lead.path)).sort((a, b) => a.at.localeCompare(b.at)), [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const counts = due.reduce<Record<string, number>>((a, x) => ({ ...a, [x.state]: (a[x.state] || 0) + 1 }), {})
  const shown = show ? due.filter(x => x.state === show) : due
  const props = proposals.filter(p => PROPOSAL_OPEN(p) && (p.nextAt || '').slice(0, 10) === day)
  const queue = [...shown.map(x => x.lead.path), ...others.map(w => w.lead.path)]

  const plannedTime = (x: DueItem) => { const n = parseNext(x.planned); return n?.time ? fmtTime(n.dt) : 'Any time' }
  const dueText = (x: DueItem) => {
    if (x.state === 'done') return x.outcome
    const rel = x.setAt ? fmtDay(new Date(x.setAt)) : ''
    const set = x.setAt
      ? `Set ${['Today', 'Yesterday'].includes(rel) ? rel.toLowerCase() : `on ${rel}`}${x.setBy ? ` by ${personName(x.setBy, meId, people)}` : ''}`
      : 'Planned before the app'
    return <><StatusPill s={x.lead.status} /> <span className="ml-1">{set}</span></>
  }
  const workText = (w: WorkItem) => w.outcome + (w.by && w.by !== meId ? ` · ${personName(w.by, meId, people)}` : '')

  return (
    <section aria-labelledby="day-h" className="mt-4 rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 id="day-h" className="m-0 font-display text-[19px] font-[650]">{longDay(day)}</h2>
        {day === tk && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">Today</span>}
        <span className="flex-1" />
        <Btn size="sm" aria-label="Previous day" onClick={() => onDay(dkey(addDays(parseNext(day)!.dt, -1)))}><ChevronLeft aria-hidden /></Btn>
        <label htmlFor="cal-day" className="sr-only">Pick a day</label>
        <input id="cal-day" type="date" value={day} onChange={e => DAY_RX.test(e.target.value) && onDay(e.target.value)} className="field h-8 w-[150px]" />
        <Btn size="sm" aria-label="Next day" onClick={() => onDay(dkey(addDays(parseNext(day)!.dt, 1)))}><ChevronRight aria-hidden /></Btn>
        {day !== tk && <Btn size="sm" onClick={() => onDay(tk)}>Today</Btn>}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2.5 border-b px-4 py-3">
        <Stat n={s.worked} label="leads worked" />
        <Stat n={s.connected} label="spoke" tone={s.connected ? 'text-good' : undefined} />
        <Stat n={s.notPicked} label="not picked" />
        <Stat n={s.due ? `${s.done}/${s.due}` : 0} label="follow-ups done" tone={s.due && s.done === s.due ? 'text-good' : undefined} />
      </div>

      <div className="px-4 pt-3.5 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[11.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">Follow-ups for this day · {due.length}</h3>
          <span className="flex-1" />
          {due.length > 0 && (
            <div role="group" aria-label="Show follow-ups" className="flex flex-wrap gap-1.5">
              <Chip on={!show} onClick={() => setShow('')}>All {due.length}</Chip>
              {(Object.keys(STATE) as FollowState[]).filter(k => counts[k]).map(k => (
                <Chip key={k} on={show === k} onClick={() => setShow(show === k ? '' : k)}>{STATE[k].label} {counts[k]}</Chip>
              ))}
            </div>
          )}
        </div>
      </div>
      {shown.length ? (
        <ul className="m-0 mt-2 list-none border-t p-0" aria-label="Follow-ups">
          {shown.map(x => (
            <Row key={x.lead.path} l={x.lead} time={plannedTime(x)} onOpen={() => onOpen(x.lead.path, queue)}
              badge={<StateBadge s={x.state} extra={x.state === 'moved' || x.state === 'missed' ? (x.movedTo ? fmtDay(parseNext(x.movedTo)!.dt) : x.state === 'moved' ? 'cleared' : '') : ''} />}>
              {dueText(x)}
            </Row>
          ))}
        </ul>
      ) : (
        <p className="mx-4 mt-2 mb-3.5 text-[13.5px] text-muted-foreground">{due.length ? 'None in this group.' : day < tk ? 'No follow-ups were planned for this day.' : 'No follow-ups planned for this day yet.'}</p>
      )}

      {props.length > 0 && (
        <>
          <div className="border-t px-4 pt-3.5 pb-1"><h3 className="m-0 text-[11.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">Proposal follow-ups · {props.length}</h3></div>
          <ul className="m-0 mt-2 list-none border-t p-0">
            {props.map(p => (
              <li key={p.id} className="border-t first:border-t-0">
                <Link to={`/proposals?open=${p.id}`} className="grid grid-cols-[58px_1fr_auto] items-start gap-x-3 px-3.5 py-2.5 hover:bg-muted sm:grid-cols-[70px_1fr_auto] sm:px-4">
                  <span className="font-mono text-[12.5px] text-ink-2">{parseNext(p.nextAt)?.time ? fmtTime(parseNext(p.nextAt)!.dt) : 'Any time'}</span>
                  <span className="min-w-0 truncate font-semibold">{p.client || p.company}</span>
                  <span className="font-mono text-[12.5px] text-ink-2">{rupees(p.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="border-t px-4 pt-3.5 pb-1">
        <h3 className="m-0 text-[11.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">Other leads worked · {others.length}</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">Fresh calls and anything else with an outcome or note logged this day.</p>
      </div>
      {others.length ? (
        <ul className="m-0 mt-2 list-none border-t p-0" aria-label="Other leads worked">
          {others.map(w => (
            <Row key={w.lead.path} l={w.lead} time={fmtTime(new Date(w.at))} onOpen={() => onOpen(w.lead.path, queue)}
              badge={<StatusPill s={w.s || w.lead.status} />}>
              {workText(w)}
            </Row>
          ))}
        </ul>
      ) : <p className="mx-4 mt-2 mb-3.5 text-[13.5px] text-muted-foreground">{day > tk ? 'Nothing yet.' : 'None.'}</p>}
    </section>
  )
}

export function CalendarView({ leads, ready, onOpen }: { leads: Lead[]; ready: boolean; onOpen: (path: string, queue: string[]) => void }) {
  const { goals } = useStore()
  const [sp] = useSearchParams()
  const [day, setDay] = useState(() => { const d = sp.get('d') || ''; return DAY_RX.test(d) ? d : todayKey() })
  const [month, setMonth] = useState(day.slice(0, 7))
  const [who, setWho] = useWho()
  const act = useMonthActivity(leads, month, who)
  const dailyGoal = Math.ceil(goals.monthlyLeads / Number(monthRange(month)[1].slice(8)))
  // The selected day always sits in the grid month, so one activity map serves both.
  const pickDay = (d: string) => { setDay(d); setMonth(d.slice(0, 7)) }
  const goMonth = (n: number) => {
    const m = shiftMonth(month, n)
    setMonth(m)
    setDay(m === todayKey().slice(0, 7) ? todayKey() : `${m}-01`)
  }

  if (!ready && !leads.length) return <div aria-busy="true" className="mt-6 h-64 animate-pulse rounded-xl border bg-card" />

  return (
    <div>
      <ProgressCard act={act} month={month} who={who} onWho={setWho} />
      <section aria-label="Month" className="mt-4 rounded-xl border bg-card px-3 py-3.5 sm:px-4">
        <div className="mb-3 flex items-center gap-2">
          <Btn size="sm" aria-label="Previous month" onClick={() => goMonth(-1)}><ChevronLeft aria-hidden /></Btn>
          <h2 className="m-0 min-w-[150px] text-center font-display text-[18px] font-[650]">{MONTH_FULL[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</h2>
          <Btn size="sm" aria-label="Next month" onClick={() => goMonth(1)}><ChevronRight aria-hidden /></Btn>
          <span className="flex-1" />
          {(month !== todayKey().slice(0, 7) || day !== todayKey()) && <Btn size="sm" onClick={() => pickDay(todayKey())}>Today</Btn>}
        </div>
        <MonthGrid month={month} act={act} day={day} onPick={pickDay} dailyGoal={dailyGoal} />
      </section>
      <DayPanel key={day} day={day} data={act.get(day)} onDay={pickDay} onOpen={onOpen} />
    </div>
  )
}
