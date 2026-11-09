/* Business details printed on invoices, numbering, logo and backups. */
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useStore, useWriter } from '@/data/store'
import { TYPE_LABEL, INVOICE_TYPES } from '@/features/invoices/model'
import { nowIso } from '@/lib/format'
import type { Counters } from '@/types'
import { settingsSchema, toFormValues, type SettingsFormOutput, type SettingsFormValues } from './schema'
import { AccountCard, LogoTaxCard, ProfileCard } from './SettingsCards'

export default function SettingsPage() {
  const { settings, counters, invoices, readOnly, meId } = useStore()
  const writer = useWriter()
  const live = useMemo(() => toFormValues(settings, counters), [settings, counters])
  const form = useForm<SettingsFormValues, unknown, SettingsFormOutput>({ resolver: zodResolver(settingsSchema), defaultValues: live })
  const { handleSubmit, reset, setError, formState: { isDirty, isSubmitting } } = form
  const [logo, setLogo] = useState(settings.logo)
  const [logoDirty, setLogoDirty] = useState(false)
  const dirty = isDirty || logoDirty

  // Live updates from other devices replace the form only while nothing is being edited.
  useEffect(() => {
    if (dirty) return
    reset(live)
    setLogo(settings.logo)
  }, [live, settings.logo]) // eslint-disable-line react-hooks/exhaustive-deps

  const onLogo = (v: string) => { setLogo(v); setLogoDirty(true) }

  async function save(v: SettingsFormOutput) {
    // A changed next number must be above every existing invoice number in that series.
    const changed: Partial<Counters> = {}
    for (const t of INVOICE_TYPES) {
      const n = v.next[t]
      if (n === counters[t]) continue
      const pre = v.profiles[t].prefix || ''
      const taken = invoices.filter(i => i.type === t && String(i.label).startsWith(pre)).map(i => Number(i.number) || 0)
      if (taken.some(x => x >= n)) {
        const msg = `${TYPE_LABEL[t]} invoice ${pre}${Math.max(...taken)} already exists — the next number must be higher.`
        setError(`next.${t}`, { message: msg }, { shouldFocus: true })
        toast.error(msg)
        return
      }
      changed[t] = n
    }
    try {
      await writer.set('settings/business', { profiles: v.profiles, taxRate: v.taxRate, logo: logo || '', updatedAt: nowIso(), updatedBy: meId })
      if (Object.keys(changed).length) await writer.set('settings/counters', changed, { merge: true })
      reset(toFormValues({ ...settings, profiles: v.profiles, taxRate: v.taxRate, logo }, { ...counters, ...changed }))
      setLogoDirty(false)
      toast.success('Settings saved')
    } catch { /* toasted by the writer */ }
  }

  return (
    <FormProvider {...form}>
      <form id="settings-form" noValidate onSubmit={handleSubmit(save)} aria-label="Settings">
        <PageHeader title="Settings" sub="Business details printed on invoices, numbering and backups"
          actions={<Button type="submit" disabled={readOnly || isSubmitting}>{isSubmitting ? 'Saving…' : 'Save settings'}</Button>} />
        <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-4">
          <ProfileCard type="gst" title="GST invoices" sub={`Seller details printed on GST invoices (with ${settings.taxRate}% tax by default).`} />
          <ProfileCard type="nongst" title="Non-GST invoices" sub="Seller details printed on invoices without GST — the GST number and tax line are left out." />
          <LogoTaxCard logo={logo} onLogo={onLogo} />
          <AccountCard />
        </div>
        {dirty && <p className="mt-3 text-[12.5px] text-muted-foreground" role="status">You have unsaved changes.</p>}
      </form>
    </FormProvider>
  )
}
