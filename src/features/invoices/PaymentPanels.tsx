/* Detail page side panels: record a payment, and the payments list. */
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useStore, useWriter } from '@/data/store'
import { fmtDate, money, num, nowIso, round2, todayKey } from '@/lib/format'
import type { Invoice, Payment } from '@/types'
import { calcTotals, legacyPayments, paymentsPatch } from './model'
import { Panel, sectionTitleCls } from './ui'

function useUpdatePayments() {
  const { update } = useWriter()
  return async (inv: Invoice, payments: Payment[], msg: string) => {
    await update(`invoices/${inv.id}`, paymentsPatch(inv, payments))
    toast.success(msg)
  }
}

export function RecordPayment({ inv }: { inv: Invoice }) {
  const { meId, readOnly } = useStore()
  const updatePayments = useUpdatePayments()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayKey)
  const [busy, setBusy] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const t = calcTotals(inv)

  async function add(full: boolean) {
    const amt = full ? t.balance : num(amount)
    if (!(amt > 0)) { toast.error('Enter the amount received.'); amountRef.current?.focus(); return }
    if (amt > t.balance + 0.004) { toast.error(`That’s more than the balance due (${money(t.balance)}).`); amountRef.current?.focus(); return }
    const payments = [...legacyPayments(inv), { amount: round2(amt), date: date || todayKey(), at: nowIso(), by: meId }]
    setBusy(true)
    try {
      await updatePayments(inv, payments, full ? `Invoice #${inv.label} marked paid` : `Recorded ${money(amt)}`)
      setAmount('')
    } catch { /* toasted by the writer */ }
    setBusy(false)
  }

  return (
    <Panel className="flex flex-col gap-3 px-[18px] py-4">
      <h2 className={sectionTitleCls}>Record a payment</h2>
      <div className="flex gap-2 [&>*]:flex-1">
        <div className="min-w-0">
          <label htmlFor="dt-pay" className="sr-only">Amount received</label>
          <input id="dt-pay" ref={amountRef} type="text" inputMode="decimal" placeholder="₹ amount" className="field" value={amount}
            onChange={e => setAmount(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(false) } }} />
        </div>
        <div className="min-w-0">
          <label htmlFor="dt-pay-date" className="sr-only">Payment date</label>
          <input id="dt-pay-date" type="date" className="field" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 [&>*]:flex-1">
        <Button variant="outline" disabled={busy || readOnly} onClick={() => add(false)}>Add payment</Button>
        <Button disabled={busy || readOnly} onClick={() => add(true)}>Mark fully paid</Button>
      </div>
    </Panel>
  )
}

export function PaymentsList({ inv }: { inv: Invoice }) {
  const { readOnly } = useStore()
  const updatePayments = useUpdatePayments()
  // Shown with the same reconciliation used when changing them, so "remove" hits the right entry.
  const payments = legacyPayments(inv)
  if (!payments.length) return null
  const removeAt = (i: number) => {
    const p = legacyPayments(inv); p.splice(i, 1)
    updatePayments(inv, p, 'Payment removed').catch(() => {})
  }
  return (
    <Panel className="flex flex-col gap-3 px-[18px] py-4">
      <h2 className={sectionTitleCls}>Payments</h2>
      <ul className="m-0 flex flex-col gap-1.5 p-0 text-[13.5px]">
        {payments.map((p, i) => (
          <li key={`${p.at}-${i}`} className="flex items-center justify-between gap-3.5">
            <span className="text-muted-foreground">{fmtDate(p.date)}</span>
            <span className="flex items-center gap-2 font-mono tabular">
              {money(p.amount)}
              <button type="button" disabled={readOnly} onClick={() => removeAt(i)} aria-label={`Remove payment of ${money(p.amount)} on ${fmtDate(p.date)}`}
                className="font-sans text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50">remove</button>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
