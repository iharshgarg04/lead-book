/* Today · A: the dark "Next call" strip at the top of the queue. */
import { Phone } from 'lucide-react'
import { digits, fmtNext, fmtPhone } from '@/lib/format'
import type { Lead } from '@/types'
import { WhatsAppIcon } from './bits'
import { leadName } from './helpers'
import { dueState, lastText, PKG, RMAP, SMAP } from './model'

/** Why this lead is at the top of the queue, in the caller's words. */
function reason(l: Lead) {
  const parts: string[] = []
  const ds = dueState(l)
  const label = SMAP[l.status]?.label || 'New'
  if (ds === 'overdue') parts.push(`Overdue ${label.toLowerCase()} from ${fmtNext(l.nextAt)}`)
  else if (ds === 'today') parts.push(`${label} due ${fmtNext(l.nextAt).toLowerCase()}`)
  else parts.push(l.status === 'new' ? 'Never called' : label)
  if (l.rating) parts.push(RMAP[l.rating].label)
  if (l.package && PKG[l.package]) parts.push(`${PKG[l.package].label} ${PKG[l.package].ads} ads`)
  return parts.join(' · ')
}

export function NextCallStrip({ l, total, onOpen }: { l: Lead; total: number; onOpen: (path: string) => void }) {
  const name = leadName(l)
  const wa = digits(l.phone)
  const note = lastText(l)
  return (
    <section aria-label="Next call" className="mt-5 flex flex-wrap items-center gap-[18px] rounded-[14px] bg-side px-5 py-[18px] text-[#ecedf5]">
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-lime uppercase">Next call · 1 of {total}</span>
        <span className="font-display text-2xl leading-tight font-bold [overflow-wrap:anywhere]">
          {name}
          {l.name && l.company && <span className="text-lg font-semibold text-side-ink"> · {l.company}</span>}
        </span>
        <span className="text-[13.5px] text-[#c9cede]">
          {reason(l)}{note ? <> · <q>{note}</q></> : null}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 max-sm:w-full">
        {l.phone && (
          <a href={`tel:${l.phone}`} className="inline-flex h-[46px] items-center justify-center gap-2 rounded-[10px] bg-lime px-5 max-sm:w-full text-[14.5px] font-bold text-side no-underline hover:bg-side-hi">
            <Phone className="size-4" aria-hidden />Call <span className="font-mono font-semibold tabular">{fmtPhone(l.phone)}</span>
          </a>
        )}
        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-[46px] items-center justify-center gap-2 rounded-[10px] border border-[#3c4547] px-4 max-sm:flex-1 text-sm font-semibold text-[#ecedf5] no-underline hover:border-side-ink">
            <WhatsAppIcon className="size-4" />WhatsApp
          </a>
        )}
        <button type="button" onClick={() => onOpen(l.path)}
          className="inline-flex h-[46px] items-center justify-center rounded-[10px] border border-[#3c4547] bg-transparent px-4 max-sm:flex-1 text-sm font-semibold text-[#ecedf5] hover:border-side-ink">
          Log outcome
        </button>
      </div>
    </section>
  )
}
