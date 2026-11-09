/* Date, phone and money helpers shared by every module. All dates are local time. */

export const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const pad = (n: number) => String(n).padStart(2, '0')
/** 'YYYY-MM-DD' for a Date in local time */
export const dkey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const todayKey = () => dkey(new Date())
export const nowIso = () => new Date().toISOString()
/** 'YYYY-MM' */
export const monthKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
export const monthLabelOf = (key: string) => { const [y, m] = key.split('-').map(Number); return `${MO[m - 1]} ${y}` }
export const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th')

export interface ParsedNext { date: string; time: string | null; dt: Date }
/** Parse a follow-up value: 'YYYY-MM-DD' (any time that day) or 'YYYY-MM-DDTHH:MM'. */
export function parseNext(s: string | null | undefined): ParsedNext | null {
  if (!s || typeof s !== 'string') return null
  const [dp, tp] = s.split('T')
  const [y, m, d] = dp.split('-').map(Number)
  if (!y || !m || !d) return null
  if (tp) { const [h, mi] = tp.split(':').map(Number); return { date: dp, time: tp.slice(0, 5), dt: new Date(y, m - 1, d, h || 0, mi || 0) } }
  return { date: dp, time: null, dt: new Date(y, m - 1, d) }
}
export function fmtTime(d: Date) {
  let h = d.getHours(); const m = d.getMinutes(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12
  return m ? `${h}:${pad(m)} ${ap}` : `${h} ${ap}`
}
/** 'Today' / 'Tomorrow' / 'Yesterday' / 'Sat 7 Nov' */
export function fmtDay(d: Date) {
  const t = new Date(), k = dkey(d)
  if (k === dkey(t)) return 'Today'
  if (k === dkey(addDays(t, 1))) return 'Tomorrow'
  if (k === dkey(addDays(t, -1))) return 'Yesterday'
  return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`
}
/** Relative follow-up label, e.g. 'Tomorrow, 11 am' */
export function fmtNext(s: string | null | undefined) { const n = parseNext(s); return n ? fmtDay(n.dt) + (n.time ? `, ${fmtTime(n.dt)}` : '') : '' }
/** Absolute follow-up label, e.g. 'Sat 7 Nov, 11 am' */
export function fmtAbs(s: string | null | undefined) {
  const n = parseNext(s); if (!n) return ''
  return `${WD[n.dt.getDay()]} ${n.dt.getDate()} ${MO[n.dt.getMonth()]}` + (n.time ? `, ${fmtTime(n.dt)}` : '')
}
/** 'Nov 5, 2026' for a 'YYYY-MM-DD' string (invoice style) */
export function fmtDate(s: string | null | undefined) {
  if (!s) return ''
  const [y, m, d] = String(s).split('-').map(Number)
  return y && m && d ? `${MO[m - 1]} ${d}, ${y}` : String(s)
}
/** 'just now' / '5 min ago' / '2 h ago' / 'Yesterday, 4:12 pm' */
export function ago(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(+d)) return ''
  const s = (Date.now() - +d) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 6 * 3600) return `${Math.floor(s / 3600)} h ago`
  return `${fmtDay(d)}, ${fmtTime(d)}`
}
/** Parse loose dates: 'YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YY', or anything Date understands. */
export function parseLooseDate(s: string | null | undefined): Date | null {
  s = String(s || '').trim(); if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12)
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) { const y = Number(m[3].length === 2 ? '20' + m[3] : m[3]); const d = new Date(y, +m[2] - 1, +m[1], 12); return isNaN(+d) ? null : d }
  const d = new Date(s); return isNaN(+d) ? null : d
}

/* ---------- phones ---------- */
export const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
/** Normalise to +<country><number>; 10-digit numbers are treated as Indian. */
export function normPhone(s: unknown) {
  let d = digits(s); if (!d) return ''
  if (d.length === 10) d = '91' + d
  else if (d.length === 11 && d[0] === '0') d = '91' + d.slice(1)
  return '+' + d
}
/** '+91 98765 43210' */
export function fmtPhone(p: string | null | undefined) {
  const d = digits(p)
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return p || ''
}

/* ---------- money ---------- */
/** '₹1,00,000.00' (Indian grouping) */
export const money = (n: unknown) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Parse '₹1,234.50' / '1234.5' → number (0 if empty) */
export function num(v: unknown) { const n = parseFloat(String(v ?? '').replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0 }
export const round2 = (n: number) => Math.round(n * 100) / 100
export const trimNum = (n: unknown) => String(round2(Number(n) || 0))

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
