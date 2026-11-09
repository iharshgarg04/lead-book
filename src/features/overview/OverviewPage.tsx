import { useMemo } from 'react'
import { Link } from 'react-router'
import { EmptyState, PageHeader, RatingBadge, StatTile, StatusPill } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/data/auth'
import { useStore } from '@/data/store'
import { calcTotals } from '@/features/invoices/model'
import { CLOSED, displayName, dueState, nextCmp } from '@/features/leads/model'
import { MO, money, todayKey, WD } from '@/lib/format'
import type { Invoice, Lead } from '@/types'

function greet(name: string) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
}

function Card({ title, link, children }: { title: string; link: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-xl border bg-card px-[18px] py-4">
      <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
        {title}
        <Link to={link.to} className="ml-auto font-sans text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">{link.label} →</Link>
      </h2>
      <div className="flex flex-col divide-y">{children}</div>
    </section>
  )
}

const LeadLine = ({ l }: { l: Lead }) => (
  <Link to={`/leads?lead=${encodeURIComponent(l.path)}`} className="group flex items-center gap-2.5 py-2 text-[13.5px]">
    <RatingBadge r={l.rating} />
    <span className="min-w-0 flex-1 truncate group-hover:underline">
      {displayName(l)}{l.company && l.name && <span className="text-muted-foreground"> · {l.company}</span>}
    </span>
    <StatusPill s={l.status} />
  </Link>
)
const InvoiceLine = ({ i, due }: { i: Invoice; due?: boolean }) => {
  const t = calcTotals(i)
  return (
    <Link to={`/invoices/${i.id}`} className="group flex items-center gap-2.5 py-2 text-[13.5px]">
      <span className="font-mono text-[13px]">#{i.label}</span>
      <span className="min-w-0 flex-1 truncate group-hover:underline">{i.client?.company}</span>
      <span className={`font-mono text-[13px] tabular ${due ? 'text-warn' : ''}`}>{money(due ? t.balance : t.total)}</span>
    </Link>
  )
}

export default function OverviewPage() {
  const { user } = useAuth()
  const { leads, invoices, ready, invoicesReady } = useStore()
  const d = useMemo(() => {
    const open = leads.filter(l => !CLOSED.has(l.status))
    const due = open.filter(l => ['overdue', 'today'].includes(dueState(l) || '')).sort(nextCmp)
    const hot = open.filter(l => l.rating === 'hot').sort(nextCmp)
    const fresh = leads.filter(l => l.status === 'new' && !l.nextAt)
    const live = invoices.filter(i => !i.cancelled)
    const mk = todayKey().slice(0, 7)
    const month = live.filter(i => (i.date || '').startsWith(mk))
    const unpaid = live.filter(i => calcTotals(i).balance > 0).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    return {
      due, hot, fresh, month, unpaid,
      billedMonth: month.reduce((a, i) => a + calcTotals(i).total, 0),
      outstanding: unpaid.reduce((a, i) => a + calcTotals(i).balance, 0),
      recent: [...invoices].sort((a, b) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '')).slice(0, 6),
    }
  }, [leads, invoices])
  const t = new Date()
  const first = (user?.displayName || '').split(' ')[0]
  const dash = (v: React.ReactNode, ok: boolean) => (ok ? v : '—')

  return (
    <>
      <PageHeader
        title={greet(first)}
        sub={`${WD[t.getDay()]} ${t.getDate()} ${MO[t.getMonth()]} · Pages Production`}
        actions={<><Button variant="outline" asChild><Link to="/leads">Open call list</Link></Button><Button asChild><Link to="/invoices/new">New invoice</Link></Button></>}
      />
      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
        <StatTile to="/leads" label="Calls due today" value={dash(d.due.length, ready)} detail="overdue + today" tone={d.due.length ? 'warn' : undefined} />
        <StatTile to="/leads" label="Hot leads" value={dash(d.hot.length, ready)} detail={`${d.fresh.length} never called`} tone="hot" />
        <StatTile to="/invoices" label="Billed this month" value={dash(money(d.billedMonth), invoicesReady)} detail={`${d.month.length} invoice${d.month.length === 1 ? '' : 's'}`} />
        <StatTile to="/invoices" label="Outstanding" value={dash(money(d.outstanding), invoicesReady)} detail={`${d.unpaid.length} unpaid invoice${d.unpaid.length === 1 ? '' : 's'}`} tone={d.outstanding > 0 ? 'warn' : undefined} />
      </div>
      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-4">
        <Card title="Calls due today" link={{ to: '/leads', label: 'All leads' }}>
          {d.due.length ? d.due.slice(0, 7).map(l => <LeadLine key={l.path} l={l} />) : <p className="py-1.5 text-[13.5px] text-muted-foreground">{ready ? 'Nothing due — start on fresh leads.' : 'Loading…'}</p>}
        </Card>
        <Card title="Hot leads" link={{ to: '/leads/all?rate=hot', label: 'View' }}>
          {d.hot.length ? d.hot.slice(0, 7).map(l => <LeadLine key={l.path} l={l} />) : <p className="py-1.5 text-[13.5px] text-muted-foreground">{ready ? 'No hot leads yet — rate leads after a call.' : 'Loading…'}</p>}
        </Card>
        <Card title="Unpaid invoices" link={{ to: '/invoices?status=unpaid', label: 'View' }}>
          {d.unpaid.length ? d.unpaid.slice(0, 7).map(i => <InvoiceLine key={i.id} i={i} due />) : <p className="py-1.5 text-[13.5px] text-muted-foreground">{invoicesReady ? 'All invoices are paid.' : 'Loading…'}</p>}
        </Card>
        <Card title="Recent invoices" link={{ to: '/invoices/new', label: 'New' }}>
          {d.recent.length ? d.recent.map(i => <InvoiceLine key={i.id} i={i} />) : invoicesReady ? <EmptyState title="No invoices yet" className="border-0 py-2">Create the first one from Invoices.</EmptyState> : <p className="py-1.5 text-[13.5px] text-muted-foreground">Loading…</p>}
        </Card>
      </div>
    </>
  )
}
