/* Today: pulse strip + call sections (legacy `today` block). */
import { ChevronRight } from 'lucide-react'
import { useMemo, type MouseEvent } from 'react'
import { EmptyState } from '@/components/common'
import { dkey, todayKey } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'
import { Btn } from './bits'
import { TODAY_LIMIT, type SectionId, type TodaySection } from './filters'
import { LeadCard } from './LeadCard'
import { NextCallStrip } from './NextCallStrip'

const PULSE: { id: SectionId; label: string; tone?: 'danger' | 'hot' }[] = [
  { id: 'overdue', label: 'overdue', tone: 'danger' },
  { id: 'due', label: 'due today' },
  { id: 'hot', label: 'hot leads', tone: 'hot' },
  { id: 'fresh', label: 'never called' },
  { id: 'retry', label: 'to retry' },
]

function jump(e: MouseEvent, id: string) {
  e.preventDefault()
  const s = document.getElementById(`sec-${id}`)
  if (s) s.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

function PulseLink({ id, n, label, tone }: { id: string; n: number; label: string; tone?: 'danger' | 'hot' }) {
  return (
    <a href={`#sec-${id}`} onClick={e => jump(e, id)} className="group flex items-baseline gap-[7px] text-[13.5px] text-ink-2 no-underline">
      <b className={cn('font-mono text-2xl leading-none font-semibold tracking-[-0.02em] text-foreground tabular',
        n > 0 && tone === 'danger' && 'text-destructive', n > 0 && tone === 'hot' && 'text-[var(--r-hot)]')}>{n}</b>
      <span className="group-hover:underline">{label}</span>
    </a>
  )
}

export function TodayView({ leads, sections, ready, readOnly, onOpen, onNotPicked, onSeeAll, onImport, onAdd }: {
  leads: Lead[]
  sections: TodaySection[]
  ready: boolean
  readOnly: boolean
  onOpen: (path: string) => void
  onNotPicked: (path: string) => void
  onSeeAll: (s: TodaySection) => void
  onImport: () => void
  onAdd: () => void
}) {
  const logged = useMemo(() => {
    const tk = todayKey()
    let n = 0
    for (const l of leads) for (const e of l.notes) if (e.at && e.kind === 'status' && dkey(new Date(e.at)) === tk) n++
    return n
  }, [leads])

  if (!ready && !leads.length) {
    return (
      <div aria-busy="true" aria-label="Loading leads" className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(292px,1fr))] gap-2.5">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[132px] animate-pulse rounded-xl border bg-card" />)}
      </div>
    )
  }
  if (!leads.length) {
    return (
      <EmptyState title="No leads yet" className="mt-6">
        Import rows from the Google Sheet or a Meta leads export, restore a backup (.json), or add one by hand.
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Btn onClick={onImport} disabled={readOnly}>Import leads</Btn>
          <Btn variant="primary" onClick={onAdd} disabled={readOnly}>Add lead</Btn>
        </div>
      </EmptyState>
    )
  }

  const count = (id: SectionId) => sections.find(s => s.id === id)?.items.length || 0
  const queue = [...new Set(sections.flatMap(s => s.items))]
  const first = queue[0]

  return (
    <div>
      {first && <NextCallStrip l={first} total={queue.length} onOpen={onOpen} />}
      <div className="flex flex-wrap items-center gap-x-[26px] gap-y-2.5 pt-5 pb-1">
        {PULSE.map(p => <PulseLink key={p.id} id={p.id} n={count(p.id)} label={p.label} tone={p.tone} />)}
        <span title="Calls and updates logged today"><PulseLink id="due" n={logged} label="logged today" /></span>
      </div>
      {sections.map(s => {
        if (!s.items.length && s.id !== 'due') return null
        return (
          <section key={s.id} id={`sec-${s.id}`} aria-labelledby={`sec-${s.id}-h`} className="mt-7 scroll-mt-[60px]">
            <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
              <h2 id={`sec-${s.id}-h`} className="m-0 font-display text-[19px] leading-[1.2] font-[650] tracking-[-0.015em]">{s.title}</h2>
              <span className="font-mono text-[12.5px] font-semibold text-muted-foreground">{s.items.length}</span>
              <p className="m-0 basis-full text-[13px] text-muted-foreground">{s.hint}</p>
            </div>
            {s.items.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(292px,100%),1fr))] gap-2.5">
                {s.items.slice(0, TODAY_LIMIT).map(l => <LeadCard key={l.path} l={l} onOpen={onOpen} onNotPicked={onNotPicked} readOnly={readOnly} />)}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-input bg-card/50 p-[22px] text-center text-muted-foreground">
                Nothing due today{count('overdue') ? ' — clear the overdue ones first.' : '. Start on the fresh leads below.'}
              </div>
            )}
            {s.items.length > TODAY_LIMIT && (
              <div className="mt-2.5">
                <Btn size="sm" onClick={() => onSeeAll(s)}>See all {s.items.length} in All leads<ChevronRight aria-hidden /></Btn>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
