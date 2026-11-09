/* CSV export of leads (legacy `export` block). */
import { toast } from 'sonner'
import { downloadFile, toCSV } from '@/lib/files'
import { fmtAbs, todayKey } from '@/lib/format'
import type { Lead, Month } from '@/types'
import { entryText, lastText, PKG, RMAP, SMAP, TL } from './model'

const HEAD = ['Name', 'Company', 'Phone', 'Email', 'Package', 'Go-live', 'Status', 'Rating', 'Next follow-up', 'Tries', 'Month', 'Latest update', 'All notes']

export function exportLeadsCsv(list: Lead[], months: Month[]) {
  if (!list.length) { toast('No leads to export.'); return }
  const label = new Map(months.map(m => [m.key, m.label]))
  const rows = list.map(l => [
    l.name, l.company, l.phone, l.email,
    l.package && PKG[l.package] ? `${PKG[l.package].label} (${PKG[l.package].ads})` : '',
    (l.timeline && TL[l.timeline]?.label) || '',
    (SMAP[l.status] || SMAP.new).label,
    (l.rating && RMAP[l.rating]?.label) || '',
    l.nextAt ? fmtAbs(l.nextAt) : '',
    l.attempts || 0,
    label.get(l.month) || l.month,
    lastText(l),
    l.notes.map(entryText).filter(Boolean).join(' | '),
  ])
  try {
    downloadFile(`leads-${todayKey()}.csv`, '﻿' + toCSV(HEAD, rows))
    toast(`Exported ${list.length} leads`)
  } catch {
    toast('Couldn’t export here. Try again in a moment.')
  }
}
