/* Lead import parsing — a faithful port of the legacy `import parsing` block.
   Handles Google Sheet rows (content mode), Meta Leads Center exports and our template (header mode). */
import { parseDelimited } from '@/lib/files'
import { digits, EMAIL_RX, normPhone } from '@/lib/format'
import type { Lead, LeadDoc, LeadRating, PackageKey, TimelineKey } from '@/types'
import { PKG, RATING, RMAP } from './model'

const PHONE_RX = /^(p:\s*)?\+?\d[\d\s-]{8,}$/

export interface ParsedLead {
  name: string
  phone: string
  email: string
  company: string
  package: PackageKey | ''
  timeline: TimelineKey | ''
  notes: string[]
  created: Date | null
  rating?: LeadRating | ''
}
export interface ImportRow extends ParsedLead {
  /** lead already in the book with the same phone/email */
  existing: Lead | null
}

export function normPkg(s: string): PackageKey | '' {
  s = (s || '').toLowerCase()
  for (const k of Object.keys(PKG) as PackageKey[]) if (s.includes(k)) return k
  return ''
}
export function normTl(s: string): TimelineKey | '' {
  s = (s || '').toLowerCase().trim()
  if (s.startsWith('immediately')) return 'now'
  if (s.startsWith('in_2')) return '2-3w'
  if (s.startsWith('in_1_month')) return '1m'
  if (s.startsWith('flexible')) return 'flexible'
  return ''
}

export function isHeader(cells: string[]) {
  const low = cells.map(c => c.toLowerCase().trim())
  return ['email', 'phone_number', 'first_name', 'full_name', 'phone', 'mobile'].some(h => low.includes(h))
}

export interface HeaderMap {
  email: number; name: number; phone: number; company: number; created: number; rating: number; pkg: number; tl: number
  meta: boolean
  after: number
  low: string[]
}
export function buildHeader(cells: string[]): HeaderMap {
  const low = cells.map(c => c.toLowerCase().replace(/[\s-]+/g, '_'))
  const find = (...n: string[]) => low.findIndex(c => n.includes(c))
  const h = {
    email: find('email', 'email_address', 'email_id'),
    name: find('first_name', 'full_name', 'name', 'lead_name'),
    phone: find('phone_number', 'phone', 'mobile', 'mobile_number', 'whatsapp'),
    company: find('company_name', 'company', 'brand', 'business'),
    created: find('created_time', 'date', 'lead_date', 'enquiry_date'),
    rating: find('rating', 'lead_rating', 'temperature'),
    pkg: low.findIndex(c => c.startsWith('how_many') || c === 'package'),
    tl: low.findIndex(c => c.startsWith('when_do_you') || c === 'go_live' || c === 'golive' || c === 'timeline'),
  }
  const meta = h.created >= 0 || h.rating >= 0 || low.includes('ad_name') || low.includes('campaign_name') || low.includes('package') || low.includes('go_live')
  const after = Math.max(h.company, h.phone, h.email, h.name, h.pkg, h.tl, h.created, h.rating)
  return { ...h, meta, after, low }
}

export function loosePkg(s: string): PackageKey | '' {
  s = (s || '').toLowerCase()
  const p = normPkg(s); if (p) return p
  if (/20\s*\+|more than 20/.test(s)) return 'scaling'
  if (/10\s*[-–]\s*20/.test(s)) return 'growth'
  if (/5\s*[-–]\s*10/.test(s)) return 'advance'
  if (/3\s*[-–]\s*5/.test(s)) return 'launch'
  return ''
}
export function looseTl(s: string): TimelineKey | '' {
  s = (s || '').toLowerCase()
  const t = normTl(s); if (t) return t
  if (/immediate|7\s*day|now|asap|this week/.test(s)) return 'now'
  if (/flex|plan/.test(s)) return 'flexible'
  if (/2\s*[-–]\s*3|week/.test(s)) return '2-3w'
  if (/month/.test(s)) return '1m'
  return ''
}
/** DD/MM/YYYY (or DD-MM-YY etc.) first, then anything Date understands. */
export function parseDate(s: string): Date | null {
  s = (s || '').trim(); if (!s) return null
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const y = Number(m[3].length === 2 ? '20' + m[3] : m[3])
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]), 12)
    return isNaN(+d) ? null : d
  }
  const d = new Date(s); return isNaN(+d) ? null : d
}

function fromHeader(cells: string[], h: HeaderMap): ParsedLead {
  const g = (j: number) => (j >= 0 ? (cells[j] || '').trim() : '')
  const em = g(h.email)
  const r = g(h.rating).toLowerCase()
  const notes = cells
    .map((c, j) => (j > h.after && (j >= h.low.length || h.low[j] === '' || /follow|note|remark|comment/.test(h.low[j])) ? (c || '').trim() : ''))
    .filter(Boolean)
  return {
    name: g(h.name), phone: normPhone(g(h.phone)), email: EMAIL_RX.test(em) ? em : '', company: g(h.company),
    package: loosePkg(g(h.pkg)), timeline: looseTl(g(h.tl)), notes, created: parseDate(g(h.created)),
    rating: RATING.find(x => r.startsWith(x.k.slice(0, 4)))?.k || '',
  }
}

