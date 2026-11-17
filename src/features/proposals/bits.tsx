/* Proposal pills and labels shared by the Proposals page and the lead drawer. */
import { Pill } from '@/components/common'
import { cssVar } from '@/features/leads/bits'
import { fmtNext } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NegotiationStatus, Proposal, ProposalResponse } from '@/types'
import { NEGOTIATION_MAP, proposalDue, RESPONSE_MAP } from './model'

const tone = (c: string) => ({ ...cssVar('--c', `var(--s-${c})`), ...cssVar('--cb', `var(--s-${c}-bg)`) })
export const NegotiationPill = ({ s }: { s: NegotiationStatus }) => <Pill style={tone(NEGOTIATION_MAP[s].c)}>{NEGOTIATION_MAP[s].label}</Pill>
export const ResponseText = ({ r }: { r: ProposalResponse }) => (
  <span style={tone(RESPONSE_MAP[r].c)} className="text-[12.5px] font-semibold whitespace-nowrap text-[var(--c)]">{RESPONSE_MAP[r].label}</span>
)

export function FollowLabel({ p }: { p: Proposal }) {
  const ds = proposalDue(p)
  if (!ds) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <span className={cn('font-mono text-xs font-medium whitespace-nowrap text-ink-2', ds === 'overdue' && 'font-semibold text-destructive', ds === 'today' && 'font-semibold text-warn')}>
      {ds === 'overdue' ? 'Overdue · ' : ''}{fmtNext(p.nextAt)}
    </span>
  )
}
