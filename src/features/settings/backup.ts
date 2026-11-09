/* Full JSON backup in the legacy v2 format (restorable from Leads → Import). */
import { downloadFile } from '@/lib/files'
import { nowIso, todayKey } from '@/lib/format'
import type { BusinessSettings, Counters, Invoice, Lead, Month } from '@/types'

export function buildBackup(months: Month[], leads: Lead[], invoices: Invoice[], business: BusinessSettings, counters: Counters) {
  return {
    format: 'leadbook-backup',
    version: 2,
    exportedAt: nowIso(),
    months: months.map(m => ({ id: m.key, data: { key: m.key, label: m.label, tab: m.tab || '' } })),
    leads: leads.map(l => {
      const { id, month, path: _path, hay: _hay, ...data } = l
      return { month, id, data }
    }),
    invoices: invoices.map(i => { const { id, ...data } = i; return { id, data } }),
    settings: { business, counters },
  }
}

export function downloadBackup(...args: Parameters<typeof buildBackup>) {
  const json = buildBackup(...args)
  downloadFile(`pages-desk-backup-${todayKey()}.json`, JSON.stringify(json))
  return { leads: json.leads.length, invoices: json.invoices.length }
}
