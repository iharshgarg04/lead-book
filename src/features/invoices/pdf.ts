/* Invoice layout + renderers.
   One layout function produces drawing ops in PDF points (US Letter, 612×792). The
   on-screen preview (HTML) and the downloaded PDF (jsPDF) both draw from it, so they
   always match. Format follows the Pages Production invoice. */
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { fmtDate, money, trimNum } from '@/lib/format'
import { DEFAULT_LOGO } from '@/lib/settings'
import type { ClientDetails, InvoiceItem, InvoiceType, SellerSnapshot } from '@/types'
import { calcTotals } from './model'

export const PAGE_W = 612
export const PAGE_H = 792

/** Everything the renderer needs to draw an invoice. */
export interface PrintableInvoice {
  type: InvoiceType
  label: string
  date: string
  dueDate?: string
  seller: SellerSnapshot
  client: Partial<ClientDetails>
  items: InvoiceItem[]
  taxRate: number
  paid?: number
  notes?: string
  /** data: URL of a custom logo; empty = bundled logo */
  logo?: string
}

type Op =
  | { t: 'text'; p: number; str: string; x: number; y: number; s: number; b: boolean; c: string; al: 'left' | 'right' }
  | { t: 'rect'; p: number; x: number; y: number; w: number; h: number; fill: string; r: number }
  | { t: 'img'; p: number; src: string; x: number; y: number; w: number; h: number; r: number }

/* ---------- fonts ---------- */
const fonts = { reg: '', bold: '' }
let fontsReady: Promise<void> | null = null
let measurer: jsPDF | null = null

function toB64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf); let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export function loadFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = Promise.all(['Regular', 'Bold'].map(w =>
      fetch(`${import.meta.env.BASE_URL}fonts/NotoSans-${w}.ttf`).then(r => {
        if (!r.ok) throw new Error('Invoice font failed to load')
        return r.arrayBuffer()
      }).then(toB64),
    )).then(([r, b]) => { fonts.reg = r; fonts.bold = b; measurer = newDoc() })
    fontsReady.catch(() => { fontsReady = null })
  }
  return fontsReady
}
function newDoc() {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  doc.addFileToVFS('NS-R.ttf', fonts.reg); doc.addFont('NS-R.ttf', 'NS', 'normal')
  doc.addFileToVFS('NS-B.ttf', fonts.bold); doc.addFont('NS-B.ttf', 'NS', 'bold')
  doc.setFont('NS', 'normal')
  return doc
}
function wrap(str: unknown, size: number, bold: boolean, width: number): string[] {
  const m = measurer!
  m.setFont('NS', bold ? 'bold' : 'normal'); m.setFontSize(size)
  return m.splitTextToSize(String(str ?? ''), width) as string[]
}

/* ---------- logo ---------- */
const logoCache = new Map<string, Promise<string | null>>()
function logoData(src?: string): Promise<string | null> {
  const url = src || DEFAULT_LOGO
  if (url.startsWith('data:')) return Promise.resolve(url)
  if (!logoCache.has(url)) {
    logoCache.set(url, fetch(url).then(r => r.blob()).then(b => new Promise<string>((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b)
    })).catch(() => null))
  }
  return logoCache.get(url)!
}

