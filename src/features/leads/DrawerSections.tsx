/* Lead drawer: header, contact, call logging, rating and follow-up sections. */
import { Copy, Phone } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { toast } from 'sonner'
import { PackagePill, RatingBadge, RatingIcon, StatusPill, TimelinePill } from '@/components/common'
import { SheetTitle } from '@/components/ui/sheet'
import { digits, fmtNext, fmtPhone, parseNext } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Lead, LeadRating, LeadStatus, Month } from '@/types'
import { Btn, btn, SecTitle, Tag, WhatsAppIcon } from './bits'
import { copyText, leadName, QUICK_FOLLOW, quickFollowValue, triesLabel } from './helpers'
import { dueState, OUTCOME_GROUPS, RATING, SMAP } from './model'

export function DrawerSection({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={cn('border-b px-5 py-4 last:border-b-0', className)}>{children}</section>
}

/* ---------- head ---------- */
export function DrawerHead({ l, months }: { l: Lead; months: Month[] }) {
  const mo = months.find(m => m.key === l.month)
  return (
    <DrawerSection>
      <SheetTitle className="m-0 font-display text-[25px] leading-[1.12] font-bold [overflow-wrap:anywhere]">{leadName(l)}</SheetTitle>
      {l.name && l.company && <div className="mt-1 text-sm text-ink-2 [overflow-wrap:anywhere]">{l.company}</div>}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <RatingBadge r={l.rating} />
        <StatusPill s={l.status || 'new'} />
        <PackagePill p={l.package} />
        <TimelinePill t={l.timeline} />
        {(l.attempts || 0) > 0 && <Tag>{triesLabel(l.attempts)}</Tag>}
        {(l.enquiries || 1) > 1 && <Tag>Filled form {l.enquiries}×</Tag>}
        <Tag>{mo ? mo.label : l.month}</Tag>
      </div>
    </DrawerSection>
  )
}

/* ---------- contact ---------- */
export function ContactSection({ l }: { l: Lead }) {
  const phoneRef = useRef<HTMLSpanElement>(null)
  const emailRef = useRef<HTMLSpanElement>(null)
  const wa = digits(l.phone)
  const notify = (m: string) => toast(m)
  return (
    <DrawerSection label="Contact">
      <div className="flex flex-col gap-2.5">
        {l.phone ? (
          <div className="flex flex-wrap items-center gap-2">
            <span ref={phoneRef} className="mr-auto font-mono text-[17px] font-semibold tabular select-all [overflow-wrap:anywhere]">{fmtPhone(l.phone)}</span>
            <Btn size="sm" aria-label={`Copy phone number ${fmtPhone(l.phone)}`} onClick={() => copyText(l.phone, phoneRef.current, notify)}><Copy aria-hidden />Copy</Btn>
            <a className={btn({ variant: 'wa', size: 'sm' })} href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"><WhatsAppIcon />WhatsApp</a>
            <a className={btn({ size: 'sm' })} href={`tel:${l.phone}`}><Phone aria-hidden />Call</a>
          </div>
        ) : (
          <div className="text-sm font-medium text-ink-2">No phone number</div>
        )}
        {l.email && (
          <div className="flex flex-wrap items-center gap-2">
            <span ref={emailRef} className="mr-auto text-sm font-medium text-ink-2 select-all [overflow-wrap:anywhere]">{l.email}</span>
            <Btn size="sm" aria-label={`Copy email ${l.email}`} onClick={() => copyText(l.email, emailRef.current, notify)}><Copy aria-hidden />Copy</Btn>
          </div>
        )}
      </div>
    </DrawerSection>
  )
}

/* ---------- log this call ---------- */
export function LogCallSection({ l, note, setNote, readOnly, onOutcome, onSaveNote }: {
  l: Lead
  note: string
  setNote: (v: string) => void
  readOnly: boolean
  onOutcome: (s: LeadStatus) => void
  onSaveNote: (focus: () => void) => void
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  return (
    <DrawerSection>
      <SecTitle>Log this call</SecTitle>
      <label htmlFor="dw-note" className="sr-only">Note</label>
      <textarea id="dw-note" ref={taRef} rows={2} value={note} onChange={e => setNote(e.target.value)} disabled={readOnly}
        placeholder="What did they say? e.g. skincare brand, wants Hindi videos, budget ~₹15k" className="field resize-y" />
      <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
        <span>Type a note, then tap an outcome — or save it on its own.</span>
        <Btn size="sm" disabled={readOnly} onClick={() => onSaveNote(() => taRef.current?.focus())}>Save note</Btn>
      </div>
      {OUTCOME_GROUPS.map(g => (
        <div key={g.label} role="group" aria-label={`${g.label} outcomes`} className="mt-2.5 grid grid-cols-[62px_1fr] items-start gap-2 max-[480px]:grid-cols-1 max-[480px]:gap-1">
          <span className="pt-[9px] text-xs font-medium text-muted-foreground max-[480px]:pt-0" aria-hidden>{g.label}</span>
          <div className="flex flex-wrap gap-1.5">
            {g.keys.map(k => (
              <button key={k} type="button" data-s={k} aria-pressed={l.status === k} disabled={readOnly} onClick={() => onOutcome(k)}
                className="inline-flex items-center gap-[7px] rounded-[9px] border border-input bg-card px-[11px] py-2 text-[13px] leading-[1.1] font-semibold text-foreground before:size-[7px] before:flex-none before:rounded-full before:bg-[var(--c)] before:content-[''] hover:border-[var(--c)] hover:bg-[var(--cb)] disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:border-[var(--c)] aria-pressed:bg-[var(--cb)] aria-pressed:text-[var(--c)]">
                {SMAP[k].btn}
                {SMAP[k].tip && <small className="font-mono text-[11px] font-medium text-muted-foreground">{SMAP[k].tip}</small>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </DrawerSection>
  )
}

/* ---------- rating ---------- */
export function RatingSection({ l, readOnly, onRate }: { l: Lead; readOnly: boolean; onRate: (r: LeadRating) => void }) {
  return (
    <DrawerSection>
      <SecTitle>Lead rating <span className="font-medium tracking-normal normal-case">— how likely are they to buy?</span></SecTitle>
      <div role="group" aria-label="Lead rating" className="grid grid-cols-4 gap-1.5 max-[480px]:grid-cols-2">
        {RATING.map(r => {
          const Icon = RatingIcon[r.k]
          return (
            <button key={r.k} type="button" data-r={r.k} aria-pressed={(l.rating || '') === r.k} disabled={readOnly} onClick={() => onRate(r.k)}
              aria-keyshortcuts={r.key}
              className="flex flex-col items-start gap-[3px] rounded-[10px] border border-input bg-card px-2.5 py-[9px] text-left text-foreground hover:border-[var(--rc)] disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:border-[var(--rc)] aria-pressed:bg-[var(--rb)] aria-pressed:shadow-[inset_0_0_0_1px_var(--rc)]">
              <b className="inline-flex w-full items-center gap-[5px] text-[13.5px] leading-[1.1] font-[650] text-[var(--rc)]">
                <Icon className="size-3.5" aria-hidden />{r.label}
                <kbd className="ml-auto rounded border px-1 font-mono text-[10.5px] font-medium text-muted-foreground">{r.key}</kbd>
              </b>
              <span className="text-[11.5px] leading-[1.3] text-muted-foreground">{r.hint}</span>
            </button>
          )
        })}
      </div>
    </DrawerSection>
  )
}

/* ---------- next follow-up ---------- */
export function FollowUpSection({ l, readOnly, dateRef, onSet }: {
  l: Lead
  readOnly: boolean
  dateRef: RefObject<HTMLInputElement | null>
  onSet: (value: string | null) => void
}) {
  const timeRef = useRef<HTMLInputElement>(null)
  const n = parseNext(l.nextAt)
  const [date, setDate] = useState(n?.date || '')
  const [time, setTime] = useState(n?.time || '')
  // Follow the saved value unless the user is editing the inputs.
  useEffect(() => {
    const a = document.activeElement
    if (a && (a === dateRef.current || a === timeRef.current)) return
    const p = parseNext(l.nextAt)
    setDate(p?.date || ''); setTime(p?.time || '')
  }, [l.nextAt, dateRef])

  const ds = dueState(l)
  const save = () => {
    if (!date) { toast('Pick a date first, or tap Clear.'); dateRef.current?.focus(); return }
    onSet(time ? `${date}T${time}` : date)
  }
  return (
    <DrawerSection>
      <SecTitle>
        Next follow-up
        <span className={cn('ml-auto text-sm font-semibold tracking-normal text-foreground normal-case', ds === 'overdue' && 'text-destructive', ds === 'today' && 'text-warn')}>
          {l.nextAt ? (ds === 'overdue' ? 'Overdue · ' : '') + fmtNext(l.nextAt) : 'Not set'}
        </span>
      </SecTitle>
      <div className="flex flex-wrap gap-2">
        <label htmlFor="dw-date" className="sr-only">Follow-up date</label>
        <input id="dw-date" ref={dateRef} type="date" value={date} onChange={e => setDate(e.target.value)} disabled={readOnly} className="field flex-[1_1_150px]" />
        <label htmlFor="dw-time" className="sr-only">Time (optional)</label>
        <input id="dw-time" ref={timeRef} type="time" value={time} onChange={e => setTime(e.target.value)} disabled={readOnly} className="field flex-[0_1_120px]" />
        <Btn onClick={save} disabled={readOnly}>Set</Btn>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Quick follow-up">
        {QUICK_FOLLOW.map(c => (
          <button key={c.q} type="button" disabled={readOnly} onClick={() => onSet(quickFollowValue(c.q))}
            className="rounded-full border border-dashed border-input bg-transparent px-[11px] py-1.5 text-[12.5px] font-medium text-ink-2 hover:border-solid hover:border-ink-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45">
            {c.label}
          </button>
        ))}
      </div>
    </DrawerSection>
  )
}
