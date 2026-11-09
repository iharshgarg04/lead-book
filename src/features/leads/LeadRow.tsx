/* A row in the All-leads list: an 8-column grid on desktop, 6 on tablets, a compact card on phones. */
import type { KeyboardEvent } from 'react'
import { PackagePill, RatingBadge, StatusPill, TimelinePill } from '@/components/common'
import { fmtPhone, monthLabelOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'
import { DuePill } from './bits'
import { leadName, shortMonth } from './helpers'
import { lastText } from './model'

/** Column template shared by the header and the rows. */
export const ROW_GRID = cn(
  'grid items-center gap-x-3 gap-y-1.5 grid-cols-[1fr_auto] px-3.5 py-3',
  'min-[781px]:gap-3 min-[781px]:px-4 min-[781px]:py-[11px] min-[781px]:grid-cols-[minmax(160px,1.6fr)_146px_118px_80px_128px_124px]',
  'min-[1121px]:grid-cols-[minmax(170px,1.5fr)_152px_122px_84px_132px_128px_minmax(150px,2fr)_50px]',
)
/** Phone placement → desktop auto placement. */
const at = (pos: string) => cn(pos, 'min-[781px]:col-auto min-[781px]:row-auto min-[781px]:justify-self-auto')
const DASH = <span className="text-xs text-muted-foreground">—</span>

export function LeadRowHead() {
  return (
    <div aria-hidden className={cn(ROW_GRID, 'hidden bg-muted py-[9px] text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase min-[781px]:grid min-[781px]:py-[9px]')}>
      <div>Lead · rating</div><div>Phone</div><div>Package</div><div>Go-live</div><div>Status</div><div>Follow-up</div>
      <div className="hidden min-[1121px]:block">Latest</div><div className="hidden min-[1121px]:block">Month</div>
    </div>
  )
}

export function LeadRow({ l, onOpen }: { l: Lead; onOpen: (path: string) => void }) {
  const name = leadName(l)
  const last = lastText(l)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(l.path) }
  }
  return (
    <div role="listitem" tabIndex={0} aria-label={name} onClick={() => onOpen(l.path)} onKeyDown={onKeyDown}
      className={cn(ROW_GRID, 'cursor-pointer border-t hover:bg-muted')}>
      <div className={at('col-start-1 row-start-1 min-w-0')}>
        <strong className="block truncate font-semibold">
          {l.rating && <RatingBadge r={l.rating} className="relative -top-px mr-1.5" />}{name}
        </strong>
        <span className="block truncate text-[12.5px] text-muted-foreground">{l.name ? l.company || '—' : l.email || '—'}</span>
      </div>
      <div className={at('col-start-1 row-start-2 font-mono text-[13px] text-ink-2 tabular')}>{fmtPhone(l.phone) || '—'}</div>
      <div className={at('col-start-1 row-start-3')}>{l.package ? <PackagePill p={l.package} /> : DASH}</div>
      <div className={at('col-start-2 row-start-3 justify-self-end')}>{l.timeline ? <TimelinePill t={l.timeline} /> : DASH}</div>
      <div className={at('col-start-2 row-start-1 justify-self-end')}><StatusPill s={l.status || 'new'} /></div>
      <div className={at('col-start-2 row-start-2 justify-self-end max-[780px]:empty:hidden')}><DuePill l={l} /></div>
      <div title={last} className={at('col-span-2 col-start-1 row-start-4 line-clamp-1 text-[13px] text-ink-2 max-[780px]:empty:hidden min-[781px]:hidden min-[1121px]:block min-[1121px]:truncate')}>{last}</div>
      <div title={monthLabelOf(l.month || '2000-01')} className="hidden text-xs text-muted-foreground min-[1121px]:block">{shortMonth(l.month)}</div>
    </div>
  )
}
