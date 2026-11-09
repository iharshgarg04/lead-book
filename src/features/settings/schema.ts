/* Settings form: both seller profiles, next numbers and the default GST rate. */
import { z } from 'zod'
import { num } from '@/lib/format'
import type { BusinessSettings, Counters, SellerProfile } from '@/types'

const profile = z.object({ legalName: z.string(), gstin: z.string(), address: z.string(), pan: z.string(), terms: z.string(), prefix: z.string() })
const nextNumber = z.string().trim().regex(/^\d+$/, 'Next numbers must be whole numbers above 0.')
  .refine(v => parseInt(v, 10) > 0, 'Next numbers must be whole numbers above 0.')

const cleanProfile = (p: SellerProfile): SellerProfile => ({
  ...p, gstin: p.gstin.trim().toUpperCase(), pan: p.pan.trim().toUpperCase(), prefix: p.prefix.trim(),
})

export const settingsSchema = z.object({
  profiles: z.object({ gst: profile, nongst: profile }),
  next: z.object({ gst: nextNumber, nongst: nextNumber }),
  taxRate: z.string(),
}).transform(v => ({
  profiles: { gst: cleanProfile(v.profiles.gst), nongst: cleanProfile(v.profiles.nongst) },
  next: { gst: parseInt(v.next.gst, 10), nongst: parseInt(v.next.nongst, 10) } as Counters,
  taxRate: num(v.taxRate),
}))

export type SettingsFormValues = z.input<typeof settingsSchema>
export type SettingsFormOutput = z.output<typeof settingsSchema>

export const toFormValues = (s: BusinessSettings, c: Counters): SettingsFormValues => ({
  profiles: { gst: { ...s.profiles.gst }, nongst: { ...s.profiles.nongst } },
  next: { gst: String(c.gst), nongst: String(c.nongst) },
  taxRate: String(s.taxRate),
})
