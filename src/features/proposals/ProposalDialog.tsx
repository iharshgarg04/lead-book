/* Add / edit a proposal: who it's for, amount and videos, client response, negotiation, closing date, next follow-up. */
import { Search, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { RatingBadge, Select } from '@/components/common'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/data/store'
import { MODAL_CLS, MODAL_TITLE } from '@/features/leads/AddLeadDialog'
import { Btn, SecTitle } from '@/features/leads/bits'
import { leadName, personName, QUICK_FOLLOW, quickFollowValue } from '@/features/leads/helpers'
import { newestCmp } from '@/features/leads/model'
import { ago, digits, fmtNext, num, parseNext, todayKey } from '@/lib/format'
import type { Lead, NegotiationStatus, Proposal, ProposalResponse } from '@/types'
import { useProposalActions, type ProposalFields } from './actions'
import { NEGOTIATION, RESPONSES } from './model'

const labelCls = 'flex min-w-0 flex-col gap-[5px] text-[12.5px] font-medium text-ink-2'

interface Form {
  leadPath: string; client: string; company: string; phone: string
  amount: string; videos: string; sentDate: string
  response: ProposalResponse; responseNote: string; negotiation: NegotiationStatus
  expectedClose: string; nextDate: string; nextTime: string; notes: string
}

function initial(p: Proposal | null, lead: Lead | undefined): Form {
  if (p) {
    const n = parseNext(p.nextAt)
    return {
      leadPath: p.leadPath, client: p.client, company: p.company, phone: p.phone,
      amount: String(p.amount || ''), videos: String(p.videos || ''), sentDate: p.sentDate,
      response: p.response, responseNote: p.responseNote || '', negotiation: p.negotiation,
      expectedClose: p.expectedClose || '', nextDate: n?.date || '', nextTime: n?.time || '', notes: p.notes || '',
    }
  }
  return {
    leadPath: lead?.path || '', client: lead ? lead.name || lead.company : '', company: lead?.company || '', phone: lead?.phone || '',
    amount: '', videos: '', sentDate: todayKey(), response: 'awaiting', responseNote: '', negotiation: 'not_started',
    expectedClose: '', nextDate: '', nextTime: '', notes: '',
  }
}

/** Search the lead book; picking a lead fills the client name, brand and phone. */
function LeadPicker({ f, setF }: { f: Form; setF: (fn: (p: Form) => Form) => void }) {
  const { leads, getLead } = useStore()
  const [q, setQ] = useState('')
  const linked = getLead(f.leadPath)
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase(), qd = digits(s)
    if (!s) return []
    return leads.filter(l => (qd.length >= 4 ? digits(l.phone).includes(qd) : s.split(/\s+/).every(w => l.hay.includes(w)))).sort(newestCmp).slice(0, 6)
  }, [leads, q])
  const pick = (l: Lead) => { setF(p => ({ ...p, leadPath: l.path, client: l.name || l.company, company: l.company, phone: l.phone })); setQ('') }

  if (f.leadPath) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border bg-muted px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate font-semibold">{linked && <RatingBadge r={linked.rating} />}{linked ? leadName(linked) : f.client || 'Lead'}</div>
          <div className="truncate text-[12.5px] text-muted-foreground">{[linked?.company || f.company, linked?.phone || f.phone].filter(Boolean).join(' · ') || (linked ? '' : 'This lead was deleted — details kept on the proposal')}</div>
        </div>
        <Btn size="sm" variant="link" aria-label="Unlink lead" onClick={() => setF(p => ({ ...p, leadPath: '' }))}><X aria-hidden />Change</Btn>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="pr-find" className="sr-only">Find a lead</label>
        <input id="pr-find" type="search" autoComplete="off" autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="Find the lead — name, brand or phone" className="field pl-[34px]" />
      </div>
      {q.trim() && (
        <ul className="m-0 max-h-[220px] list-none overflow-auto rounded-[10px] border p-0" aria-label="Matching leads">
          {matches.length ? matches.map(l => (
            <li key={l.path} className="border-t first:border-t-0">
              <button type="button" onClick={() => pick(l)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted">
                <RatingBadge r={l.rating} /><span className="min-w-0 flex-1 truncate font-semibold">{leadName(l)}</span>
                <span className="truncate text-[12.5px] text-muted-foreground">{l.name ? l.company : ''}</span>
              </button>
            </li>
          )) : <li className="px-3 py-2 text-[13px] text-muted-foreground">No lead matches — fill the client below instead.</li>}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
        <label className={labelCls}>Client name<input type="text" className="field" value={f.client} onChange={e => setF(p => ({ ...p, client: e.target.value }))} /></label>
        <label className={labelCls}>Brand / company<input type="text" className="field" value={f.company} onChange={e => setF(p => ({ ...p, company: e.target.value }))} /></label>
      </div>
    </div>
  )
}

function ProposalForm({ proposal, lead, onClose }: { proposal: Proposal | null; lead?: Lead; onClose: () => void }) {
  const { readOnly, people, meId } = useStore()
  const actions = useProposalActions()
  const [f, setF] = useState<Form>(() => initial(proposal, lead))
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [msg, setMsg] = useState('')
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))
  const quick = (v: string | null) => { const n = parseNext(v); setF(p => ({ ...p, nextDate: n?.date || '', nextTime: n?.time || '' })) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const amount = num(f.amount), videos = Math.round(num(f.videos))
    if (!f.leadPath && !f.client.trim() && !f.company.trim()) { setMsg('Pick a lead, or type the client’s name or brand.'); return }
    if (!(amount > 0)) { setMsg('Enter the proposal amount.'); return }
    if (!f.sentDate) { setMsg('Enter the date the proposal was sent.'); return }
    setMsg('')
    const out: ProposalFields = {
      leadPath: f.leadPath, client: f.client.trim(), company: f.company.trim(), phone: f.phone,
      amount, videos, sentDate: f.sentDate, response: f.response, responseNote: f.responseNote.trim(),
      negotiation: f.negotiation, expectedClose: f.expectedClose,
      nextAt: f.nextDate ? (f.nextTime ? `${f.nextDate}T${f.nextTime}` : f.nextDate) : null, notes: f.notes.trim(),
    }
    setSaving(true)
    const ok = proposal ? await actions.save(proposal.id, out) : !!(await actions.create(out))
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <section>
        <SecTitle>Client</SecTitle>
        <LeadPicker f={f} setF={setF} />
      </section>

      <section>
        <SecTitle>Proposal</SecTitle>
        <div className="grid grid-cols-3 gap-2.5 max-[560px]:grid-cols-2">
          <label className={labelCls}>Amount (₹)<input type="text" inputMode="decimal" className="field font-mono" placeholder="45000" value={f.amount} onChange={set('amount')} autoFocus={!!(proposal || lead)} /></label>
          <label className={labelCls}>Videos proposed<input type="number" min={0} inputMode="numeric" className="field font-mono" placeholder="10" value={f.videos} onChange={set('videos')} /></label>
          <label className={labelCls}>Date sent<input type="date" className="field" value={f.sentDate} onChange={set('sentDate')} /></label>
        </div>
      </section>

      <section>
        <SecTitle>Where it stands</SecTitle>
        <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
          <label className={labelCls}>Client response
            <Select className="w-full" value={f.response} onChange={set('response')}>{RESPONSES.map(r => <option key={r.k} value={r.k}>{r.label}</option>)}</Select>
          </label>
          <label className={labelCls}>Negotiation status
            <Select className="w-full" value={f.negotiation} onChange={set('negotiation')}>{NEGOTIATION.map(r => <option key={r.k} value={r.k}>{r.label}</option>)}</Select>
          </label>
        </div>
        <label className={`${labelCls} mt-2.5`}>What did the client say?
          <textarea rows={2} className="field resize-y" placeholder="e.g. wants 8 videos instead of 10, asked for a discount" value={f.responseNote} onChange={set('responseNote')} />
        </label>
      </section>

      <section>
        <SecTitle>Dates</SecTitle>
        <div className="grid grid-cols-[1fr_1fr_120px] gap-2.5 max-[560px]:grid-cols-2">
          <label className={labelCls}>Expected closing<input type="date" className="field" value={f.expectedClose} onChange={set('expectedClose')} /></label>
          <label className={labelCls}>Next follow-up<input type="date" className="field" value={f.nextDate} onChange={set('nextDate')} /></label>
          <label className={labelCls}>Time <span className="sr-only">(optional)</span><input type="time" className="field" value={f.nextTime} onChange={set('nextTime')} /></label>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick follow-up">
          {QUICK_FOLLOW.map(c => (
            <button key={c.q} type="button" onClick={() => quick(quickFollowValue(c.q))}
              className="rounded-full border border-dashed border-input px-[11px] py-1.5 text-[12.5px] font-medium text-ink-2 hover:border-solid hover:border-ink-2 hover:text-foreground">{c.label}</button>
          ))}
        </div>
      </section>

      <label className={labelCls}>Notes
        <textarea rows={2} className="field resize-y" placeholder="Scope, deliverables, anything to remember" value={f.notes} onChange={set('notes')} />
      </label>

      {proposal && (proposal.log || []).length > 0 && (
        <section>
          <SecTitle>History</SecTitle>
          <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
            {[...proposal.log].reverse().map((e, i) => (
              <li key={i}><span className="text-foreground">{e.t}</span><span className="block text-xs text-muted-foreground">{e.by ? personName(e.by, meId, people) : 'Someone'} · {ago(e.at)}</span></li>
            ))}
          </ol>
        </section>
      )}

      <p role="alert" className="m-0 text-[13px] text-destructive empty:hidden">{msg}</p>
      {confirmDelete && proposal && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[9px] bg-[var(--s-lost-bg)] px-3 py-2.5 text-[13px]">
          Delete this proposal for everyone?<span className="flex-1" />
          <Btn size="sm" onClick={() => setConfirmDelete(false)} autoFocus>Keep</Btn>
          <Btn size="sm" variant="primary" onClick={() => { onClose(); actions.remove(proposal) }}>Delete</Btn>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {proposal && <Btn variant="danger" disabled={readOnly} onClick={() => setConfirmDelete(true)}>Delete</Btn>}
        {proposal?.nextAt && <span className="text-[12.5px] text-muted-foreground">Follow-up {fmtNext(proposal.nextAt)}</span>}
        <span className="flex-1" />
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn type="submit" variant="primary" disabled={saving || readOnly}>
          {saving ? 'Saving…' : proposal ? 'Save proposal' : 'Add proposal'}
        </Btn>
      </div>
    </form>
  )
}

export function ProposalDialog({ open, proposal, lead, onClose }: { open: boolean; proposal: Proposal | null; lead?: Lead; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className={MODAL_CLS} data-proposal-dialog="">
        <DialogTitle className={MODAL_TITLE}>{proposal ? `Proposal · ${proposal.client || proposal.company}` : 'New proposal'}</DialogTitle>
        <DialogDescription className="-mt-2 text-[13.5px] text-ink-2">
          {proposal ? `Sent ${proposal.sentDate ? new Date(proposal.sentDate + 'T12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}. Update the response, negotiation and next follow-up as it moves.` : 'Record a quote sent to a brand and when to follow up on it.'}
        </DialogDescription>
        {open && <ProposalForm key={proposal?.id || lead?.path || 'new'} proposal={proposal} lead={lead} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