function fromContent(cells: string[], emailCol: number): ParsedLead {
  const pkgI = cells.findIndex(c => c.toLowerCase().includes('package'))
  const tlI = cells.findIndex(c => normTl(c))
  const emI = cells.findIndex(c => EMAIL_RX.test(c))
  const anchor = emI >= 0 ? emI : (pkgI >= 0 || tlI >= 0) ? Math.max(pkgI, tlI) + 1 : emailCol
  let phI = -1
  for (let j = anchor + 1; j < cells.length; j++) if (PHONE_RX.test(cells[j])) { phI = j; break }
  if (phI < 0) phI = anchor + 2
  let phone = normPhone(cells[phI] || '')
  if (!phone && PHONE_RX.test(cells[anchor] || '')) phone = normPhone(cells[anchor])
  return {
    name: cells.slice(anchor + 1, phI).filter(Boolean).join(' ').trim(), phone, email: emI >= 0 ? cells[emI] : '',
    company: cells[phI + 1] || '', package: pkgI >= 0 ? normPkg(cells[pkgI]) : '', timeline: tlI >= 0 ? normTl(cells[tlI]) : '',
    notes: cells.slice(phI + 2).filter(Boolean), created: null,
  }
}

export function parseLeads(text: string): ParsedLead[] {
  const out: ParsedLead[] = []
  let hdr: HeaderMap | null = null
  for (const raw of parseDelimited(text)) {
    const cells = raw.map(c => (c || '').trim())
    if (!cells.some(Boolean)) continue
    if (isHeader(cells)) { hdr = buildHeader(cells); continue }
    const r = hdr && hdr.meta ? fromHeader(cells, hdr) : fromContent(cells, hdr && hdr.email >= 0 ? hdr.email : 2)
    if (r.phone || r.email) out.push(r)
  }
  return out
}

/** Find an existing lead by phone digits or email. */
export function buildLeadIndex(leads: Lead[]) {
  const byPhone = new Map<string, Lead>(), byEmail = new Map<string, Lead>()
  for (const l of leads) {
    const d = digits(l.phone); if (d) byPhone.set(d, l)
    if (l.email) byEmail.set(l.email.toLowerCase(), l)
  }
  return (r: Pick<ParsedLead, 'phone' | 'email'>): Lead | null =>
    (digits(r.phone) && byPhone.get(digits(r.phone))) || (r.email && byEmail.get(r.email.toLowerCase())) || null
}

/** Parse text and mark rows that already exist; repeated rows within the paste are dropped. */
export function previewRows(text: string, leads: Lead[]): { parsed: number; rows: ImportRow[] } {
  const parsed = parseLeads(text || '')
  const find = buildLeadIndex(leads)
  const seen = new Set<string>()
  const rows: ImportRow[] = []
  for (const r of parsed) {
    const k = digits(r.phone) || (r.email || '').toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    rows.push({ ...r, existing: find(r) })
  }
  return { parsed: parsed.length, rows }
}

/** Document id: p<digits> / e<email> / random. */
export function makeId(r: Pick<ParsedLead, 'phone' | 'email'>) {
  if (r.phone) return 'p' + digits(r.phone)
  if (r.email) return 'e' + r.email.toLowerCase().replace(/[^a-z0-9_\-.~:@+]/g, '').slice(0, 180)
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function newLeadDoc(r: ParsedLead, i: number, meId: string | null): LeadDoc {
  const now = new Date().toISOString()
  const notes = (r.notes || []).map(t => ({ kind: 'note' as const, t, at: now, by: meId }))
  return {
    name: r.name || '', company: r.company || '', email: r.email || '', phone: r.phone || '', package: r.package || '', timeline: r.timeline || '',
    notes, enquiries: 1, tab: '', sheetRow: null, seq: (r.created ? r.created.getTime() : Date.now()) + (i || 0),
    createdAt: r.created ? r.created.toISOString() : now, createdBy: meId, updatedAt: now, updatedBy: meId,
    lastCallAt: null, status: 'new', attempts: 0, nextAt: null, rating: r.rating && RMAP[r.rating] ? r.rating : null,
  }
}

/** CSV template offered in the Import dialog (identical to legacy). */
export const TEMPLATE = 'name,phone,email,company,package,go_live,date,rating,notes\n' +
  'Priya Sharma,+91 98765 43210,priya@example.com,Example Brand,Launch (3-5 ads),Within 7 days,06/11/2026,Hot,Skincare brand - wants Hindi videos\n' +
  'Rahul Verma,9812345678,,Urban Threads,Growth (10-20 ads),In 1 month,05/11/2026,,Came from Instagram DM\n'

/* ---------- Lead Book backup (.json) ---------- */
export interface LeadBookBackup {
  format: 'leadbook-backup'
  months?: { id: string; data: Record<string, unknown> }[]
  leads: { month: string; id: string; data: Record<string, unknown> }[]
}
export const isBackup = (j: unknown): j is LeadBookBackup =>
  !!j && typeof j === 'object' && (j as LeadBookBackup).format === 'leadbook-backup' && Array.isArray((j as LeadBookBackup).leads)
