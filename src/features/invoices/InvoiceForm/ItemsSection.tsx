/* Line items: description, qty, rate and the live amount. At least one row stays. */
import { Plus, X } from 'lucide-react'
import { useFieldArray, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { money, num } from '@/lib/format'
import { Section } from '../ui'
import { inputCls, useInvoiceForm } from './formContext'

const GRID = 'grid grid-cols-[1fr_56px_86px_26px] gap-1.5 min-[521px]:grid-cols-[1fr_64px_104px_96px_30px]'

function ItemAmount({ i }: { i: number }) {
  const { control } = useInvoiceForm()
  const [qty, rate] = useWatch({ control, name: [`items.${i}.qty`, `items.${i}.rate`] })
  return <span className="hidden pt-2.5 pr-0.5 text-right font-mono text-[13px] font-medium whitespace-nowrap text-ink-2 tabular min-[521px]:block" aria-label={`Amount for item ${i + 1}`}>{money(num(qty) * num(rate))}</span>
}

export function ItemsSection() {
  const { control, register, formState: { errors } } = useInvoiceForm()
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const rootErr = errors.items?.root?.message || errors.items?.message
  return (
    <Section title="Items">
      <div className={`${GRID} text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase`} aria-hidden>
        <span>Item</span><span>Qty</span><span>Rate (₹)</span><span className="hidden text-right min-[521px]:block">Amount</span><span />
      </div>
      <div className="flex flex-col gap-2">
        {fields.map((f, i) => {
          const e = errors.items?.[i]
          const msg = e?.desc?.message || e?.qty?.message
          return (
            <div key={f.id}>
              <div className={`${GRID} items-start`}>
                <label htmlFor={`it-d-${i}`} className="sr-only">Item {i + 1} description</label>
                <textarea id={`it-d-${i}`} rows={1} placeholder="e.g. 1 Story Reshare" className={`${inputCls} min-h-9 resize-y`} aria-invalid={!!e?.desc} {...register(`items.${i}.desc`)} />
                <label htmlFor={`it-q-${i}`} className="sr-only">Item {i + 1} quantity</label>
                <input id={`it-q-${i}`} type="text" inputMode="decimal" className={`${inputCls} px-2`} aria-invalid={!!e?.qty} {...register(`items.${i}.qty`)} />
                <label htmlFor={`it-r-${i}`} className="sr-only">Item {i + 1} rate</label>
                <input id={`it-r-${i}`} type="text" inputMode="decimal" placeholder="0.00" className={`${inputCls} px-2`} {...register(`items.${i}.rate`)} />
                <ItemAmount i={i} />
                <button type="button" onClick={() => remove(i)} disabled={fields.length < 2} aria-label={`Remove item ${i + 1}`}
                  className="grid h-9 w-full place-items-center rounded-lg text-muted-foreground hover:bg-[var(--s-lost-bg)] hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent">
                  <X className="size-[15px]" aria-hidden />
                </button>
              </div>
              {msg && <p className="mt-1 text-[12px] text-destructive">{msg}</p>}
            </div>
          )
        })}
      </div>
      {rootErr && <p className="m-0 text-[12px] text-destructive">{rootErr}</p>}
      <div><Button type="button" size="sm" variant="outline" onClick={() => append({ desc: '', qty: '1', rate: '' })}><Plus aria-hidden />Add item</Button></div>
    </Section>
  )
}
