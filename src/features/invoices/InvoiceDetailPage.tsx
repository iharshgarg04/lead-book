/* One invoice: preview, totals, payments and actions. */
import { Download } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { InvoiceStatusPill, InvoiceTypeBadge, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useStore, useWriter } from '@/data/store'
import { fmtDate, money } from '@/lib/format'
import type { Invoice } from '@/types'
import { useInvoiceDownloads } from './downloads'
import { InvoicePreview } from './InvoicePreview'
import { calcTotals, fmtStamp, invoiceStatus, toPrintable } from './model'
import { PaymentsList, RecordPayment } from './PaymentPanels'
import { InvoiceNotFound, KeyValues, LoadingBlock, Panel, useScrollTop } from './ui'

export default function InvoiceDetailPage() {
  const { id } = useParams()
  const { getInvoice, invoicesReady } = useStore()
  const inv = getInvoice(id)
  const [deleted, setDeleted] = useState(false)
  useScrollTop(id)
  if (!inv) return deleted ? null : invoicesReady ? <InvoiceNotFound /> : <LoadingBlock msg="Loading invoice…" />
  return <InvoiceDetail inv={inv} onDeleting={setDeleted} />
}

function InvoiceDetail({ inv, onDeleting }: { inv: Invoice; onDeleting: (v: boolean) => void }) {
  const { settings, getLead, readOnly } = useStore()
  const { update, remove } = useWriter()
  const { downloadOne } = useInvoiceDownloads()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const t = calcTotals(inv), st = invoiceStatus(inv)
  const lead = inv.leadPath ? getLead(inv.leadPath) : undefined

  const rows: [React.ReactNode, React.ReactNode, boolean?][] = [['Date', fmtDate(inv.date)]]
  if (inv.dueDate) rows.push(['Due', fmtDate(inv.dueDate)])
  rows.push(['Subtotal', money(t.subtotal)])
  if (inv.type === 'gst') rows.push([`GST (${t.rate}%)`, money(t.tax)])
  rows.push(['Total', money(t.total), true], ['Received', money(t.paid)], ['Balance due', money(st === 'cancelled' ? 0 : t.balance), true])

  function toggleCancelled() {
    const cancelled = !inv.cancelled
    update(`invoices/${inv.id}`, { cancelled, status: cancelled ? 'cancelled' : invoiceStatus({ ...inv, cancelled: false }) })
      .then(() => toast.success(cancelled ? `Invoice #${inv.label} cancelled` : `Invoice #${inv.label} restored`)).catch(() => {})
  }
  async function doDelete() {
    // Set first: the local snapshot drops the invoice before the write resolves.
    onDeleting(true)
    try {
      await remove(`invoices/${inv.id}`)
      toast.success(`Deleted invoice #${inv.label}`)
      navigate('/invoices')
    } catch { onDeleting(false) /* toasted by the writer */ }
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Invoices', to: '/invoices' }, { label: `#${inv.label}` }]}
        title={`Invoice #${inv.label}`}
        sub={<span className="flex flex-wrap items-center gap-2"><InvoiceTypeBadge t={inv.type} /><InvoiceStatusPill st={st} /><span>{inv.client?.company || ''}</span></span>}
        actions={<>
          <Button variant="outline" asChild><Link to={`/invoices/${inv.id}/edit`}>Edit</Link></Button>
          <Button onClick={() => downloadOne(inv)}><Download aria-hidden />Download PDF</Button>
        </>}
      />
      <div className="mt-[18px] grid grid-cols-1 items-start gap-[22px] min-[1000px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0"><InvoicePreview invoice={toPrintable(inv, settings.logo || '')} /></div>
        <aside className="-order-1 flex flex-col gap-3 min-[1000px]:order-none" aria-label="Invoice summary and actions">
          <Panel className="px-[18px] py-4"><KeyValues rows={rows} /></Panel>
          {st !== 'cancelled' && t.balance > 0 && <RecordPayment inv={inv} />}
          <PaymentsList inv={inv} />
          <Panel className="flex flex-col gap-2 px-[18px] py-4">
            <Button variant="outline" asChild><Link to={`/invoices/new?from=${encodeURIComponent(inv.id)}`}>Duplicate as new invoice</Link></Button>
            {lead && <Button variant="outline" asChild><Link to={`/leads?lead=${encodeURIComponent(lead.path)}`}>Open lead</Link></Button>}
            <Button variant="outline" disabled={readOnly} onClick={toggleCancelled}>{inv.cancelled ? 'Restore invoice' : 'Mark as cancelled'}</Button>
            <Button variant="outline" className="text-destructive hover:text-destructive" disabled={readOnly} onClick={() => setConfirmDelete(true)} aria-expanded={confirmDelete}>Delete invoice</Button>
            {confirmDelete && (
              <div role="alert" className="mt-1 flex flex-wrap items-center gap-2 rounded-[9px] bg-[var(--s-lost-bg)] px-3 py-2.5 text-[13px] text-foreground">
                Delete invoice #{inv.label} for good? Its number won’t be reused. Use “Mark as cancelled” to keep a record instead.
                <span className="flex-1" />
                <Button size="sm" variant="outline" autoFocus onClick={() => setConfirmDelete(false)}>Keep</Button>
                <Button size="sm" onClick={doDelete}>Delete</Button>
              </div>
            )}
            <p className="m-0 text-[12.5px] text-muted-foreground">
              Created {fmtStamp(inv.createdAt)}{inv.updatedAt && inv.updatedAt !== inv.createdAt ? ` · updated ${fmtStamp(inv.updatedAt)}` : ''}
            </p>
          </Panel>
        </aside>
      </div>
    </>
  )
}
