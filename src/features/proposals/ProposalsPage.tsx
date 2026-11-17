/* Proposal tracker: amount, videos, date sent, client response, negotiation, expected closing and next follow-up. */
import { Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState, PageHeader, Select, StatTile } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useStore } from '@/data/store'
import { Btn } from '@/features/leads/bits'
import { fmtDate, monthKeyOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NegotiationStatus, Proposal, ProposalResponse } from '@/types'
import { FollowLabel, NegotiationPill, ResponseText } from './bits'
import { NEGOTIATION, PROPOSAL_OPEN, PROPOSAL_SORTS, proposalDue, RESPONSES, rupees, type ProposalSort } from './model'
import { ProposalDialog } from './ProposalDialog'

type Stage = 'open' | 'all' | NegotiationStatus

const GRID = cn(
  'grid items-center gap-x-3 gap-y-1 px-3.5 py-3 grid-cols-[1fr_auto]',
  'min-[781px]:px-4 min-[781px]:py-[11px] min-[781px]:grid-cols-[minmax(140px,1.6fr)_96px_56px_176px_96px_156px]',
  'min-[1121px]:grid-cols-[minmax(140px,1.5fr)_96px_56px_92px_116px_176px_96px_156px]',
)
const WIDE = 'hidden min-[1121px]:block'
const MID = 'hidden min-[781px]:block'

function Row({ p, onOpen }: { p: Proposal; onOpen: () => void }) {
  const sub = p.client && p.company && p.company !== p.client ? p.company : ''
  return (
    <button type="button" onClick={onOpen} className={cn(GRID, 'w-full border-t text-left hover:bg-muted')}>
      <div className="min-w-0">
        <strong className="block truncate font-semibold">{p.client || p.company || 'Client'}</strong>
        <span className="block truncate text-[12.5px] text-muted-foreground">
          {sub}
          <span className="min-[781px]:hidden">{sub ? ' · ' : ''}{p.videos} videos · sent {fmtDate(p.sentDate)}</span>
        </span>
      </div>
      <div className="text-right font-mono text-[13.5px] font-semibold tabular min-[781px]:text-left">{rupees(p.amount)}</div>
      <div className={cn(MID, 'font-mono text-[13px] tabular')}>{p.videos}</div>
      <div className={cn(WIDE, 'text-[12.5px] text-ink-2')}>{fmtDate(p.sentDate)}</div>
      <div className={WIDE}><ResponseText r={p.response} /></div>
      <div className="max-[780px]:col-start-1"><NegotiationPill s={p.negotiation} /></div>
      <div className={cn(MID, 'text-[12.5px] text-ink-2')}>{p.expectedClose ? fmtDate(p.expectedClose) : '—'}</div>
      <div className="justify-self-end min-[781px]:justify-self-auto"><FollowLabel p={p} /></div>
    </button>
  )
}

