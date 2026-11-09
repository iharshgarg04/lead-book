/* A lead card on the Today view (design: Today · A — name first, call action on the card). */
import { Phone } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { PackagePill, RatingBadge, StatusPill, TimelinePill } from '@/components/common'
import { digits, fmtPhone } from '@/lib/format'
import type { Lead } from '@/types'
import { Btn, btn, DuePill, SrOnly, Tag, WhatsAppIcon } from './bits'
import { leadName, triesLabel } from './helpers'
import { CLOSED, lastText } from './model'

const INTERACTIVE = 'a,button,input,select,textarea,label'

export function LeadCard({ l, onOpen, onNotPicked, readOnly }: {
  l: Lead
  onOpen: (path: string) => void
  onNotPicked: (path: string) => void
  readOnly: boolean
}) {
  const name = leadName(l)
  const last = lastText(l)
  const wa = digits(l.phone)
  const onClick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(INTERACTIVE)) onOpen(l.path) }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(l.path) }
  }
  return (
    <article tabIndex={0} aria-label={name} onClick={onClick} onKeyDown={onKeyDown}
      className="flex min-w-0 cursor-pointer flex-col gap-[9px] rounded-xl border bg-card px-[15px] pt-3.5 pb-3 transition-[border-color,box-shadow] hover:border-input hover:shadow-[0_1px_2px_rgba(20,22,40,.05),0_4px_14px_rgba(20,22,40,.06)]">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 font-display text-[17px] leading-[1.2] font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">{name}</h3>
          <div className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
            {l.name && l.company ? l.company : ''}
            {l.name && l.company && l.timeline ? ' · ' : ''}
            <TimelinePill t={l.timeline} />
          </div>
        </div>
        <DuePill l={l} />
      </div>
      <div className="flex min-h-[22px] flex-wrap items-center gap-1.5">
        <StatusPill s={l.status || 'new'} />
        <RatingBadge r={l.rating} />
        {(l.attempts || 0) > 0 && <Tag>{triesLabel(l.attempts)}</Tag>}
        <span className="flex-1" />
        <PackagePill p={l.package} />
      </div>
      {last && <p className="m-0 line-clamp-2 rounded-lg bg-muted px-2.5 py-[7px] text-[13px] text-ink-2">{last}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-auto font-mono text-[13px] text-ink-2 tabular">{fmtPhone(l.phone) || l.email || ''}</span>
        {l.phone && (
          <a className={btn({ variant: 'primary', size: 'sm' })} href={`tel:${l.phone}`} aria-label={`Call ${name}`}>
            <Phone aria-hidden />Call
          </a>
        )}
        {wa && (
          <a className={btn({ variant: 'wa', size: 'sm' })} href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" title="Open WhatsApp chat">
            <WhatsAppIcon /><SrOnly>WhatsApp {name}</SrOnly>
          </a>
        )}
        {!CLOSED.has(l.status) && (
          <Btn size="sm" title="Log: not picked" aria-label={`np: log not picked for ${name}`} disabled={readOnly} onClick={() => onNotPicked(l.path)}>np</Btn>
        )}
        <Btn size="sm" aria-label={`Open ${name}`} onClick={() => onOpen(l.path)}>Open</Btn>
      </div>
    </article>
  )
}
