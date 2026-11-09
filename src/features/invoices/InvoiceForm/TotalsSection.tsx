/* GST rate, amount received and the running totals. */
import { useWatch } from 'react-hook-form'
import { Select } from '@/components/common'
import { money, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { calcTotals, TAX_RATES } from '../model'
import { Field, Section } from '../ui'
import { inputCls, useInvoiceForm } from './formContext'

function TotalsTable() {
  const { control } = useInvoiceForm()
  const [type, items, taxRate, paid] = useWatch({ control, name: ['type', 'items', 'taxRate', 'paid'] })
  const t = calcTotals({ type, items: items.map(i => ({ desc: i.desc, qty: num(i.qty), rate: num(i.rate) })), taxRate: num(taxRate), paid: num(paid) })
  const rows: [string, number, boolean][] = [['Subtotal', t.subtotal, false]]
  if (type === 'gst') rows.push([`GST (${t.rate}%)`, t.tax, false])
  rows.push(['Total', t.total, true])
  if (t.paid > 0) rows.push(['Received', t.paid, false])
  rows.push(['Balance due', t.balance, true])
  return (
    <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-[18px] gap-y-1.5 text-[13.5px]" aria-live="polite">
      {rows.map(([k, v, big]) => (
        <div key={k} className="contents">
          <dt className={cn('text-right text-muted-foreground', big && 'font-bold text-foreground')}>{k}</dt>
          <dd className={cn('m-0 text-right font-mono tabular', big && 'font-bold')}>{money(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function TotalsSection() {
  const { control, register } = useInvoiceForm()
  const [type, taxRate] = useWatch({ control, name: ['type', 'taxRate'] })
  const rates = TAX_RATES.map(String)
  if (!rates.includes(taxRate)) rates.push(taxRate)
  return (
    <Section title="Totals">
      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 min-[521px]:grid-cols-2">
        {type === 'gst' && (
          <Field label="GST rate" htmlFor="ed-tax">
            <Select id="ed-tax" className="w-full" {...register('taxRate')}>{rates.map(r => <option key={r} value={r}>{r}%</option>)}</Select>
          </Field>
        )}
        <Field label="Amount received (₹)" hint="leave 0 if unpaid" htmlFor="ed-paid">
          <input id="ed-paid" type="text" inputMode="decimal" className={inputCls} {...register('paid')} />
        </Field>
      </div>
      <TotalsTable />
    </Section>
  )
}
