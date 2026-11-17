/* Monthly goal: how many leads have been worked this month and today, and the pace needed to hit the target. */
import { Check, Pencil } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Select } from '@/components/common'
import { useStore, useWriter } from '@/data/store'
import { MONTH_FULL, monthKeyOf, nowIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'
import { buildActivity, monthProgress, monthRange, type DayData } from './activity'
import { Btn } from './bits'

const WHO_KEY = 'leadbook.who'

/** Whose work the counts show ('' = everyone); remembered per browser. */
export function useWho() {
  const [who, setWhoState] = useState(() => { try { return localStorage.getItem(WHO_KEY) || '' } catch { return '' } })
  const setWho = (v: string) => { setWhoState(v); try { localStorage.setItem(WHO_KEY, v) } catch { /* storage blocked */ } }
  return [who, setWho] as const
}

export function useMonthActivity(leads: Lead[], month: string, who: string) {
  return useMemo(() => { const [a, b] = monthRange(month); return buildActivity(leads, a, b, who) }, [leads, month, who])
}

/** "Everyone / <person>" picker; only people who appear in the data are listed. */
export function WhoSelect({ who, onChange, act, className }: { who: string; onChange: (v: string) => void; act: Map<string, DayData>; className?: string }) {
  const { people, meId } = useStore()
  const ids = useMemo(() => {
    const s = new Set(Object.keys(people))
    if (meId) s.add(meId)
    for (const d of act.values()) for (const w of d.worked) if (w.by) s.add(w.by)
    if (who) s.add(who)
    return [...s]
  }, [people, meId, act, who])
  const label = (id: string) => (id === meId ? `Me (${people[id]?.name?.split(' ')[0] || 'you'})` : people[id]?.name || people[id]?.email || 'Someone')
  if (ids.length < 2 && !who) return null
  return (
    <Select aria-label="Whose calls" value={who} onChange={e => onChange(e.target.value)} className={className}>
      <option value="">Everyone</option>
      {ids.map(id => <option key={id} value={id}>{label(id)}</option>)}
    </Select>
  )
}

function GoalEditor({ value, onDone }: { value: number; onDone: () => void }) {
  const w = useWriter()
  const [v, setV] = useState(String(value))
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const n = parseInt(v, 10)
    if (!(n > 0)) { toast('Enter a number above 0.'); return }
    try { await w.set('settings/goals', { monthlyLeads: n, updatedAt: nowIso(), updatedBy: w.meId }, { merge: true }); toast(`Monthly goal set to ${n} leads`); onDone() } catch { /* toasted */ }
  }
  return (
    <form onSubmit={save} className="flex items-center gap-1.5">
      <label htmlFor="goal-n" className="text-[12.5px] text-muted-foreground">Leads a month</label>
      <input id="goal-n" type="number" min={1} inputMode="numeric" autoFocus value={v} onChange={e => setV(e.target.value)} className="field h-8 w-[84px] font-mono" />
      <Btn type="submit" size="sm" variant="primary" aria-label="Save goal"><Check aria-hidden /></Btn>
      <Btn size="sm" variant="link" onClick={onDone}>Cancel</Btn>
    </form>
  )
}

function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-muted', className)} role="presentation">
      <div className={cn('h-full rounded-full transition-[width]', pct >= 100 ? 'bg-good' : 'bg-primary')} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

/** Full card (Calendar tab) or a one-line strip linking to the Calendar (Today tab). */
export function ProgressCard({ act, month, who, onWho, compact = false }: {
  act: Map<string, DayData>
  month: string
  who: string
  onWho?: (v: string) => void
  compact?: boolean
}) {
  const { goals, readOnly } = useStore()
  const [editing, setEditing] = useState(false)
  const p = monthProgress(act, month, goals.monthlyLeads)
  const pct = p.target ? Math.round((p.done / p.target) * 100) : 0
  const monthName = MONTH_FULL[Number(month.slice(5, 7)) - 1]
  const current = month === monthKeyOf(new Date())
  const onPace = p.perDay === 0 || p.today >= p.perDay
  const left = Math.max(0, p.target - p.done)

  if (compact) {
    return (
      <Link to="/leads/calendar" aria-label={`Progress: ${p.today} leads worked today, ${p.done} of ${p.target} this month. Open the calendar.`}
        className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card px-4 py-3 no-underline transition-colors hover:border-input">
        <span className="flex items-baseline gap-1.5 text-[13.5px] text-ink-2">
          <b className={cn('font-mono text-2xl leading-none font-semibold tabular', onPace ? 'text-good' : 'text-foreground')}>{p.today}</b>
          {p.perDay ? <>of {p.perDay} worked today</> : <>worked today</>}
        </span>
        <span className="flex min-w-[180px] flex-1 items-center gap-2.5">
          <Bar pct={pct} className="flex-1" />
          <span className="font-mono text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground tabular">{p.done}/{p.target} in {monthName.slice(0, 3)}</span>
        </span>
        <span className="text-[12.5px] font-semibold text-muted-foreground">Calendar →</span>
      </Link>
    )
  }

  return (
    <section aria-label="Monthly goal" className="mt-5 rounded-xl border bg-card px-[18px] py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-[11.5px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">{monthName} goal</h2>
        <span className="flex-1" />
        {onWho && <WhoSelect who={who} onChange={onWho} act={act} className="h-8 py-0 text-[13px]" />}
        {editing ? <GoalEditor value={p.target} onDone={() => setEditing(false)} /> : (
          <Btn size="sm" disabled={readOnly} onClick={() => setEditing(true)}><Pencil aria-hidden />Goal: {p.target}</Btn>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5">
        <span className="font-display text-[26px] leading-tight font-bold"><span className="font-mono tabular">{p.done}</span> of {p.target} leads worked</span>
        <span className="font-mono text-sm font-semibold text-muted-foreground tabular">{pct}%</span>
      </div>
      <Bar pct={pct} className="mt-2.5" />
      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
        {current && (
          <span>
            Today <b className={cn('font-mono tabular', onPace ? 'text-good' : 'text-foreground')}>{p.today}</b>
            {p.perDay > 0 && <> of <b className="font-mono tabular">{p.perDay}</b> needed</>}
          </span>
        )}
        {current && p.daysLeft > 0 && <span><b className="font-mono tabular">{p.daysLeft}</b> day{p.daysLeft === 1 ? '' : 's'} left</span>}
        <span>{left ? <><b className="font-mono tabular">{left}</b> to go</> : <b className="text-good">Goal reached</b>}</span>
      </div>
      <p className="mt-1.5 mb-0 text-[12px] text-muted-foreground">A lead counts once it has a call outcome or a note in the month — calling the same lead again doesn’t add to the count.</p>
    </section>
  )
}
