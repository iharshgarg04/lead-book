/* Shared data model. Field names match the documents already stored in Firestore. */

export type LeadStatus =
  | 'new' | 'no_answer' | 'callback' | 'talking' | 'portfolio'
  | 'meeting_set' | 'meeting_done' | 'won' | 'lost' | 'junk'
export type LeadRating = 'hot' | 'warm' | 'cold' | 'unqualified'
export type PackageKey = 'launch' | 'advance' | 'growth' | 'scaling'
export type TimelineKey = 'now' | '2-3w' | '1m' | 'flexible'

/** One entry in a lead's history (`notes` array). */
export interface LeadNote {
  kind: 'sheet' | 'note' | 'status' | 'follow' | 'rating'
  t?: string
  /** status key for kind=status */
  s?: string
  /** rating key for kind=rating (null = cleared) */
  r?: LeadRating | null
  note?: string
  /** follow-up value for kind=follow / next date on status entries */
  next?: string | null
  /** ISO timestamp, null for notes imported from the sheet */
  at: string | null
  /** Firebase uid of the author */
  by: string | null
  /** sheet tab label for kind=sheet */
  src?: string
}

/** Lead as stored at months/{month}/leads/{id}. */
export interface LeadDoc {
  name: string
  company: string
  email: string
  phone: string
  package: PackageKey | ''
  timeline: TimelineKey | ''
  status: LeadStatus
  rating?: LeadRating | null
  /** 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' (local time) */
  nextAt: string | null
  attempts: number
  notes: LeadNote[]
  enquiries: number
  tab?: string
  sheetRow?: number | null
  seq: number
  createdAt: string | null
  createdBy?: string | null
  updatedAt: string | null
  updatedBy: string | null
  lastCallAt: string | null
}

/** Lead with its location in the database. */
export interface Lead extends LeadDoc {
  id: string
  /** month key, e.g. '2026-10' */
  month: string
  /** full document path: months/{month}/leads/{id} */
  path: string
  /** lower-cased search text */
  hay: string
}

export interface Month {
  key: string
  label: string
  tab?: string
}

export type InvoiceType = 'gst' | 'nongst'
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled'

export interface InvoiceItem {
  desc: string
  qty: number
  rate: number
}

export interface Payment {
  amount: number
  /** 'YYYY-MM-DD' */
  date: string
  at: string
  by: string | null
}

export interface Party {
  legalName?: string
  company?: string
  gstin: string
  address: string
  pan: string
  email?: string
  phone?: string
}

export interface SellerSnapshot {
  legalName: string
  gstin: string
  address: string
  pan: string
  terms: string
}

export interface ClientDetails {
  company: string
  address: string
  gstin: string
  pan: string
  email: string
  phone: string
}

/** Invoice as stored at invoices/{id}. */
export interface InvoiceDoc {
  type: InvoiceType
  number: number
  prefix: string
  label: string
  date: string
  dueDate: string
  seller: SellerSnapshot
  client: ClientDetails
  items: InvoiceItem[]
  taxRate: number
  subtotal: number
  tax: number
  total: number
  paid: number
  balance: number
  status: InvoiceStatus
  payments: Payment[]
  cancelled: boolean
  notes: string
  leadPath: string
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface Invoice extends InvoiceDoc {
  id: string
}

export interface SellerProfile {
  legalName: string
  gstin: string
  address: string
  pan: string
  terms: string
  prefix: string
}

/** settings/business */
export interface BusinessSettings {
  taxRate: number
  /** data: URL of a custom logo, '' = bundled logo */
  logo: string
  profiles: Record<InvoiceType, SellerProfile>
}

/** settings/counters — next invoice number per series */
export type Counters = Record<InvoiceType, number>

export interface Person {
  name: string
  email: string
  lastSeen?: string
}
