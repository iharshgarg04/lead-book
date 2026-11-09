/* "Pick from leads": search the lead book and use one lead for the Bill to block. */
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, RatingBadge, StatusPill } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/data/store'
import { displayName, newestCmp } from '@/features/leads/model'
import { digits } from '@/lib/format'
import type { Lead } from '@/types'

export function PickLeadDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (v: boolean) => void; onPick: (l: Lead) => void }) {
  const { leads } = useStore()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase(), qd = digits(s)
    return leads.filter(l => !s || (qd.length >= 4 ? digits(l.phone).includes(qd) : l.hay.includes(s)))
      .sort(newestCmp).slice(0, 40)
  }, [leads, q])

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setQ('') }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Pick a lead</DialogTitle>
          <DialogDescription>Fills the company name, email and phone from the lead.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-[11px] size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor="pl-q" className="sr-only">Search leads</label>
          <input id="pl-q" type="search" autoFocus className="field pl-[34px]" placeholder="Search name, brand or phone…" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <ul className="max-h-[50vh] overflow-auto rounded-xl border bg-card" aria-label="Leads">
          {shown.length ? shown.map(l => (
            <li key={l.path} className="border-t first:border-t-0">
              <button type="button" onClick={() => onPick(l)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-muted">
                <span className="min-w-0">
                  <strong className="flex items-center gap-1.5 truncate font-semibold"><RatingBadge r={l.rating} />{displayName(l)}</strong>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{l.company || l.email || ''}</span>
                </span>
                <StatusPill s={l.status} />
              </button>
            </li>
          )) : <li><EmptyState title="No leads match" className="border-0" /></li>}
        </ul>
        <DialogFooter><DialogClose asChild><Button variant="outline">Close</Button></DialogClose></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