/* ---------- layout ---------- */
function layout(inv: PrintableInvoice, logo: string | null) {
  const ops: Op[] = []; let page = 0
  const DARK = '#333333', GREY = '#777777'
  const T = (str: string, x: number, y: number, o: { s?: number; b?: boolean; c?: string; al?: 'left' | 'right' } = {}) =>
    ops.push({ t: 'text', p: page, str, x, y, s: o.s || 10, b: !!o.b, c: o.c || DARK, al: o.al || 'left' })
  const R = (x: number, y: number, w: number, h: number, fill: string, r = 0) => ops.push({ t: 'rect', p: page, x, y, w, h, fill, r })
  const t = calcTotals(inv)
  const seller = inv.seller || ({} as SellerSnapshot), client = inv.client || {}

  if (logo) ops.push({ t: 'img', p: page, src: logo, x: 36.5, y: 14, w: 150, h: 64, r: 5 })
  T('INVOICE', 576, 50, { s: 29, al: 'right' })
  T('# ' + (inv.label || ''), 572, 68, { s: 12, c: GREY, al: 'right' })

  // Seller block (left)
  let y = 98; const LX = 48, LW = 262, LH = 12
  const sellerLines: [string, boolean][] = []
  if (seller.legalName) sellerLines.push([`LEGAL NAME - ${seller.legalName}`, true])
  if (inv.type === 'gst' && seller.gstin) sellerLines.push([`GST NO ${seller.gstin}`, false])
  if (seller.address) sellerLines.push([`ADDRESS - ${seller.address}`, false])
  if (seller.pan) sellerLines.push([`PAN NUMBER - ${seller.pan}`, false])
  for (const [txt, bold] of sellerLines) for (const ln of wrap(txt, 10, bold, LW)) { T(ln, LX, y, { b: bold }); y += LH }

  // Date / balance (right)
  let ry = 114
  T('Date:', 464, ry, { c: GREY, al: 'right' }); T(fmtDate(inv.date), 568, ry, { al: 'right' })
  if (inv.dueDate) { ry += 18; T('Due Date:', 464, ry, { c: GREY, al: 'right' }); T(fmtDate(inv.dueDate), 568, ry, { al: 'right' }) }
  const boxTop = ry + 13
  R(317, boxTop, 270, 26, '#F3F3F3', 4)
  T('Balance Due:', 464, boxTop + 17.5, { b: true, s: 12, al: 'right' })
  T(money(t.balance), 568, boxTop + 17.5, { b: true, s: 12, al: 'right' })

  // Bill to
  y = Math.max(y + 22, 185)
  T('Bill To:', LX, y, { c: GREY }); y += 16
  const billLines: [string, boolean][] = []
  if (client.company) billLines.push([`Company Name: ${client.company}`, true])
  if (client.address) billLines.push([`Billing Address: ${client.address}`, false])
  if (client.gstin) billLines.push([`GST Number: ${client.gstin}`, false])
  if (client.pan) billLines.push([`PAN Number: ${client.pan}`, false])
  for (const [txt, bold] of billLines) for (const ln of wrap(txt, 10, bold, 250)) { T(ln, LX, y, { b: bold }); y += LH }

  // Items table
  const tableHeader = (top: number) => {
    R(29, top, 554, 21, '#333333', 4)
    const by = top + 14
    T('Item', 44, by, { c: '#FFFFFF' }); T('Quantity', 373, by, { c: '#FFFFFF' })
    T('Rate', 493, by, { c: '#FFFFFF', al: 'right' }); T('Amount', 568, by, { c: '#FFFFFF', al: 'right' })
    return top + 21 + 15
  }
  y = tableHeader(Math.max(y + 22, boxTop + 26 + 30))
  let last = y
  for (const it of inv.items || []) {
    const lines = wrap(it.desc || '', 10, true, 315)
    const need = lines.length * 13 + 9
    if (y + need > 740) { page++; y = tableHeader(40) }
    lines.forEach((ln, i) => T(ln, 44, y + i * 13, { b: true }))
    const amount = (Number(it.qty) || 0) * (Number(it.rate) || 0)
    T(trimNum(it.qty), 373, y); T(money(it.rate), 493, y, { al: 'right' }); T(money(amount), 568, y, { al: 'right' })
    last = y + (lines.length - 1) * 13
    y += need
  }

  // Totals
  const rows: [string, string][] = [['Subtotal:', money(t.subtotal)]]
  if (inv.type === 'gst') rows.push([`Tax (${trimNum(t.rate)}%):`, money(t.tax)])
  rows.push(['Total:', money(t.total)])
  if (t.paid > 0) rows.push(['Amount Paid:', money(t.paid)])
  y = last + 64
  if (y + rows.length * 22 > 760) { page++; y = 60 }
  for (const [k, v] of rows) { T(k, 464, y, { c: GREY, al: 'right' }); T(v, 568, y, { al: 'right' }); y += 22 }

  // Notes + terms
  y += 33
  const block = (label: string, text: string | undefined) => {
    if (!text || !String(text).trim()) return
    const lines = String(text).split('\n').flatMap(l => wrap(l, 10, false, 460))
    if (y + 16 + lines.length * 13.5 > 770) { page++; y = 60 }
    T(label, LX, y, { c: GREY }); y += 16
    for (const ln of lines) { T(ln, LX, y); y += 13.5 }
    y += 14
  }
  block('Notes:', inv.notes)
  block('Terms:', seller.terms)
  return { ops, pages: page + 1 }
}

