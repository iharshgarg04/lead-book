/* All leads: search + filters, status chips, paged list (legacy `all leads` block). */
import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import { Select } from '@/components/common'
import { addDays, dkey, MONTH_FULL, pad } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Lead, Month } from '@/types'
import { Btn } from './bits'
import { DATE_KINDS, dateFilterOptions, isFiltered, SORTS, statusCounts, type DateKind, type FollowFilter, type Filters, type SortKey } from './filters'
import { LeadRow, LeadRowHead } from './LeadRow'
import { PKG, RATING, STATUS, TL } from './model'
import type { LeadFiltersApi } from './useLeadFilters'

const FOLLOW_OPTS: [FollowFilter, string][] = [['', 'Any follow-up'], ['overdue', 'Overdue'], ['today', 'Due today'], ['tomorrow', 'Due tomorrow'], ['week', 'Next 7 days'], ['none', 'No follow-up set']]

/** Search input with a short debounce; follows outside changes (e.g. Clear filters). */
function SearchBox({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef: RefObject<HTMLInputElement | null> }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  useEffect(() => {
    if (text === value) return
    const t = setTimeout(() => onChange(text), 120)
    return () => clearTimeout(t)
  }, [text, value, onChange])
  return (
    <div className="relative min-w-0 flex-[1_1_280px]">
      <Search className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <label htmlFor="f-q" className="sr-only">Search leads</label>
      <input id="f-q" ref={inputRef} type="search" autoComplete="off" value={text} onChange={e => setText(e.target.value)}
        placeholder="Search name, brand, phone, notes…  ( / )" aria-keyshortcuts="/" className="field pl-[34px]" />
    </div>
  )
}

/** Quick ranges for the date filter. */
function quickRanges(): { k: string; label: string; d1: string; d2: string }[] {
  const t = new Date(), day = (n: number) => dkey(addDays(t, n))
  const mon = addDays(t, -((t.getDay() + 6) % 7))
  return [
    { k: 'y', label: 'Yesterday', d1: day(-1), d2: day(-1) },
    { k: 't', label: 'Today', d1: day(0), d2: day(0) },
    { k: 'tm', label: 'Tomorrow', d1: day(1), d2: day(1) },
    { k: 'w', label: 'This week', d1: dkey(mon), d2: dkey(addDays(mon, 6)) },
    { k: 'l7', label: 'Last 7 days', d1: day(-6), d2: day(0) },
    { k: 'm', label: 'This month', d1: dkey(new Date(t.getFullYear(), t.getMonth(), 1)), d2: dkey(new Date(t.getFullYear(), t.getMonth() + 1, 0)) },
  ]
}

