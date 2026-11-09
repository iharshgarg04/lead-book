/* Small pure helpers used across the Leads screens. */
import { addDays, dkey, fmtPhone, MO, pad, parseNext } from '@/lib/format'
import type { Lead, LeadDoc, Person } from '@/types'

/** Name to show for a lead (legacy formats the phone when there is no name/company). */
export const leadName = (l: Partial<Lead> | null | undefined) =>
  (l && (l.name || l.company || fmtPhone(l.phone) || l.email)) || 'Unnamed lead'

/** Fields restored by Undo after a status / follow-up change. */
export type LeadSnapshot = Pick<LeadDoc, 'status' | 'attempts' | 'nextAt' | 'lastCallAt' | 'notes'>
export const snapshotOf = (l: Lead): LeadSnapshot => ({
  status: l.status || 'new', attempts: l.attempts || 0, nextAt: l.nextAt || null, lastCallAt: l.lastCallAt || null, notes: l.notes || [],
})

/** Keep an existing follow-up if it is still in the future, else use the fallback. */
export function futureOr(existing: string | null | undefined, fallback: string) {
  const n = parseNext(existing)
  return n && n.dt > new Date() ? (existing as string) : fallback
}

export type QuickFollow = '2h' | 'eve' | 'tmr' | '3d' | 'wk' | 'clear'
export const QUICK_FOLLOW: { q: QuickFollow; label: string }[] = [
  { q: '2h', label: 'In 2 hours' },
  { q: 'eve', label: 'This evening' },
  { q: 'tmr', label: 'Tomorrow 11 am' },
  { q: '3d', label: 'In 3 days' },
  { q: 'wk', label: 'Next week' },
  { q: 'clear', label: 'Clear' },
]
/** Follow-up value for a quick chip (null = clear). */
export function quickFollowValue(q: QuickFollow, now = new Date()): string | null {
  if (q === '2h') {
    const x = new Date(now.getTime() + 2 * 3600e3)
    x.setMinutes(x.getMinutes() < 30 ? 30 : 60, 0, 0)
    return `${dkey(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`
  }
  if (q === 'eve') return now.getHours() < 18 ? `${dkey(now)}T18:00` : `${dkey(addDays(now, 1))}T18:00`
  if (q === 'tmr') return `${dkey(addDays(now, 1))}T11:00`
  if (q === '3d') return dkey(addDays(now, 3))
  if (q === 'wk') return dkey(addDays(now, 7))
  return null
}

/** 'Nov ’26' for a month key. */
export const shortMonth = (key: string | undefined) => (key ? `${MO[Number(key.slice(5, 7)) - 1]} ’${key.slice(2, 4)}` : '')

/** Author label for a uid: 'You' for the signed-in user, else their name. */
export const personName = (uid: string, meId: string | null, people: Record<string, Person>) =>
  uid === meId ? 'You' : people[uid]?.name || 'Someone'

export const triesLabel = (n: number) => `${n} ${n === 1 ? 'try' : 'tries'}`

/** True when keyboard focus is in a text control (shortcuts must not fire). */
export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

/** Copy text; falls back to selecting the element so the user can press Ctrl/Cmd+C. */
export async function copyText(value: string, el: HTMLElement | null, notify: (msg: string) => void) {
  const select = () => {
    if (!el) return
    const r = document.createRange(); r.selectNodeContents(el)
    const s = getSelection(); s?.removeAllRanges(); s?.addRange(r)
    notify('Selected — press Ctrl/⌘ + C to copy')
  }
  try {
    await navigator.clipboard.writeText(value)
    notify(`Copied ${value}`)
  } catch {
    select()
  }
}