/* ---------- renderers ---------- */
export async function invoiceToPdf(inv: PrintableInvoice): Promise<jsPDF> {
  await loadFonts()
  const logo = await logoData(inv.logo)
  const { ops, pages } = layout(inv, logo)
  const doc = newDoc()
  for (let i = 1; i < pages; i++) doc.addPage()
  for (const op of ops) {
    doc.setPage(op.p + 1)
    if (op.t === 'rect') {
      doc.setFillColor(op.fill)
      if (op.r) doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, 'F'); else doc.rect(op.x, op.y, op.w, op.h, 'F')
    } else if (op.t === 'text') {
      doc.setFont('NS', op.b ? 'bold' : 'normal'); doc.setFontSize(op.s); doc.setTextColor(op.c)
      doc.text(op.str, op.x, op.y, { align: op.al })
    } else {
      const fmt = /^data:image\/png/i.test(op.src) ? 'PNG' : 'JPEG'
      try {
        doc.saveGraphicsState()
        doc.roundedRect(op.x, op.y, op.w, op.h, op.r, op.r, null as unknown as string); doc.clip(); doc.discardPath()
        doc.addImage(op.src, fmt, op.x, op.y, op.w, op.h)
        doc.restoreGraphicsState()
      } catch { try { doc.addImage(op.src, fmt, op.x, op.y, op.w, op.h) } catch { /* logo is optional */ } }
    }
  }
  doc.setProperties({ title: `Invoice ${inv.label || ''}`, creator: 'Pages Desk' })
  return doc
}

export interface PreviewPage { key: number; html: string }
const escH = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
/** HTML for each page; render inside a 612×792 `.inv-page` container scaled to fit. */
export async function invoiceToHtmlPages(inv: PrintableInvoice): Promise<PreviewPage[]> {
  await loadFonts()
  const logo = await logoData(inv.logo)
  const { ops, pages } = layout(inv, logo)
  const out: PreviewPage[] = []
  for (let p = 0; p < pages; p++) {
    const html = ops.filter(o => o.p === p).map(o => {
      if (o.t === 'rect') return `<div class="o" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;background:${o.fill};border-radius:${o.r}px"></div>`
      if (o.t === 'img') return `<img class="o" alt="" src="${escH(o.src)}" style="left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;border-radius:${o.r}px;object-fit:cover">`
      const top = o.y - o.s * 0.86
      const pos = o.al === 'right' ? `right:${PAGE_W - o.x}px` : `left:${o.x}px`
      return `<div class="o" style="${pos};top:${top.toFixed(2)}px;font-size:${o.s}px;font-weight:${o.b ? 700 : 400};color:${o.c}">${escH(o.str)}</div>`
    }).join('')
    out.push({ key: p, html })
  }
  return out
}

const safe = (s: unknown) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
export const invoiceFileName = (inv: Pick<PrintableInvoice, 'label' | 'client'>) =>
  `Invoice ${safe(inv.label)}${inv.client?.company ? ' - ' + safe(inv.client.company) : ''}.pdf`

export async function invoicePdfBlob(inv: PrintableInvoice) {
  return (await invoiceToPdf(inv)).output('blob')
}
export async function invoicesZipBlob(invs: PrintableInvoice[], onProgress?: (done: number, total: number) => void) {
  const z = new JSZip(); const used = new Set<string>()
  for (let i = 0; i < invs.length; i++) {
    const doc = await invoiceToPdf(invs[i])
    let name = invoiceFileName(invs[i]); let n = 2
    while (used.has(name)) name = invoiceFileName(invs[i]).replace(/\.pdf$/, ` (${n++}).pdf`)
    used.add(name)
    z.file(name, doc.output('arraybuffer'))
    onProgress?.(i + 1, invs.length)
  }
  return z.generateAsync({ type: 'blob' })
}
