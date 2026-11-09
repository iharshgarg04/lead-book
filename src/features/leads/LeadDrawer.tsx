/* The lead panel: slides in from the right on desktop; a bottom sheet with a sticky footer on phones (design: Phone · A). */
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useStore } from '@/data/store'
import type { Lead, LeadStatus } from '@/types'
import type { useLeadActions } from './actions'
import { IconBtn } from './bits'
import { DetailsSection, HistorySection } from './DrawerHistory'
import { ContactSection, DrawerHead, FollowUpSection, LogCallSection, RatingSection } from './DrawerSections'
import { isTypingTarget } from './helpers'
import { RATING } from './model'
import { useIsPhone } from './useIsPhone'

type Actions = ReturnType<typeof useLeadActions>

export interface DrawerState {
  path: string
  /** paths the prev/next buttons walk through */
  queue: string[]
  open: boolean
}

function DrawerBody({ l, actions, readOnly, onDelete, phone, onClose, onNext }: {
  l: Lead; actions: Actions; readOnly: boolean; onDelete: (l: Lead) => void
  phone: boolean; onClose: () => void; onNext: (() => void) | null
}) {
  const { months, people, meId } = useStore()
  const [note, setNote] = useState('')
  const dateRef = useRef<HTMLInputElement>(null)

  /** Log an outcome with the typed note; the note comes back if the save fails. */
  const runStatus = async (s: LeadStatus) => {
    const n = note.trim()
    setNote('')
    const r = await actions.setStatus(l.path, s, n)
    if (!r.ok) { if (n) setNote(cur => cur || n); return }
    if (r.focusFollow) dateRef.current?.focus()
  }
  const saveNote = async (focus: () => void) => {
    const t = note.trim()
    if (!t) { focus(); await actions.addNote(l.path, ''); return }
    setNote('')
    if (!(await actions.addNote(l.path, t))) setNote(cur => cur || t)
  }

  /** Phone footer: keep a typed note, then move on to the next lead (or close at the end of the queue). */
  const saveAndNext = async () => {
    const t = note.trim()
    if (t) {
      setNote('')
      if (!(await actions.addNote(l.path, t))) { setNote(cur => cur || t); return }
    }
    if (onNext) onNext(); else onClose()
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <DrawerHead l={l} months={months} />
        <ContactSection l={l} phone={phone} />
        <LogCallSection l={l} note={note} setNote={setNote} readOnly={readOnly} onOutcome={runStatus} onSaveNote={saveNote} phone={phone} />
        <FollowUpSection l={l} readOnly={readOnly} dateRef={dateRef} onSet={v => actions.setFollow(l.path, v)} phone={phone} />
        <RatingSection l={l} readOnly={readOnly} onRate={r => actions.setRating(l.path, r)} />
        <HistorySection l={l} meId={meId} people={people} />
        <DetailsSection l={l} meId={meId} people={people} readOnly={readOnly}
          onSave={f => actions.saveDetails(l.path, f)} onResetNew={() => runStatus('new')} onDelete={() => onDelete(l)} />
      </div>
      {phone && (
        <div className="flex gap-2.5 border-t bg-card px-[18px] pt-3 pb-[calc(14px+env(safe-area-inset-bottom,0px))]">
          <button type="button" onClick={onClose} className="h-[50px] rounded-xl border border-input bg-card px-4 text-[15px] font-semibold">Close</button>
          <button type="button" onClick={saveAndNext} disabled={readOnly && !!note.trim()}
            className="h-[50px] flex-1 rounded-xl bg-foreground text-[15px] font-semibold text-background disabled:opacity-45">
            {onNext ? (note.trim() ? 'Save & next lead' : 'Next lead') : (note.trim() ? 'Save & close' : 'Done')}
          </button>
        </div>
      )}
    </>
  )
}

export function LeadDrawer({ state, actions, readOnly, shortcutsBlocked, onClose, onNavigate, onDelete }: {
  state: DrawerState | null
  actions: Actions
  readOnly: boolean
  /** another dialog is open — ignore keyboard shortcuts */
  shortcutsBlocked: boolean
  onClose: () => void
  onNavigate: (path: string) => void
  onDelete: (l: Lead) => void
}) {
  const { getLead } = useStore()
  const phone = useIsPhone()
  const closeRef = useRef<HTMLButtonElement>(null)
  const open = !!state?.open
  const lead = state ? getLead(state.path) : undefined
  const queue = state?.queue || []
  const i = state ? queue.indexOf(state.path) : -1

  const step = (dir: 1 | -1) => {
    const p = queue[i + dir]
    if (p && getLead(p)) onNavigate(p)
  }

  // Keyboard: ← → / j k to move through the queue, h w c u to rate.
  useEffect(() => {
    if (!open || shortcutsBlocked || !state) return
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const q = state.queue, at = q.indexOf(state.path)
      const go = (d: number) => { const p = q[at + d]; if (p && getLead(p)) onNavigate(p) }
      if (e.key === 'ArrowRight' || e.key === 'j') go(1)
      if (e.key === 'ArrowLeft' || e.key === 'k') go(-1)
      const r = RATING.find(x => x.key === e.key.toLowerCase())
      if (r) actions.setRating(state.path, r.k)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, shortcutsBlocked, state, getLead, onNavigate, actions])

  // Like legacy, focus returns to the close button whenever another lead opens.
  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true })
  }, [open, state?.path])

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side={phone ? 'bottom' : 'right'} showCloseButton={false} aria-describedby={undefined}
        className={phone
          ? 'h-[92dvh] max-h-[92dvh] w-full gap-0 rounded-t-[20px] bg-card p-0 shadow-[0_-10px_40px_rgba(20,22,40,.18)]'
          : 'w-full max-w-[500px] gap-0 bg-card p-0 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] sm:max-w-[500px]'}
        onOpenAutoFocus={e => { e.preventDefault(); closeRef.current?.focus({ preventScroll: true }) }}
        onInteractOutside={e => { if ((e.target as HTMLElement | null)?.closest?.('[data-sonner-toaster]')) e.preventDefault() }}>
        {phone && <div className="flex justify-center pt-2" aria-hidden><span className="h-[5px] w-10 rounded-full bg-input" /></div>}
        <div className={cn('flex items-center gap-2 border-b px-3', phone ? 'py-1.5' : 'py-2.5')}>
          <IconBtn ref={closeRef} aria-label="Close" onClick={onClose}><X aria-hidden /></IconBtn>
          <div className="ml-auto flex items-center gap-1 font-mono text-[12.5px] font-medium text-muted-foreground tabular">
            <IconBtn aria-label="Previous lead" aria-keyshortcuts="ArrowLeft k" disabled={i <= 0} onClick={() => step(-1)}><ChevronLeft aria-hidden /></IconBtn>
            <span aria-live="polite">{queue.length > 1 && i >= 0 ? `${i + 1} of ${queue.length}` : ''}</span>
            <IconBtn aria-label="Next lead" aria-keyshortcuts="ArrowRight j" disabled={i < 0 || i >= queue.length - 1} onClick={() => step(1)}><ChevronRight aria-hidden /></IconBtn>
          </div>
        </div>
        {!lead && <SheetTitle className="sr-only">Lead details</SheetTitle>}
        {lead && <DrawerBody key={lead.path} l={lead} actions={actions} readOnly={readOnly} onDelete={onDelete}
          phone={phone} onClose={onClose} onNext={i >= 0 && i < queue.length - 1 ? () => step(1) : null} />}
      </SheetContent>
    </Sheet>
  )
}