/** Date range filter: pick what the dates mean, a from/to range, or a quick range. */
function DateFilter({ f, update }: { f: Filters; update: (p: Partial<Filters>) => void }) {
  const ranges = quickRanges()
  const active = !!(f.d1 || f.d2)
  const setRange = (d1: string, d2: string) => update({ d1, d2, ...(f.dk === 'next' && f.sort === 'newest' ? { sort: 'followup' as SortKey } : {}) })
  return (
    <div role="group" aria-label="Date filter" className={cn('mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5', active && 'border-foreground/40')}>
      <Select aria-label="Filter dates by" value={f.dk} onChange={e => update({ dk: e.target.value as DateKind })} className="h-8 py-0 text-[13px]">
        {Object.entries(DATE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">From
        <input type="date" value={f.d1} max={f.d2 || undefined} onChange={e => setRange(e.target.value, f.d2 && e.target.value > f.d2 ? e.target.value : f.d2)} className="field h-8 w-[146px]" />
      </label>
      <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">To
        <input type="date" value={f.d2} min={f.d1 || undefined} onChange={e => setRange(f.d1, e.target.value)} className="field h-8 w-[146px]" />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {ranges.map(r => (
          <button key={r.k} type="button" aria-pressed={f.d1 === r.d1 && f.d2 === r.d2} onClick={() => setRange(r.d1, r.d2)}
            className="rounded-full border border-dashed border-input px-2.5 py-1 text-[12.5px] font-medium text-ink-2 hover:border-solid hover:border-ink-2 aria-pressed:border-solid aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-card">
            {r.label}
          </button>
        ))}
      </div>
      {active && <Btn size="sm" variant="link" onClick={() => update({ d1: '', d2: '' })}>Clear dates</Btn>}
    </div>
  )
}

const chipBase = 'group inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 text-[12.5px] leading-none font-semibold text-ink-2 hover:border-input'
const allChip = cn(chipBase, 'aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-card')
const statusChip = cn(chipBase,
  "before:size-[7px] before:rounded-full before:bg-[var(--c)] before:content-['']",
  'aria-pressed:border-[var(--c)] aria-pressed:bg-[var(--cb)] aria-pressed:text-[var(--c)]')
const countCls = 'font-mono text-[11.5px] font-semibold text-muted-foreground group-aria-pressed:text-current'

export function AllLeadsView({ leads, months, ready, filters, onOpen, searchRef }: {
  leads: Lead[]
  months: Month[]
  ready: boolean
  filters: LeadFiltersApi
  onOpen: (path: string) => void
  searchRef: RefObject<HTMLInputElement | null>
}) {
  const { f, update, clear, toggleStatus, list, shown, showMore } = filters
  const dates = useMemo(() => dateFilterOptions(leads, months, f), [leads, months, f])
  const chips = useMemo(() => statusCounts(leads, f), [leads, f])
  const active = isFiltered(f)
  const setQ = useCallback((q: string) => update({ q }), [update])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pt-[18px] pb-2.5">
        <SearchBox value={f.q} onChange={setQ} inputRef={searchRef} />
        <Select aria-label="Lead rating" value={f.rate} onChange={e => update({ rate: e.target.value })}>
          <option value="">Any rating</option>
          {RATING.map(r => <option key={r.k} value={r.k}>{r.label} leads</option>)}
          <option value="rated">Any rated lead</option>
          <option value="none">Not rated yet</option>
        </Select>
        <Select aria-label="Package" value={f.pkg} onChange={e => update({ pkg: e.target.value })}>
          <option value="">Any package</option>
          {Object.entries(PKG).map(([k, p]) => <option key={k} value={k}>{p.label} · {p.ads} ads</option>)}
          <option value="none">Not given</option>
        </Select>
        <Select aria-label="Go-live" value={f.tl} onChange={e => update({ tl: e.target.value })}>
          <option value="">Any go-live</option>
          {Object.entries(TL).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          <option value="none">Not given</option>
        </Select>
        <Select aria-label="Month" value={f.mon} onChange={e => update({ mon: e.target.value })}>
          <option value="">Any month</option>
          {MONTH_FULL.map((name, i) => {
            const k = pad(i + 1), n = dates.mons.get(k) || 0
            return n || k === f.mon ? <option key={k} value={k}>{name} · {n}</option> : null
          })}
        </Select>
        <Select aria-label="Year" value={f.year} onChange={e => update({ year: e.target.value })}>
          <option value="">Any year</option>
          {dates.years.map(({ y, n }) => <option key={y} value={y}>{y} · {n}</option>)}
          {f.year && !dates.years.some(d => d.y === f.year) && <option value={f.year}>{f.year} · 0</option>}
        </Select>
        <Select aria-label="Follow-up" value={f.fu} onChange={e => update({ fu: e.target.value as FollowFilter })}>
          {FOLLOW_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <Select aria-label="Sort" value={f.sort} onChange={e => update({ sort: e.target.value as SortKey })}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
        </Select>
      </div>

      <DateFilter f={f} update={update} />

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5 pb-3">
        <button type="button" aria-pressed={!f.st.length} onClick={() => update({ st: [] })}
          className={allChip}>
          All <span className={countCls}>{chips.total}</span>
        </button>
        {STATUS.map(s => (
          <button key={s.k} type="button" data-s={s.k} aria-pressed={f.st.includes(s.k)} onClick={() => toggleStatus(s.k)} className={statusChip}>
            {s.label} <span className={countCls}>{chips.counts[s.k] || 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 text-[13px] text-muted-foreground">
        <span aria-live="polite">{list.length} of {leads.length} leads</span>
        {active && <Btn size="sm" variant="link" onClick={clear}>Clear filters</Btn>}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {!ready && !leads.length ? (
          <div className="p-[22px] text-center text-muted-foreground">Loading leads…</div>
        ) : !list.length ? (
          <div className="p-[22px] text-center text-muted-foreground">
            <strong className="mb-1 block font-display text-base font-semibold text-foreground">No leads match</strong>
            {active ? 'Try removing a filter.' : 'Import or add a lead to get started.'}
          </div>
        ) : (
          <>
            <LeadRowHead />
            <div role="list" aria-label="Leads">
              {list.slice(0, shown).map(l => <LeadRow key={l.path} l={l} onOpen={onOpen} />)}
            </div>
            {list.length > shown && (
              <div className="border-t p-3.5 text-center">
                <Btn size="sm" onClick={showMore}>Show {Math.min(150, list.length - shown)} more</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
