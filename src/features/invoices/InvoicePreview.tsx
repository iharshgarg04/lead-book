import { useEffect, useRef, useState } from 'react'
import { invoiceToHtmlPages, PAGE_H, PAGE_W, type PreviewPage, type PrintableInvoice } from './pdf'

/** Live, scaled preview of an invoice — drawn from the same layout as the PDF. */
export function InvoicePreview({ invoice, debounce = 120 }: { invoice: PrintableInvoice; debounce?: number }) {
  const [pages, setPages] = useState<PreviewPage[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const key = JSON.stringify(invoice)

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      invoiceToHtmlPages(invoice).then(p => { if (alive) { setPages(p); setErr(null) } })
        .catch(e => { if (alive) setErr((e as Error).message || 'Preview unavailable') })
    }, debounce)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, debounce])

  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const k = width ? width / PAGE_W : 1
  return (
    <div ref={wrapRef} className="flex w-full flex-col gap-3.5">
      {err && <div className="rounded-xl border border-dashed px-5 py-6 text-center text-muted-foreground">Preview unavailable: {err}</div>}
      {!pages && !err && <div className="animate-pulse rounded-md bg-card" style={{ height: width ? PAGE_H * k : 400 }} />}
      {pages?.map(p => (
        <div key={p.key} className="relative w-full overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,.08),0_10px_30px_rgba(20,22,40,.12)]" style={{ height: PAGE_H * k }}>
          <div className="inv-page" style={{ transform: `scale(${k})` }} dangerouslySetInnerHTML={{ __html: p.html }} />
        </div>
      ))}
    </div>
  )
}
