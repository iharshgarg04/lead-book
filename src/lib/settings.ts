/* Invoice business settings. Real values live only in Firestore (settings/business). */
import type { BusinessSettings, Counters, SellerProfile } from '@/types'

const blankProfile = (prefix: string): SellerProfile => ({ legalName: '', gstin: '', address: '', pan: '', terms: '', prefix })

export const DEFAULT_SETTINGS: BusinessSettings = {
  taxRate: 18,
  logo: '',
  profiles: { gst: blankProfile(''), nongst: blankProfile('NG-') },
}
export const DEFAULT_COUNTERS: Counters = { gst: 301, nongst: 1 }
export const DEFAULT_LOGO = `${import.meta.env.BASE_URL}assets/pages-logo.jpg`

export function mergeSettings(d: Partial<BusinessSettings> | undefined | null): BusinessSettings {
  const s: BusinessSettings = structuredClone(DEFAULT_SETTINGS)
  if (!d) return s
  if (d.taxRate != null) s.taxRate = Number(d.taxRate) || 0
  if (typeof d.logo === 'string') s.logo = d.logo
  for (const t of ['gst', 'nongst'] as const) Object.assign(s.profiles[t], d.profiles?.[t] || {})
  return s
}
export function mergeCounters(d: Partial<Record<string, unknown>> | undefined | null): Counters {
  return { gst: Number(d?.gst) || DEFAULT_COUNTERS.gst, nongst: Number(d?.nongst) || DEFAULT_COUNTERS.nongst }
}
