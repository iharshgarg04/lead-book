/* "Add a lead" dialog with duplicate detection (legacy addModal / submitAdd). */
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Select } from '@/components/common'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/data/store'
import { EMAIL_RX, fmtPhone, normPhone } from '@/lib/format'
import type { Lead, PackageKey, TimelineKey } from '@/types'
import type { useLeadActions } from './actions'
import { Btn } from './bits'
import { leadName } from './helpers'
import { buildLeadIndex, type ParsedLead } from './importParser'
import { PKG, TL } from './model'

export const MODAL_CLS = 'max-h-[calc(100dvh-32px)] w-[min(680px,calc(100%-32px))] max-w-none overflow-auto rounded-2xl border-0 bg-card p-[22px] sm:max-w-none'
export const MODAL_TITLE = 'font-display text-[22px] leading-[1.15] font-bold'
const labelCls = 'flex flex-col gap-[5px] text-[12.5px] font-medium text-ink-2'

interface Form { name: string; phone: string; company: string; email: string; package: PackageKey | ''; timeline: TimelineKey | ''; note: string }
const EMPTY: Form = { name: '', phone: '', company: '', email: '', package: '', timeline: '', note: '' }

function AddLeadForm({ actions, onClose, onOpenLead }: {
  actions: ReturnType<typeof useLeadActions>
  onClose: () => void
  onOpenLead: (path: string) => void
}) {
  const { leads } = useStore()
  const [f, setF] = useState<Form>(EMPTY)
  const [msg, setMsg] = useState('')
  const [dup, setDup] = useState<Lead | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r: ParsedLead = {
      name: f.name.trim(), phone: normPhone(f.phone.trim()), email: f.email.trim(), company: f.company.trim(),
      package: f.package, timeline: f.timeline, notes: f.note.trim() ? [f.note.trim()] : [], created: null,
    }
    setDup(null)
    if (!r.phone && !r.email) { setMsg('Add a phone number or an email so the lead can be contacted.'); return }
    if (r.email && !EMAIL_RX.test(r.email)) { setMsg('That email doesn’t look right — check it or leave it empty.'); return }
    const existing = buildLeadIndex(leads)(r)
    if (existing) { setMsg(''); setDup(existing); return }
    setMsg('')
    setSaving(true)
    const path = await actions.createLead(r)
    setSaving(false)
    if (path) { onClose(); toast(`Added ${r.name || fmtPhone(r.phone) || r.email}`) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
        <label className={labelCls}>Name<input type="text" className="field" autoComplete="off" value={f.name} onChange={set('name')} autoFocus /></label>
        <label className={labelCls}>Phone<input type="tel" className="field" inputMode="tel" placeholder="98765 43210" autoComplete="off" value={f.phone} onChange={set('phone')} /></label>
        <label className={labelCls}>Company / brand<input type="text" className="field" autoComplete="off" value={f.company} onChange={set('company')} /></label>
        <label className={labelCls}>Email<input type="email" className="field" autoComplete="off" value={f.email} onChange={set('email')} /></label>
        <label className={labelCls}>Package
          <Select className="w-full" value={f.package} onChange={set('package')}>
            <option value="">Not given</option>
            {Object.entries(PKG).map(([k, v]) => <option key={k} value={k}>{v.label} · {v.ads} ads</option>)}
          </Select>
        </label>
        <label className={labelCls}>Go-live
          <Select className="w-full" value={f.timeline} onChange={set('timeline')}>
            <option value="">Not given</option>
            {Object.entries(TL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </label>
      </div>
      <label className={labelCls}>Note
        <textarea rows={2} className="field resize-y" placeholder="What do they sell? Anything they asked for?" value={f.note} onChange={set('note')} />
      </label>
      <p role="alert" className="m-0 text-[13px] text-destructive empty:hidden">
        {msg}
        {dup && <>Already in the list: <b>{leadName(dup)}</b>. <Btn size="sm" onClick={() => onOpenLead(dup.path)}>Open it</Btn></>}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn type="submit" variant="primary" disabled={saving}>Add lead</Btn>
      </div>
    </form>
  )
}

export function AddLeadDialog({ open, onClose, actions, onOpenLead }: {
  open: boolean
  onClose: () => void
  actions: ReturnType<typeof useLeadActions>
  onOpenLead: (path: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className={MODAL_CLS}>
        <DialogTitle className={MODAL_TITLE}>Add a lead</DialogTitle>
        <DialogDescription className="-mt-2 max-w-[62ch] text-[13.5px] text-ink-2">
          For leads that came by WhatsApp, Instagram DM or a referral. A phone number or email is needed.
        </DialogDescription>
        <AddLeadForm actions={actions} onClose={onClose} onOpenLead={onOpenLead} />
      </DialogContent>
    </Dialog>
  )
}
