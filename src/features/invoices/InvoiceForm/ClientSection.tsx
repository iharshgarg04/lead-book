/* Bill to: company (with past-client autofill), address, tax ids and contact. */
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ClientDetails } from '@/types'
import { Field, Section } from '../ui'
import { inputCls, upper, useInvoiceForm } from './formContext'
import { fillFromPast } from './schema'

export function ClientSection({ past, onPickLead }: { past: Map<string, ClientDetails>; onPickLead: () => void }) {
  const { register, getValues, setValue, formState: { errors } } = useInvoiceForm()
  const companyErr = errors.client?.company?.message

  /** Same as the legacy "change" handler: fill empty fields from the client's last invoice. */
  const autofill = () => {
    const filled = fillFromPast(getValues('client'), past)
    const keys = Object.keys(filled) as (keyof ClientDetails)[]
    if (!keys.length) return
    for (const k of keys) setValue(`client.${k}`, filled[k] || '', { shouldDirty: true })
    toast('Filled the client’s details from their last invoice')
  }

  return (
    <Section title="Bill to" action={<Button type="button" size="sm" variant="outline" onClick={onPickLead}>Pick from leads</Button>}>
      <Field label="Company name" htmlFor="ed-company" error={companyErr}>
        <input id="ed-company" type="text" list="ed-clients" autoComplete="off" className={inputCls} aria-invalid={!!companyErr} aria-required
          {...register('client.company', { onBlur: autofill })}
          onInput={e => {
            // Picking a suggestion from the datalist (no typed character) fills straight away.
            const it = (e.nativeEvent as InputEvent).inputType
            if (!it || it === 'insertReplacementText') autofill()
          }} />
        <datalist id="ed-clients">{[...past.values()].map(c => <option key={c.company} value={c.company} />)}</datalist>
      </Field>
      <Field label="Billing address" htmlFor="ed-address">
        <textarea id="ed-address" rows={3} className={inputCls} {...register('client.address')} />
      </Field>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 min-[521px]:grid-cols-2">
        <Field label="GST number" hint="optional" htmlFor="ed-gstin">
          <input id="ed-gstin" type="text" autoComplete="off" className={`${inputCls} uppercase`} {...register('client.gstin', { setValueAs: upper })} />
        </Field>
        <Field label="PAN number" hint="optional" htmlFor="ed-pan">
          <input id="ed-pan" type="text" autoComplete="off" className={`${inputCls} uppercase`} {...register('client.pan', { setValueAs: upper })} />
        </Field>
        <Field label="Email" hint="not printed" htmlFor="ed-email">
          <input id="ed-email" type="email" className={inputCls} {...register('client.email')} />
        </Field>
        <Field label="Phone" hint="not printed" htmlFor="ed-phone">
          <input id="ed-phone" type="tel" className={inputCls} {...register('client.phone')} />
        </Field>
      </div>
    </Section>
  )
}
