/* Proposal writers: create, update (with a change log), delete with Undo. */
import { collection, doc, type DocumentData } from 'firebase/firestore'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useStore, useWriter } from '@/data/store'
import { useLeadActions } from '@/features/leads/actions'
import { db } from '@/lib/firebase'
import { fmtAbs, fmtDate, nowIso } from '@/lib/format'
import type { Proposal, ProposalDoc } from '@/types'
import { NEGOTIATION_MAP, RESPONSE_MAP, rupees } from './model'

/** Everything the form edits. */
export type ProposalFields = Pick<ProposalDoc,
  'leadPath' | 'client' | 'company' | 'phone' | 'amount' | 'videos' | 'sentDate' | 'response' | 'responseNote' | 'negotiation' | 'expectedClose' | 'nextAt' | 'notes'>

/** One line per meaningful change, for the proposal's history. */
function describeChanges(a: Proposal, b: ProposalFields): string {
  const out: string[] = []
  if (a.negotiation !== b.negotiation) out.push(NEGOTIATION_MAP[b.negotiation].label)
  if (a.response !== b.response) out.push(`Client: ${RESPONSE_MAP[b.response].label.toLowerCase()}`)
  if (a.amount !== b.amount) out.push(`Amount ${rupees(a.amount)} → ${rupees(b.amount)}`)
  if (a.videos !== b.videos) out.push(`Videos ${a.videos} → ${b.videos}`)
  if (a.sentDate !== b.sentDate) out.push(`Sent date ${fmtDate(b.sentDate)}`)
  if (a.expectedClose !== b.expectedClose) out.push(b.expectedClose ? `Expected close ${fmtDate(b.expectedClose)}` : 'Expected close cleared')
  if ((a.nextAt || null) !== (b.nextAt || null)) out.push(b.nextAt ? `Follow up ${fmtAbs(b.nextAt)}` : 'Follow-up cleared')
  if (a.responseNote !== b.responseNote && b.responseNote) out.push(`“${b.responseNote}”`)
  return out.join(' · ')
}

const closedAtFor = (prev: Proposal | null, next: ProposalFields) => {
  const closed = next.negotiation === 'won' || next.negotiation === 'lost'
  if (!closed) return null
  return prev && prev.negotiation === next.negotiation ? prev.closedAt : nowIso()
}

export function useProposalActions() {
  const { proposals, getLead } = useStore()
  const w = useWriter()
  const leadActions = useLeadActions()
  const { meId } = w

  return useMemo(() => {
    /** Offer to mark the linked lead Won when a proposal is won. */
    const offerLeadWon = (f: ProposalFields) => {
      const l = getLead(f.leadPath)
      if (!l || l.status === 'won') return
      toast(`Proposal won — mark ${l.name || l.company || 'the lead'} as Won too?`, {
        duration: 9000,
        action: { label: 'Mark Won', onClick: () => { leadActions.setStatus(l.path, 'won', `Proposal won · ${rupees(f.amount)}`) } },
      })
    }

    return {
      async create(f: ProposalFields): Promise<string | null> {
        const id = doc(collection(db, 'proposals')).id
        const at = nowIso()
        const data: ProposalDoc = {
          ...f, closedAt: closedAtFor(null, f),
          log: [{ t: `Proposal sent · ${rupees(f.amount)} · ${f.videos} video${f.videos === 1 ? '' : 's'}`, at, by: meId }],
          createdAt: at, createdBy: meId, updatedAt: at, updatedBy: meId,
        }
        try {
          await w.set(`proposals/${id}`, data)
          toast(`Proposal saved for ${f.client || f.company}`)
          if (f.negotiation === 'won') offerLeadWon(f)
          return id
        } catch { return null }
      },

      async save(id: string, f: ProposalFields): Promise<boolean> {
        const prev = proposals.find(p => p.id === id)
        if (!prev) return false
        const t = describeChanges(prev, f)
        const patch: DocumentData = { ...f, closedAt: closedAtFor(prev, f) }
        if (t) patch.log = [...(prev.log || []), { t, at: nowIso(), by: meId }]
        try {
          await w.update(`proposals/${id}`, patch)
          toast(t ? 'Proposal updated' : 'Saved')
          if (f.negotiation === 'won' && prev.negotiation !== 'won') offerLeadWon(f)
          return true
        } catch { return false }
      },

      remove(p: Proposal) {
        const { id, ...copy } = p
        w.remove(`proposals/${id}`)
          .then(() => toast(`Deleted the proposal for ${p.client || p.company}`, {
            duration: 7000,
            action: { label: 'Undo', onClick: () => { w.set(`proposals/${id}`, copy).then(() => toast('Restored')).catch(() => {}) } },
          }))
          .catch(() => {})
      },
    }
  }, [proposals, getLead, w, leadActions, meId])
}
