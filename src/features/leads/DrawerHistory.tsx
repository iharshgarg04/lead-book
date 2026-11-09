/* Lead drawer: history timeline and the details / edit / delete section. */
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { RatingBadge, Select } from '@/components/common'
import { ago, fmtAbs } from '@/lib/format'
import type { Lead, LeadNote, PackageKey, Person, TimelineKey } from '@/types'
import type { DetailsForm } from './actions'
import { Btn, btn, cssVar, Linkified, SecTitle } from './bits'
import { DrawerSection } from './DrawerSections'
import { personName } from './helpers'
import { PKG, RMAP, SMAP, TL } from './model'

/* ---------- history ---------- */
function EntryBody({ e }: { e: LeadNote }) {
  if (e.kind === 'status') {
    return (
      <>
        <b className="font-semibold">{e.t || (e.s && SMAP[e.s as keyof typeof SMAP]?.label) || 'Updated'}</b>
        {e.next ? ` · next ${fmtAbs(e.next)}` : ''}
        {e.note && <p className="mt-[3px] mb-0 whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]"><Linkified text={e.note} /></p>}
      </>
    )
  }
  if (e.kind === 'follow') return e.next ? <>Follow-up set for <b className="font-semibold">{fmtAbs(e.next)}</b></> : <>Follow-up cleared</>
  if (e.kind === 'rating') return e.r && RMAP[e.r] ? <>Rated <RatingBadge r={e.r} /></> : <>Rating cleared</>
  return <p className="m-0 whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]"><Linkified text={e.t || ''} /></p>
}

function dotColour(e: LeadNote) {
  if (e.kind === 'status' && e.s && e.s in SMAP) return cssVar('--c', `var(--s-${e.s})`)
  if (e.kind === 'rating' && e.r) return cssVar('--c', `var(--r-${e.r})`)
  return undefined
}

export function HistorySection({ l, meId, people }: { l: Lead; meId: string | null; people: Record<string, Person> }) {
  const items = [...l.notes].reverse()
  const who = (e: LeadNote) => {
    if (e.kind === 'sheet') return `Note from the ${e.src || 'old'} sheet`
    const by = e.by ? personName(e.by, meId, people) : e.at ? 'Someone' : 'From the sheet'
    return by + (e.at ? ` · ${ago(e.at)}` : '')
  }
  return (
    <DrawerSection>
      <SecTitle>History</SecTitle>
      <ol className="m-0 flex list-none flex-col p-0">
        {items.length ? items.map((e, i) => (
          <li key={i} style={dotColour(e)}
            className="relative pb-3.5 pl-5 before:absolute before:top-[7px] before:left-1 before:size-[7px] before:rounded-full before:bg-[var(--c,var(--input))] before:content-[''] after:absolute after:top-[18px] after:bottom-0.5 after:left-[7px] after:w-px after:bg-border after:content-[''] last:after:hidden">
            <div className="text-[13.5px] text-foreground"><EntryBody e={e} /></div>
            <div className="mt-0.5 text-xs text-muted-foreground">{who(e)}</div>
          </li>
        )) : (
          <li className="relative pl-5 text-[13.5px] text-muted-foreground before:absolute before:top-[7px] before:left-1 before:size-[7px] before:rounded-full before:bg-input before:content-['']">No calls logged yet.</li>
        )}
      </ol>
    </DrawerSection>
  )
}

/* ---------- details ---------- */
const labelCls = 'flex flex-col gap-[5px] text-[12.5px] font-medium text-ink-2'

function EditDetails({ l, onCancel, onSave }: { l: Lead; onCancel: () => void; onSave: (f: DetailsForm) => Promise<boolean> }) {
  const [f, setF] = useState<DetailsForm>({
    name: l.name || '', company: l.company || '', phone: l.phone || '', email: l.email || '', package: l.package || '', timeline: l.timeline || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof DetailsForm) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const ok = await onSave(f)
    setSaving(false)
    if (ok) onCancel()
  }
  return (
    <>
      <SecTitle>Edit details</SecTitle>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2.5 max-[480px]:grid-cols-1">
          <label className={labelCls}>Name<input type="text" className="field" value={f.name} onChange={set('name')} autoFocus /></label>
          <label className={labelCls}>Company / brand<input type="text" className="field" value={f.company} onChange={set('company')} /></label>
          <label className={labelCls}>Phone<input type="tel" className="field" value={f.phone} onChange={set('phone')} /></label>
          <label className={labelCls}>Email<input type="email" className="field" value={f.email} onChange={set('email')} /></label>
          <label className={labelCls}>Package
            <Select className="w-full" value={f.package} onChange={e => setF(p => ({ ...p, package: e.target.value as PackageKey | '' }))}>
              <option value="">Not given</option>
              {Object.entries(PKG).map(([k, v]) => <option key={k} value={k}>{v.label} · {v.ads} ads</option>)}
            </Select>
          </label>
          <label className={labelCls}>Go-live
            <Select className="w-full" value={f.timeline} onChange={e => setF(p => ({ ...p, timeline: e.target.value as TimelineKey | '' }))}>
              <option value="">Not given</option>
              {Object.entries(TL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </label>
        </div>
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={saving}>Save details</Btn>
        </div>
      </form>
    </>
  )
}

export function DetailsSection({ l, meId, people, readOnly, onSave, onResetNew, onDelete }: {
  l: Lead
  meId: string | null
  people: Record<string, Person>
  readOnly: boolean
  onSave: (f: DetailsForm) => Promise<boolean>
  onResetNew: () => void
  onDelete: () => void
}) {
  const [edit, setEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (edit) return <DrawerSection><EditDetails l={l} onCancel={() => setEdit(false)} onSave={onSave} /></DrawerSection>

  const src = l.sheetRow
    ? `From the ${l.tab || ''} sheet tab, row ${l.sheetRow}.`
    : l.createdAt ? `Added ${ago(l.createdAt)}${l.createdBy ? ` by ${personName(l.createdBy, meId, people)}` : ''}.` : ''
  return (
    <DrawerSection>
      <SecTitle>Details</SecTitle>
      <p className="mt-0 mb-3 text-[12.5px] text-muted-foreground">{src}{l.updatedAt ? ` Last updated ${ago(l.updatedAt)}.` : ''}</p>
      <div className="flex flex-wrap gap-2">
        <Link className={btn({ size: 'sm' })} to={`/invoices/new?lead=${encodeURIComponent(l.path)}`}>Create invoice</Link>
        <Btn size="sm" disabled={readOnly} onClick={() => setEdit(true)}>Edit details</Btn>
        {(l.status || 'new') !== 'new' && <Btn size="sm" disabled={readOnly} onClick={onResetNew}>Move back to New</Btn>}
        <Btn size="sm" variant="danger" disabled={readOnly} aria-expanded={confirmDelete} onClick={() => setConfirmDelete(true)}>Delete lead</Btn>
      </div>
      {confirmDelete && (
        <div role="alert" className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[9px] bg-[var(--s-lost-bg)] px-3 py-2.5 text-[13px] text-foreground">
          Delete this lead and its history for everyone?
          <span className="flex-1" />
          <Btn size="sm" onClick={() => setConfirmDelete(false)} autoFocus>Keep</Btn>
          <Btn size="sm" variant="primary" onClick={onDelete}>Delete</Btn>
        </div>
      )}
    </DrawerSection>
  )
}