export default function ProposalsPage() {
  const { proposals, proposalsReady, readOnly } = useStore()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<Stage>('open')
  const [resp, setResp] = useState<'' | ProposalResponse>('')
  const [dueOnly, setDueOnly] = useState(false)
  const [sort, setSort] = useState<ProposalSort>('next')
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)

  // ?open=<id> opens a proposal, ?due=1 shows follow-ups due.
  useEffect(() => {
    const open = sp.get('open'), due = sp.get('due')
    if (!open && !due) return
    if (due) setDueOnly(true)
    if (open && proposals.some(p => p.id === open)) setEditing({ id: open })
    else if (open && !proposalsReady) return
    setSp({}, { replace: true })
  }, [sp, proposals, proposalsReady, setSp])

  const stats = useMemo(() => {
    const open = proposals.filter(PROPOSAL_OPEN)
    const mk = monthKeyOf(new Date())
    const due = open.filter(p => { const d = proposalDue(p); return d === 'overdue' || d === 'today' })
    const closing = open.filter(p => (p.expectedClose || '').startsWith(mk))
    const won = proposals.filter(p => p.negotiation === 'won' && (p.closedAt ? monthKeyOf(new Date(p.closedAt)) === mk : false))
    const sum = (l: Proposal[]) => l.reduce((a, p) => a + (Number(p.amount) || 0), 0)
    return { open, due, closing, won, sum }
  }, [proposals])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return proposals.filter(p => {
      if (stage === 'open' ? !PROPOSAL_OPEN(p) : stage !== 'all' && p.negotiation !== stage) return false
      if (resp && p.response !== resp) return false
      if (dueOnly) { const d = proposalDue(p); if (d !== 'overdue' && d !== 'today') return false }
      if (s && ![p.client, p.company, p.phone, p.notes, p.responseNote].join(' ').toLowerCase().includes(s)) return false
      return true
    }).sort(PROPOSAL_SORTS[sort].fn)
  }, [proposals, q, stage, resp, dueOnly, sort])
  const filtered = !!(q || stage !== 'open' || resp || dueOnly)
  const counts = useMemo(() => {
    const c: Record<string, number> = { open: stats.open.length, all: proposals.length }
    for (const p of proposals) c[p.negotiation] = (c[p.negotiation] || 0) + 1
    return c
  }, [proposals, stats.open.length])
  const current = editing?.id ? proposals.find(p => p.id === editing.id) || null : null
  // A proposal deleted elsewhere while open closes its dialog.
  useEffect(() => { if (editing?.id && proposalsReady && !current) setEditing(null) }, [editing, current, proposalsReady])

  const chip = (k: Stage, label: string) => (
    <button key={k} type="button" aria-pressed={stage === k} onClick={() => setStage(k)}
      className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 text-[12.5px] leading-none font-semibold text-ink-2 hover:border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-card">
      {label} <span className="font-mono text-[11.5px] opacity-75">{counts[k] || 0}</span>
    </button>
  )

  return (
    <>
      <PageHeader title="Proposals" sub="Quotes sent to brands — response, negotiation and the next follow-up"
        actions={<Button onClick={() => setEditing({ id: null })} disabled={readOnly}><Plus aria-hidden />New proposal</Button>} />

      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        <StatTile label="Open pipeline" value={rupees(stats.sum(stats.open))} detail={`${stats.open.length} open proposal${stats.open.length === 1 ? '' : 's'}`} />
        <button type="button" onClick={() => { setDueOnly(true); setStage('open') }} className="text-left">
          <StatTile label="Follow-ups due" value={stats.due.length} detail="overdue + today" tone={stats.due.length ? 'warn' : undefined} />
        </button>
        <StatTile label="Closing this month" value={rupees(stats.sum(stats.closing))} detail={`${stats.closing.length} expected`} />
        <StatTile label="Won this month" value={rupees(stats.sum(stats.won))} detail={`${stats.won.length} proposal${stats.won.length === 1 ? '' : 's'}`} tone="good" />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-[18px] pb-2.5">
        <div className="relative min-w-0 flex-[1_1_260px]">
          <Search className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="pr-q" className="sr-only">Search proposals</label>
          <input id="pr-q" type="search" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} placeholder="Search client, brand, notes…" className="field pl-[34px]" />
        </div>
        <Select aria-label="Client response" value={resp} onChange={e => setResp(e.target.value as '' | ProposalResponse)}>
          <option value="">Any response</option>
          {RESPONSES.map(r => <option key={r.k} value={r.k}>{r.label}</option>)}
        </Select>
        <Select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as ProposalSort)}>
          {Object.entries(PROPOSAL_SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
          <input type="checkbox" className="size-4 accent-primary" checked={dueOnly} onChange={e => setDueOnly(e.target.checked)} />Follow-up due
        </label>
      </div>
      <div role="group" aria-label="Filter by negotiation status" className="flex flex-wrap gap-1.5 pb-3">
        {chip('open', 'Open')}
        {NEGOTIATION.map(n => chip(n.k, n.label))}
        {chip('all', 'All')}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 text-[13px] text-muted-foreground">
        <span aria-live="polite">{list.length} of {proposals.length} proposals · {rupees(stats.sum(list))}</span>
        {filtered && <Btn size="sm" variant="link" onClick={() => { setQ(''); setStage('open'); setResp(''); setDueOnly(false) }}>Clear filters</Btn>}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {!proposalsReady && !proposals.length ? (
          <p className="px-5 py-6 text-center text-muted-foreground" role="status">Loading proposals…</p>
        ) : !proposals.length ? (
          <EmptyState title="No proposals yet" className="border-0">
            Add one when you send a quote — or open a lead and use “Add proposal”.
            <div className="mt-3"><Button onClick={() => setEditing({ id: null })} disabled={readOnly}><Plus aria-hidden />New proposal</Button></div>
          </EmptyState>
        ) : !list.length ? (
          <EmptyState title="No proposals match" className="border-0">Try removing a filter.</EmptyState>
        ) : (
          <>
            <div aria-hidden className={cn(GRID, 'hidden bg-muted py-[9px] text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase min-[781px]:grid min-[781px]:py-[9px]')}>
              <div>Client</div><div>Amount</div><div>Videos</div><div className={WIDE}>Sent</div><div className={WIDE}>Response</div>
              <div>Negotiation</div><div>Closing</div><div>Follow-up</div>
            </div>
            <div role="list" aria-label="Proposals">
              {list.map(p => <div role="listitem" key={p.id}><Row p={p} onOpen={() => setEditing({ id: p.id })} /></div>)}
            </div>
          </>
        )}
      </div>

      <ProposalDialog open={!!editing} proposal={current} onClose={() => setEditing(null)} />
    </>
  )
}
