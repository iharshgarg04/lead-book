/* Lead writers — status outcomes, notes, follow-ups, ratings, details, delete, create.
   Ported from the legacy `writes` block; every change that legacy could undo offers Undo here too. */
import type { DocumentData } from 'firebase/firestore'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useStore, useWriter } from '@/data/store'
import { addDays, dkey, EMAIL_RX, fmtNext, monthKeyOf, monthLabelOf, normPhone, ordinal } from '@/lib/format'
import type { Lead, LeadDoc, LeadNote, LeadRating, LeadStatus, PackageKey, TimelineKey } from '@/types'
import { futureOr, leadName, snapshotOf } from './helpers'
import { makeId, newLeadDoc, type ParsedLead } from './importParser'
import { CLOSED, RMAP, SMAP } from './model'

const UNDO_MS = 7000
const CALL_STATUSES: LeadStatus[] = ['no_answer', 'callback', 'talking', 'meeting_set', 'meeting_done']

export interface DetailsForm {
  name: string
  company: string
  phone: string
  email: string
  package: PackageKey | ''
  timeline: TimelineKey | ''
}

export function useLeadActions() {
  const { getLead, months } = useStore()
  const w = useWriter()
  const { meId } = w

  return useMemo(() => {
    const undoable = (msg: string, path: string, prev: DocumentData) =>
      toast(msg, {
        duration: UNDO_MS,
        action: { label: 'Undo', onClick: () => { w.update(path, prev).then(() => toast('Undone')).catch(() => {}) } },
      })

    const ensureMonth = async (key: string) => {
      if (months.some(m => m.key === key)) return
      await w.set(`months/${key}`, { key, label: monthLabelOf(key) })
    }

    return {
      /** Log a call outcome. Resolves `ok` and whether the follow-up date should get focus. */
      async setStatus(path: string, s: LeadStatus, note = ''): Promise<{ ok: boolean; focusFollow: boolean }> {
        const l = getLead(path); if (!l) return { ok: false, focusFollow: false }
        const prev = snapshotOf(l)
        const now = new Date(), iso = now.toISOString()
        const patch: Partial<LeadDoc> = { status: s }
        const entry: LeadNote = { kind: 'status', s, t: SMAP[s].label, at: iso, by: meId }
        if (note) entry.note = note
        if (CALL_STATUSES.includes(s)) patch.lastCallAt = iso
        let msg = `Marked ${SMAP[s].label}`, focusFollow = false
        const tmr = dkey(addDays(now, 1))
        if (s === 'no_answer') {
          patch.attempts = (l.attempts || 0) + 1
          patch.nextAt = tmr
          entry.t = `Not picked · ${ordinal(patch.attempts)} try`
          msg = `Not picked (${ordinal(patch.attempts)} try) · retry tomorrow`
          if (patch.attempts >= 3) msg += ' — maybe WhatsApp them'
        } else if (s === 'callback') {
          patch.nextAt = futureOr(l.nextAt, `${tmr}T11:00`); msg = `Call back ${fmtNext(patch.nextAt)} — change it below`; focusFollow = true
        } else if (s === 'meeting_set') {
          patch.nextAt = futureOr(l.nextAt, `${tmr}T12:00`); msg = `Meeting ${fmtNext(patch.nextAt)} — set the real time below`; focusFollow = true
        } else if (s === 'portfolio') {
          patch.nextAt = futureOr(l.nextAt, dkey(addDays(now, 2))); msg = `Portfolio sent · follow up ${fmtNext(patch.nextAt)}`
        } else if (CLOSED.has(s)) patch.nextAt = null
        if (patch.nextAt) entry.next = patch.nextAt
        patch.notes = [...(l.notes || []), entry]
        try {
          await w.update(path, patch)
          undoable(msg, path, prev)
          return { ok: true, focusFollow }
        } catch {
          return { ok: false, focusFollow: false }
        }
      },

      /** Save a note on its own. Returns false when nothing was saved. */
      async addNote(path: string, text: string): Promise<boolean> {
        const l = getLead(path); if (!l) return false
        const t = text.trim()
        if (!t) { toast('Type a note first.'); return false }
        try {
          await w.update(path, { notes: [...(l.notes || []), { kind: 'note', t, at: new Date().toISOString(), by: meId }] })
          toast('Note saved')
          return true
        } catch { return false }
      },

      async setFollow(path: string, value: string | null) {
        const l = getLead(path); if (!l) return
        value = value || null
        if ((l.nextAt || null) === value) { toast(value ? `Already set for ${fmtNext(value)}` : 'No follow-up set'); return }
        const prev = snapshotOf(l)
        try {
          await w.update(path, { nextAt: value, notes: [...(l.notes || []), { kind: 'follow', next: value, at: new Date().toISOString(), by: meId }] })
          undoable(value ? `Follow-up: ${fmtNext(value)}` : 'Follow-up cleared', path, prev)
        } catch { /* writer already reported it */ }
      },

      /** Toggle a rating (pressing the current rating clears it). */
      async setRating(path: string, r: LeadRating) {
        const l = getLead(path); if (!l) return
        const next = (l.rating || null) === r ? null : r
        const prev = { rating: l.rating || null, notes: l.notes || [] }
        try {
          await w.update(path, { rating: next, notes: [...(l.notes || []), { kind: 'rating', r: next, at: new Date().toISOString(), by: meId }] })
          undoable(next ? `Rated ${RMAP[next].label}` : 'Rating cleared', path, prev)
        } catch { /* reported */ }
      },

      async saveDetails(path: string, f: DetailsForm): Promise<boolean> {
        const email = f.email.trim()
        if (email && !EMAIL_RX.test(email)) { toast('That email doesn’t look right.'); return false }
        const patch = { name: f.name.trim(), company: f.company.trim(), phone: normPhone(f.phone.trim()), email, package: f.package, timeline: f.timeline }
        try { await w.update(path, patch); toast('Details saved'); return true } catch { return false }
      },

      /** Delete with Undo (re-creates the document as it was). */
      deleteLead(l: Lead) {
        const copy: DocumentData = { ...l }
        for (const k of ['id', 'month', 'path', 'hay']) delete copy[k]
        const p = l.path
        w.remove(p)
          .then(() => toast(`Deleted ${leadName(l)}`, {
            duration: UNDO_MS,
            action: { label: 'Undo', onClick: () => { w.set(p, copy).then(() => toast('Restored')).catch(() => {}) } },
          }))
          .catch(() => {})
      },

      /** Create a lead in the current month (Add lead dialog). Returns the new path. */
      async createLead(r: ParsedLead): Promise<string | null> {
        const key = monthKeyOf(new Date())
        try {
          await ensureMonth(key)
          const path = `months/${key}/leads/${makeId(r)}`
          await w.set(path, newLeadDoc(r, 0, meId))
          return path
        } catch { return null }
      },
    }
  }, [getLead, months, w, meId])
}
