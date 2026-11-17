/* Proposal tracker model: response / negotiation labels and colours, due state, sorting. */
import { parseNext, todayKey } from '@/lib/format'
import type { NegotiationStatus, Proposal, ProposalResponse } from '@/types'

interface Opt<K> { k: K; label: string; /** lead status colour to reuse */ c: string }

export const RESPONSES: Opt<ProposalResponse>[] = [
  { k: 'awaiting', label: 'Awaiting reply', c: 'no_answer' },
  { k: 'positive', label: 'Interested', c: 'talking' },
  { k: 'changes', label: 'Wants changes', c: 'portfolio' },
  { k: 'price', label: 'Price too high', c: 'callback' },
  { k: 'no_reply', label: 'Not replying', c: 'junk' },
  { k: 'declined', label: 'Declined', c: 'lost' },
]
export const NEGOTIATION: Opt<NegotiationStatus>[] = [
  { k: 'not_started', label: 'Not started', c: 'no_answer' },
  { k: 'negotiating', label: 'Negotiating', c: 'callback' },
  { k: 'revised', label: 'Revised offer sent', c: 'portfolio' },
  { k: 'agreed', label: 'Agreed · awaiting payment', c: 'meeting_set' },
  { k: 'won', label: 'Won', c: 'won' },
  { k: 'lost', label: 'Lost', c: 'lost' },
]
export const RESPONSE_MAP = Object.fromEntries(RESPONSES.map(r => [r.k, r])) as Record<ProposalResponse, Opt<ProposalResponse>>
export const NEGOTIATION_MAP = Object.fromEntries(NEGOTIATION.map(r => [r.k, r])) as Record<NegotiationStatus, Opt<NegotiationStatus>>

export const PROPOSAL_OPEN = (p: Pick<Proposal, 'negotiation'>) => p.negotiation !== 'won' && p.negotiation !== 'lost'

/** Follow-up state of an open proposal. */
export function proposalDue(p: Pick<Proposal, 'nextAt' | 'negotiation'>): 'overdue' | 'today' | 'future' | null {
  if (!p.nextAt || !PROPOSAL_OPEN(p)) return null
  const n = parseNext(p.nextAt); if (!n) return null
  const t = todayKey()
  return n.date < t ? 'overdue' : n.date === t ? 'today' : 'future'
}

/** '₹45,000' — whole rupees, Indian grouping. */
export const rupees = (n: unknown) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export type ProposalSort = 'next' | 'close' | 'sent' | 'amount'
const byNext = (a: Proposal, b: Proposal) => {
  const pa = PROPOSAL_OPEN(a) ? a.nextAt || '' : '', pb = PROPOSAL_OPEN(b) ? b.nextAt || '' : ''
  if (!pa !== !pb) return pa ? -1 : 1
  return pa.localeCompare(pb) || b.sentDate.localeCompare(a.sentDate)
}
export const PROPOSAL_SORTS: Record<ProposalSort, { label: string; fn: (a: Proposal, b: Proposal) => number }> = {
  next: { label: 'Next follow-up', fn: byNext },
  close: { label: 'Expected closing', fn: (a, b) => (!a.expectedClose !== !b.expectedClose ? (a.expectedClose ? -1 : 1) : a.expectedClose.localeCompare(b.expectedClose)) || byNext(a, b) },
  sent: { label: 'Newest sent', fn: (a, b) => b.sentDate.localeCompare(a.sentDate) || b.createdAt.localeCompare(a.createdAt) },
  amount: { label: 'Biggest amount', fn: (a, b) => b.amount - a.amount || byNext(a, b) },
}
