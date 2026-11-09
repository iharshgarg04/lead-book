/* PDF / ZIP downloads with progress toasts. The logo always comes from settings. */
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/data/store'
import { downloadFile } from '@/lib/files'
import { todayKey } from '@/lib/format'
import type { Invoice } from '@/types'
import { toPrintable } from './model'
import { invoiceFileName, invoicePdfBlob, invoicesZipBlob, type PrintableInvoice } from './pdf'

const errText = (e: unknown) => (e as Error)?.message || 'unknown error'

export async function downloadPrintable(p: PrintableInvoice) {
  const id = toast.loading('Preparing PDF…')
  try {
    downloadFile(invoiceFileName(p), await invoicePdfBlob(p))
    toast.success(`Downloaded invoice ${p.label}`, { id })
  } catch (e) {
    console.error(e)
    toast.error(`Couldn’t create the PDF: ${errText(e)}`, { id })
  }
}

/** Open the PDF in a new tab; download it if pop-ups are blocked. */
export async function previewPrintable(p: PrintableInvoice) {
  try {
    const blob = await invoicePdfBlob(p)
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (!w) downloadFile(invoiceFileName(p), blob)
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    toast.error(`Couldn’t create the PDF: ${errText(e)}`)
  }
}

export function useInvoiceDownloads() {
  const { settings } = useStore()
  const logo = settings.logo || ''
  const downloadOne = useCallback((inv: Invoice) => downloadPrintable(toPrintable(inv, logo)), [logo])
  const downloadMany = useCallback(async (invs: Invoice[], name = `Invoices ${todayKey()}.zip`) => {
    if (!invs.length) { toast('No invoices to download.'); return }
    if (invs.length === 1) return downloadOne(invs[0])
    const id = toast.loading(`Creating PDFs… 0 of ${invs.length}`)
    try {
      const blob = await invoicesZipBlob(invs.map(i => toPrintable(i, logo)), (i, n) => toast.loading(`Creating PDFs… ${i} of ${n}`, { id }))
      downloadFile(name, blob)
      toast.success(`Downloaded ${invs.length} invoices (ZIP)`, { id })
    } catch (e) {
      console.error(e)
      toast.error(`Couldn’t create the ZIP: ${errText(e)}`, { id })
    }
  }, [downloadOne, logo])
  return useMemo(() => ({ downloadOne, downloadMany }), [downloadOne, downloadMany])
}
