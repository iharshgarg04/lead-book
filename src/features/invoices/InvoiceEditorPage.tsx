/* New / edit / duplicate / from-lead invoice editor with a live preview. */
import { zodResolver } from '@hookform/resolvers/zod'
import { Download } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useStore } from '@/data/store'
import { displayName } from '@/features/leads/model'
import type { Invoice, InvoiceType, Lead } from '@/types'
import { ClientSection } from './InvoiceForm/ClientSection'
import { inputCls } from './InvoiceForm/formContext'
import { ItemsSection } from './InvoiceForm/ItemsSection'
import { PreviewColumn } from './InvoiceForm/PreviewColumn'
import {
  applyLead, blankValues, invoiceFormSchema, valuesFromInvoice,
  type InvoiceFormOutput, type InvoiceFormValues, type KeptSeller,
} from './InvoiceForm/schema'
import { TotalsSection } from './InvoiceForm/TotalsSection'
import { DuplicateNumberError, useSaveInvoice } from './InvoiceForm/useSaveInvoice'
import { nextLabel, pastClients, TYPE_LABEL } from './model'
import { PickLeadDialog } from './PickLeadDialog'
import { Field, InvoiceNotFound, LoadingBlock, Panel, Section, Segmented, useScrollTop } from './ui'

type Mode = { kind: 'new'; type: InvoiceType; lead?: Lead } | { kind: 'edit'; inv: Invoice } | { kind: 'copy'; inv: Invoice }

/** Resolves the route into an editor mode, waiting for the data it needs. */
export default function InvoiceEditorPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { getInvoice, getLead, invoicesReady, ready } = useStore()
  const from = params.get('from'), leadPath = params.get('lead'), type: InvoiceType = params.get('type') === 'nongst' ? 'nongst' : 'gst'
  const srcId = id || from
  const src = getInvoice(srcId)
  const lead = getLead(leadPath)

  // Build the mode once per route so live updates don't reset the form.
  const routeKey = `${id || ''}|${from || ''}|${leadPath || ''}|${type}`
  useScrollTop(routeKey)
  const [mode, setMode] = useState<{ key: string; mode: Mode } | null>(null)
  const waiting = srcId ? !src : !!leadPath && !lead && !ready
  if (mode?.key !== routeKey && !waiting) {
    // Derived during render (no flash of the loading state).
    setMode({ key: routeKey, mode: id && src ? { kind: 'edit', inv: src } : from && src ? { kind: 'copy', inv: src } : { kind: 'new', type, lead } })
  }

  if (mode?.key !== routeKey) return srcId && invoicesReady ? <InvoiceNotFound /> : <LoadingBlock msg={srcId ? 'Loading invoice…' : 'Loading…'} />
  return <InvoiceEditor key={routeKey} mode={mode.mode} />
}

