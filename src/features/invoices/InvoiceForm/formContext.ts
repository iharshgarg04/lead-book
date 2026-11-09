import { useFormContext } from 'react-hook-form'
import type { InvoiceFormOutput, InvoiceFormValues } from './schema'

export const useInvoiceForm = () => useFormContext<InvoiceFormValues, unknown, InvoiceFormOutput>()
/** Native control styling + red border when invalid. */
export const inputCls = 'field aria-[invalid=true]:border-destructive'
export const upper = (v: unknown) => String(v ?? '').toUpperCase()
