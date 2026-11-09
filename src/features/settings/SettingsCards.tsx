/* Settings panels: seller profile, logo & tax, account & backup. */
import { Download, RotateCcw, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'
import { Select } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/data/auth'
import { useStore } from '@/data/store'
import { TAX_RATES } from '@/features/invoices/model'
import { Field, Panel, Section } from '@/features/invoices/ui'
import { resizeImage } from '@/lib/files'
import { DEFAULT_LOGO } from '@/lib/settings'
import type { InvoiceType } from '@/types'
import { downloadBackup } from './backup'
import type { SettingsFormOutput, SettingsFormValues } from './schema'

const useSettingsForm = () => useFormContext<SettingsFormValues, unknown, SettingsFormOutput>()
const inputCls = 'field aria-[invalid=true]:border-destructive'

export function ProfileCard({ type, title, sub }: { type: InvoiceType; title: string; sub: string }) {
  const { register, formState: { errors } } = useSettingsForm()
  const id = (k: string) => `s-${type}-${k}`
  const p = `profiles.${type}` as const
  const nextErr = errors.next?.[type]?.message
  return (
    <Panel className="overflow-hidden">
      <Section title={title}>
        <p className="m-0 text-[12.5px] text-muted-foreground">{sub}</p>
        <Field label="Legal name" htmlFor={id('legal')}>
          <input id={id('legal')} type="text" className={inputCls} placeholder="e.g. Example Studio Pvt Ltd" {...register(`${p}.legalName`)} />
        </Field>
        {type === 'gst' && (
          <Field label="GST number" htmlFor={id('gstin')}>
            <input id={id('gstin')} type="text" className={`${inputCls} uppercase`} autoComplete="off" {...register(`${p}.gstin`)} />
          </Field>
        )}
        <Field label="Address" htmlFor={id('addr')}>
          <textarea id={id('addr')} rows={3} className={inputCls} {...register(`${p}.address`)} />
        </Field>
        <Field label="PAN number" htmlFor={id('pan')}>
          <input id={id('pan')} type="text" className={`${inputCls} uppercase`} autoComplete="off" {...register(`${p}.pan`)} />
        </Field>
        <Field label="Terms / bank details" hint="printed at the bottom" htmlFor={id('terms')}>
          <textarea id={id('terms')} rows={6} className={inputCls} {...register(`${p}.terms`)} />
        </Field>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 min-[521px]:grid-cols-2">
          <Field label="Number prefix" hint="e.g. NG-" htmlFor={id('prefix')}>
            <input id={id('prefix')} type="text" className={inputCls} autoComplete="off" {...register(`${p}.prefix`)} />
          </Field>
          <Field label="Next number" htmlFor={id('next')} error={nextErr}>
            <input id={id('next')} type="text" inputMode="numeric" className={inputCls} aria-invalid={!!nextErr} {...register(`next.${type}`)} />
          </Field>
        </div>
      </Section>
    </Panel>
  )
}

export function LogoTaxCard({ logo, onLogo }: { logo: string; onLogo: (v: string) => void }) {
  const { register } = useSettingsForm()
  const { readOnly } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  async function pick(file: File | undefined) {
    if (!file) return
    try {
      const url = await resizeImage(file)
      if (url.length > 700000) { toast.error('That image is too large — use one under 500 KB.'); return }
      onLogo(url); toast('Logo ready — click Save settings')
    } catch { toast.error('Couldn’t read that image. Use a PNG or JPG.') }
  }
  return (
    <Panel className="overflow-hidden">
      <Section title="Logo & tax">
        <img src={logo || DEFAULT_LOGO} alt="Invoice logo" className="block w-[180px] rounded-lg bg-side" />
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} id="s-logo" type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden
            onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
          <Button type="button" size="sm" variant="outline" disabled={readOnly} onClick={() => fileRef.current?.click()}><Upload aria-hidden />Change logo</Button>
          {logo && (
            <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={readOnly}
              onClick={() => { onLogo(''); toast('Original logo will be used — click Save settings') }}>
              <RotateCcw aria-hidden />Use original logo
            </Button>
          )}
        </div>
        <Field label="Default GST rate" htmlFor="s-tax">
          <Select id="s-tax" className="w-full" {...register('taxRate')}>{TAX_RATES.map(r => <option key={r} value={String(r)}>{r}%</option>)}</Select>
        </Field>
      </Section>
    </Panel>
  )
}

export function AccountCard() {
  const { user, signOut } = useAuth()
  const { months, leads, invoices, settings, counters } = useStore()
  const backup = () => {
    const n = downloadBackup(months, leads, invoices, settings, counters)
    toast.success(`Backup saved: ${n.leads} leads, ${n.invoices} invoices`)
  }
  return (
    <Panel className="overflow-hidden">
      <Section title="Account & backup">
        <p className="m-0 text-[12.5px] text-muted-foreground">Signed in as <b className="text-foreground">{user?.email || '—'}</b>.</p>
        <Button type="button" variant="outline" className="self-start" onClick={backup}><Download aria-hidden />Download full backup (.json)</Button>
        <p className="m-0 text-[12.5px] text-muted-foreground">Includes every lead with its history and every invoice. Keep one every month; restore leads from Leads → Import.</p>
        <Button type="button" size="sm" variant="ghost" className="self-start text-muted-foreground" onClick={signOut}>Sign out</Button>
      </Section>
    </Panel>
  )
}