function InvoiceEditor({ mode }: { mode: Mode }) {
  const { invoices, settings, counters, readOnly, getLead } = useStore()
  const past = useMemo(() => pastClients(invoices), [invoices])
  const editId = mode.kind === 'edit' ? mode.inv.id : null
  const kept = useMemo<KeptSeller | null>(() => (mode.kind === 'edit' && mode.inv.seller ? { type: mode.inv.type, seller: { ...mode.inv.seller } } : null), [mode])
  const termsEdited = useRef(mode.kind !== 'new')
  const [pickOpen, setPickOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [defaults] = useState<InvoiceFormValues>(() => {
    if (mode.kind !== 'new') return valuesFromInvoice(mode.inv, mode.kind === 'copy', settings)
    const v = blankValues(mode.type, settings)
    return mode.lead ? applyLead(v, mode.lead, past) : v
  })
  const form = useForm<InvoiceFormValues, unknown, InvoiceFormOutput>({ resolver: zodResolver(invoiceFormSchema), defaultValues: defaults })
  const { register, control, getValues, setValue, setError, handleSubmit, getFieldState, trigger, formState: { errors } } = form
  const [type, number, leadPath] = useWatch({ control, name: ['type', 'number', 'leadPath'] })
  const save = useSaveInvoice(editId, kept)

  // Settings can arrive after the form opened: follow them until the user edits.
  const profTerms = settings.profiles[type].terms
  useEffect(() => {
    if (!termsEdited.current && getValues('terms') !== profTerms) setValue('terms', profTerms)
  }, [profTerms]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode.kind === 'new' && !getFieldState('taxRate').isDirty) setValue('taxRate', String(settings.taxRate))
  }, [settings.taxRate]) // eslint-disable-line react-hooks/exhaustive-deps

  function switchType(next: InvoiceType) {
    if (next === type) return
    const prevTerms = settings.profiles[type].terms
    setValue('type', next, { shouldDirty: true })
    if (!termsEdited.current || getValues('terms') === prevTerms) {
      setValue('terms', settings.profiles[next].terms)
      termsEdited.current = false
    }
  }

  function pickLead(l: Lead) {
    const v = applyLead(getValues(), l, past)
    setValue('leadPath', v.leadPath)
    for (const k of ['company', 'address', 'gstin', 'pan', 'email', 'phone'] as const) setValue(`client.${k}`, v.client[k], { shouldDirty: true })
    if (form.formState.isSubmitted) trigger()
    setPickOpen(false)
    toast(`Using lead: ${displayName(l)}`)
  }

  const submit = (andDownload: boolean) => handleSubmit(async v => {
    setSaving(true)
    try {
      await save(v, andDownload)
    } catch (e) {
      if (e instanceof DuplicateNumberError) setError('number', { message: e.message }, { shouldFocus: true })
      else if ((e as Error)?.message !== 'read_only') setError('root.server', { message: `Not saved: ${(e as Error)?.message || (e as { code?: string })?.code || 'unknown error'}` })
      setSaving(false)
    }
  })

  const title = mode.kind === 'edit' ? `Edit invoice #${mode.inv.label}` : mode.kind === 'copy' ? 'Duplicate invoice' : 'New invoice'
  const lead = getLead(leadPath)
  const prof = settings.profiles[type]
  // One message at a time, in the order the legacy editor checked them.
  const itemErrs = getValues('items').map((_, i) => errors.items?.[i])
  const firstError = errors.client?.company?.message || errors.items?.root?.message || errors.items?.message
    || itemErrs.find(e => e?.desc)?.desc?.message || itemErrs.find(e => e?.qty)?.qty?.message
    || errors.date?.message || errors.number?.message || errors.root?.server?.message
  const numHint = number.trim() ? 'Typed by you — must not repeat an existing invoice' : `Auto: next ${TYPE_LABEL[type]} number is ${nextLabel(settings, counters, type)}`

  return (
    <>
      <PageHeader crumbs={[{ label: 'Invoices', to: '/invoices' }, { label: title }]} title={title}
        sub={leadPath ? `For lead: ${displayName(lead)}` : undefined} />
      <FormProvider {...form}>
        <div className="mt-[18px] grid grid-cols-1 items-start gap-[22px] min-[1100px]:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
          <Panel>
            <form noValidate onSubmit={submit(false)} aria-label={title}>
              <Section title="Invoice type">
                <Segmented label="Invoice type" value={type} onChange={switchType}
                  options={[{ v: 'gst', label: 'GST invoice' }, { v: 'nongst', label: 'Non-GST invoice' }]} />
                <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 min-[521px]:grid-cols-3">
                  <Field label="Invoice #" htmlFor="ed-number" error={errors.number?.message}>
                    <input id="ed-number" type="text" inputMode="numeric" className={inputCls} aria-invalid={!!errors.number} aria-describedby="ed-num-hint"
                      placeholder={number.trim() ? '' : `Auto (${nextLabel(settings, counters, type)})`} {...register('number')} />
                    <span id="ed-num-hint" className="text-[11.5px] text-muted-foreground">{numHint}</span>
                  </Field>
                  <Field label="Date" htmlFor="ed-date" error={errors.date?.message}>
                    <input id="ed-date" type="date" className={inputCls} aria-invalid={!!errors.date} aria-required {...register('date')} />
                  </Field>
                  <Field label="Due date" hint="optional" htmlFor="ed-due">
                    <input id="ed-due" type="date" className={inputCls} {...register('dueDate')} />
                  </Field>
                </div>
              </Section>
              <ClientSection past={past} onPickLead={() => setPickOpen(true)} />
              <ItemsSection />
              <TotalsSection />
              <Section title="Notes & terms">
                <Field label="Notes" hint="optional, printed above terms" htmlFor="ed-notes">
                  <textarea id="ed-notes" rows={2} className={inputCls} placeholder="e.g. Deliverables: 3 UGC videos, 2 revisions" {...register('notes')} />
                </Field>
                <Field label="Terms / bank details" hint="from Settings — edit for this invoice only" htmlFor="ed-terms">
                  <textarea id="ed-terms" rows={6} className={inputCls} {...register('terms', { onChange: () => { termsEdited.current = true } })} />
                </Field>
              </Section>
              <div className="flex flex-col gap-1 px-[18px] pb-3 text-[13px]" role="alert">
                {firstError && <p className="m-0 text-destructive">{firstError}</p>}
                {!prof.legalName && (
                  <p className="m-0 text-warn">
                    Your business details for {TYPE_LABEL[type]} invoices are empty — <Link to="/settings" className="underline">add them in Settings</Link> first.
                  </p>
                )}
              </div>
              <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom,0px))] flex flex-wrap justify-end gap-2 rounded-b-xl border-t bg-muted px-[18px] py-3.5 md:bottom-0">
                <Button variant="outline" asChild><Link to={editId ? `/invoices/${editId}` : '/invoices'}>Cancel</Link></Button>
                <Button type="button" variant="outline" disabled={saving || readOnly} onClick={submit(true)}><Download aria-hidden />Save &amp; download</Button>
                <Button type="submit" disabled={saving || readOnly}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Create invoice'}</Button>
              </div>
            </form>
          </Panel>
          <PreviewColumn kept={kept} />
        </div>
      </FormProvider>
      <PickLeadDialog open={pickOpen} onOpenChange={setPickOpen} onPick={pickLead} />
    </>
  )
}

