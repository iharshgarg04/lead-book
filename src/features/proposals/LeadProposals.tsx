/* Lead drawer section: this lead's proposals and an "Add proposal" button. */
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '@/data/store'
import { Btn, SecTitle } from '@/features/leads/bits'
import { DrawerSection } from '@/features/leads/DrawerSections'
import { fmtDate } from '@/lib/format'
import type { Lead } from '@/types'
import { rupees } from './model'
import { ProposalDialog } from './ProposalDialog'
import { FollowLabel, NegotiationPill } from './bits'

export function LeadProposals({ l, readOnly }: { l: Lead; readOnly: boolean }) {
  const { proposals } = useStore()
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const mine = proposals.filter(p => p.leadPath === l.path).sort((a, b) => b.sentDate.localeCompare(a.sentDate))
  const current = editing?.id ? mine.find(p => p.id === editing.id) || null : null
  return (
    <DrawerSection label="Proposals">
      <SecTitle>
        Proposals{mine.length > 0 && <span className="font-mono tracking-normal">{mine.length}</span>}
        <Btn size="sm" className="ml-auto tracking-normal normal-case" disabled={readOnly} onClick={() => setEditing({ id: null })}><Plus aria-hidden />Add proposal</Btn>
      </SecTitle>
      {mine.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {mine.map(p => (
            <li key={p.id}>
              <button type="button" onClick={() => setEditing({ id: p.id })}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-[10px] border px-3 py-2 text-left hover:border-input hover:bg-muted">
                <span className="font-mono text-[14px] font-semibold tabular">{rupees(p.amount)} <span className="font-sans text-[12.5px] font-normal text-muted-foreground">· {p.videos} videos · sent {fmtDate(p.sentDate)}</span></span>
                <NegotiationPill s={p.negotiation} />
                <span className="text-[12.5px] text-muted-foreground">{p.expectedClose ? `Closing ${fmtDate(p.expectedClose)}` : 'No closing date'}</span>
                <span className="justify-self-end"><FollowLabel p={p} /></span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-[13px] text-muted-foreground">No proposal sent yet. Add one when you share pricing.</p>}
      <ProposalDialog open={!!editing} proposal={current} lead={l} onClose={() => setEditing(null)} />
    </DrawerSection>
  )
}
