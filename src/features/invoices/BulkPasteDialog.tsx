/* Paste rows copied from Google Sheets / Excel into the bulk grid. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { parseBulk, type BulkDefaults, type BulkRow } from './bulkParser'

export function BulkPasteDialog({ open, onOpenChange, defaults, onAdd }: {
  open: boolean; onOpenChange: (v: boolean) => void; defaults: BulkDefaults; onAdd: (rows: BulkRow[]) => void
}) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const change = (v: string) => {
    setText(v)
    const n = parseBulk(v, defaults).length
    setMsg(n ? `${n} row${n === 1 ? '' : 's'} found` : '')
  }
  const add = () => {
    const rows = parseBulk(text, defaults)
    if (!rows.length) { setMsg('No rows found — check the format.'); return }
    onAdd(rows); setText(''); setMsg('')
  }
  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setText(''); setMsg('') } }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Paste rows</DialogTitle>
          <DialogDescription>
            Copy rows from Google Sheets or Excel and paste here. Use the column order{' '}
            <span className="font-mono text-[12px]">ref, type, date, company, address, gstin, pan, item, qty, rate</span>
            {' '}— or include a header row with those names in any order.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="bp-text" className="sr-only">Rows</label>
        <textarea id="bp-text" rows={8} autoFocus className="field font-mono text-[12.5px]" placeholder="Paste here…" value={text} onChange={e => change(e.target.value)} aria-describedby="bp-msg" />
        <p id="bp-msg" className="m-0 min-h-5 text-[12.5px] text-muted-foreground" aria-live="polite">{msg}</p>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={add}>Add rows</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
