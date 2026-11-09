/* Right-hand live preview (stacks below the form on narrow screens). */
import { Download } from 'lucide-react'
import { useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { useStore } from '@/data/store'
import { previewPrintable } from '../downloads'
import { InvoicePreview } from '../InvoicePreview'
import { useInvoiceForm } from './formContext'
import { draftPrintable, type InvoiceFormValues, type KeptSeller } from './schema'

export function PreviewColumn({ kept }: { kept: KeptSeller | null }) {
  const { control, getValues } = useInvoiceForm()
  const { settings, counters } = useStore()
  const values = useWatch({ control }) as InvoiceFormValues
  const printable = draftPrintable({ ...getValues(), ...values }, settings, counters, kept)
  return (
    <div className="flex min-w-0 flex-col gap-2.5 min-[1100px]:sticky min-[1100px]:top-4">
      <div className="flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
        <span>Live preview — the PDF looks exactly like this</span>
        <Button type="button" size="sm" variant="outline" onClick={() => previewPrintable(draftPrintable(getValues(), settings, counters, kept))}>
          <Download aria-hidden />Preview PDF
        </Button>
      </div>
      <InvoicePreview invoice={printable} />
    </div>
  )
}
