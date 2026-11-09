/* Spreadsheet-like grid of bulk rows (one row = one item). */
import { X } from 'lucide-react'
import { memo } from 'react'
import { cn } from '@/lib/utils'
import { BULK_COLS, type BulkKey, type BulkRow } from './bulkParser'

const cellCls = 'field h-auto rounded-[7px] px-2 py-[7px] text-[13px]'

const GridRow = memo(function GridRow({ r, i, bad, onChange, onRemove }: {
  r: BulkRow; i: number; bad?: string[]; onChange: (i: number, k: BulkKey, v: string) => void; onRemove: (i: number) => void
}) {
  return (
    <tr className={cn(bad && '[&>td]:bg-[color-mix(in_srgb,var(--s-lost-bg)_60%,transparent)]')} title={bad ? `Needs ${bad.join(', ')}` : undefined}>
      <td className="border-t px-2 py-3 text-center align-top font-mono text-[12px] font-medium text-muted-foreground">{i + 1}</td>
      {BULK_COLS.map(([k, label]) => {
        const id = `b-${k}-${i}`
        const common = { id, value: r[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(i, k, e.target.value), 'aria-invalid': !!bad || undefined }
        return (
          <td key={k} className="border-t px-1 py-[5px] align-top">
            <label htmlFor={id} className="sr-only">{label} row {i + 1}</label>
            {k === 'type' ? (
              <select {...common} className={cn(cellCls, 'pr-6')}><option value="gst">GST</option><option value="nongst">Non-GST</option></select>
            ) : k === 'date' ? (
              <input {...common} type="date" className={cellCls} />
            ) : k === 'address' || k === 'desc' ? (
              <textarea {...common} rows={1} className={cn(cellCls, 'min-h-[34px] resize-y')} />
            ) : (
              <input {...common} type="text" className={cn(cellCls, (k === 'gstin' || k === 'pan') && 'uppercase')}
                inputMode={k === 'qty' || k === 'rate' ? 'decimal' : undefined} list={k === 'company' ? 'bulk-clients' : undefined} autoComplete="off" />
            )}
          </td>
        )
      })}
      <td className="border-t px-1 py-[5px] align-top">
        <button type="button" onClick={() => onRemove(i)} aria-label={`Remove row ${i + 1}`}
          className="grid h-9 w-[30px] place-items-center rounded-lg text-muted-foreground hover:bg-[var(--s-lost-bg)] hover:text-destructive">
          <X className="size-[15px]" aria-hidden />
        </button>
      </td>
    </tr>
  )
})

export function BulkGrid({ rows, bad, clients, onChange, onRemove }: {
  rows: BulkRow[]; bad: Map<number, string[]>; clients: string[]
  onChange: (i: number, k: BulkKey, v: string) => void; onRemove: (i: number) => void
}) {
  return (
    <div className="relative mt-3 overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[1180px] border-collapse text-[13px]">
        <caption className="sr-only">Invoice rows — one item per row</caption>
        <thead>
          <tr>
            <th scope="col" className="bg-muted px-2 py-[9px] text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase">#</th>
            {BULK_COLS.map(([k, l, w]) => (
              <th key={k} scope="col" style={{ minWidth: w }} className="bg-muted px-2 py-[9px] text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-muted-foreground uppercase">{l}</th>
            ))}
            <th scope="col" className="bg-muted"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <GridRow key={i} r={r} i={i} bad={bad.get(i)} onChange={onChange} onRemove={onRemove} />)}
        </tbody>
      </table>
      <datalist id="bulk-clients">{clients.map(c => <option key={c} value={c} />)}</datalist>
    </div>
  )
}
