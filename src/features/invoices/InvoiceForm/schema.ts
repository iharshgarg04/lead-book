/* Invoice editor form: values, validation (messages as in the legacy editor) and
   conversion to/from stored invoices and the printable preview. */
import { z } from 'zod'
import { num, todayKey } from '@/lib/format'
import type { BusinessSettings, ClientDetails, Counters, Invoice, InvoiceItem, InvoiceType, Lead, SellerSnapshot } from '@/types'
import { blankClient, calcTotals, CLIENT_FIELDS, sellerFromProfile } from '../model'
import type { PrintableInvoice } from '../pdf'

const itemSchema = z.object({ desc: z.string(), qty: z.string(), rate: z.string() })

/** Items that count: blank rows (no description and no rate) are ignored. */
export function usedItems(items: { desc: string; qty: string; rate: string }[]) {
  return items.map((it, i) => ({ i, desc: it.desc.trim(), qty: num(it.qty), rate: num(it.rate) })).filter(x => x.desc || x.rate)
}

export const invoiceFormSchema = z.object({
  type: z.enum(['gst', 'nongst']),
  /** '' = next number from the counter */
  number: z.string(),
  date: z.string(),
  dueDate: z.string(),
  client: z.object({ company: z.string(), address: z.string(), gstin: z.string(), pan: z.string(), email: z.string(), phone: z.string() }),
  items: z.array(itemSchema),
  taxRate: z.string(),
  paid: z.string(),
  notes: z.string(),
  terms: z.string(),
  leadPath: z.string(),
}).superRefine((v, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
  if (!v.client.company.trim()) add(['client', 'company'], 'Add the client’s company name.')
  const used = usedItems(v.items)
  if (!used.length) add(['items'], 'Add at least one item with a description and rate.')
  for (const x of used) if (!x.desc) add(['items', x.i, 'desc'], 'Every item needs a description.')
  for (const x of used) if (x.qty <= 0) add(['items', x.i, 'qty'], 'Quantities must be more than 0.')
  if (!v.date) add(['date'], 'Pick the invoice date.')
  const n = v.number.trim()
  if (n && !/^\d+$/.test(n)) add(['number'], 'The invoice number should be digits only (the prefix is added from Settings).')
}).transform(v => ({
  ...v,
  number: v.number.trim() ? parseInt(v.number.trim(), 10) : null,
  items: usedItems(v.items).map(({ desc, qty, rate }): InvoiceItem => ({ desc, qty, rate })),
  taxRate: v.type === 'gst' ? num(v.taxRate) : 0,
  paid: num(v.paid),
}))

export type InvoiceFormValues = z.input<typeof invoiceFormSchema>
export type InvoiceFormOutput = z.output<typeof invoiceFormSchema>

/** Seller snapshot kept from the invoice being edited (used while its type is unchanged). */
export interface KeptSeller { type: InvoiceType; seller: SellerSnapshot }

const blankItem = () => ({ desc: '', qty: '1', rate: '' })

export function blankValues(type: InvoiceType, settings: BusinessSettings): InvoiceFormValues {
  return {
    type, number: '', date: todayKey(), dueDate: '', client: blankClient(), items: [blankItem()],
    taxRate: String(settings.taxRate), paid: '0', notes: '', terms: settings.profiles[type].terms, leadPath: '',
  }
}

/** Values for editing (`copy` = false) or duplicating an invoice. */
export function valuesFromInvoice(inv: Invoice, copy: boolean, settings: BusinessSettings): InvoiceFormValues {
  const items = (inv.items || []).map(i => ({ desc: i.desc || '', qty: String(i.qty ?? ''), rate: String(i.rate ?? '') }))
  return {
    type: inv.type,
    number: copy ? '' : String(inv.number || ''),
    date: copy ? todayKey() : inv.date || '',
    dueDate: copy ? '' : inv.dueDate || '',
    client: { ...blankClient(), ...inv.client },
    items: items.length ? items : [blankItem()],
    taxRate: String(inv.taxRate ?? settings.taxRate),
    paid: String(copy ? 0 : calcTotals(inv).paid || 0),
    notes: inv.notes || '',
    terms: inv.seller?.terms || settings.profiles[inv.type].terms,
    leadPath: copy ? '' : inv.leadPath || '',
  }
}

/** Fill empty client fields from that company's latest invoice. Returns the fields filled. */
export function fillFromPast(client: ClientDetails, past: Map<string, ClientDetails>): Partial<ClientDetails> {
  const c = past.get(client.company.trim().toLowerCase())
  const out: Partial<ClientDetails> = {}
  if (!c) return out
  for (const f of CLIENT_FIELDS) if (!client[f] && c[f]) out[f] = c[f]
  return out
}

/** Prefill from a lead: company / email / phone, then anything known from past invoices. */
export function applyLead(v: InvoiceFormValues, lead: Lead, past: Map<string, ClientDetails>): InvoiceFormValues {
  const client = {
    ...v.client,
    company: lead.company || lead.name || v.client.company,
    email: lead.email || v.client.email,
    phone: lead.phone || v.client.phone,
  }
  return { ...v, leadPath: lead.path, client: { ...client, ...fillFromPast(client, past) } }
}

export function sellerFor(type: InvoiceType, settings: BusinessSettings, kept: KeptSeller | null, terms: string): SellerSnapshot {
  const base = kept && kept.type === type ? kept.seller : sellerFromProfile(settings.profiles[type])
  return { ...base, terms }
}

/** What the live preview shows for the current form values. */
export function draftPrintable(v: InvoiceFormValues, settings: BusinessSettings, counters: Counters, kept: KeptSeller | null): PrintableInvoice {
  const n = v.number.trim()
  const number = n ? parseInt(n, 10) || n : counters[v.type]
  return {
    type: v.type,
    label: `${settings.profiles[v.type].prefix || ''}${number}`,
    date: v.date,
    dueDate: v.dueDate,
    seller: sellerFor(v.type, settings, kept, v.terms),
    client: v.client,
    items: v.items.map(i => ({ desc: i.desc, qty: num(i.qty), rate: num(i.rate) })),
    taxRate: v.type === 'gst' ? num(v.taxRate) : 0,
    paid: num(v.paid),
    notes: v.notes,
    logo: settings.logo || '',
  }
}
