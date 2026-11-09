/* Create many invoices at once from a grid (or pasted sheet rows). */
import { Download, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { PageHeader, Select } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useStore } from '@/data/store'
import { downloadFile } from '@/lib/files'
import { money, todayKey } from '@/lib/format'
import type { Invoice, InvoiceType } from '@/types'
import { BulkGrid } from './BulkGrid'
import { blankRow, BULK_TEMPLATE, bulkGroups, rowEmpty, type BulkDefaults, type BulkKey, type BulkRow } from './bulkParser'
import { BulkPasteDialog } from './BulkPasteDialog'
import { useInvoiceDownloads } from './downloads'
import { calcTotals, nextLabel, pastClients, plural } from './model'
import { Panel, useScrollTop } from './ui'
import { useBulkCreate } from './useBulkCreate'

const LS_KEY = 'pagesdesk.invoices.bulk'
const three = (d: BulkDefaults) => [blankRow(d), blankRow(d), blankRow(d)]

function loadRows(d: BulkDefaults): BulkRow[] {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (Array.isArray(s) && s.length) {
      return s.filter(r => r && typeof r === 'object').map(r => {
        const row = blankRow(d)
        for (const k of Object.keys(row) as BulkKey[]) if (r[k] != null) (row as Record<string, string>)[k] = String(r[k])
        if (row.type !== 'nongst') row.type = 'gst'
        return row
      })
    }
  } catch { /* ignore */ }
  return three(d)
}

export default function InvoiceBulkPage() {
  const { invoices, settings, counters, readOnly } = useStore()
  const [defaults, setDefaults] = useState<BulkDefaults>(() => ({ type: 'gst', date: todayKey() }))
  const [rows, setRows] = useState<BulkRow[]>(() => loadRows({ type: 'gst', date: todayKey() }))
  const [pasteOpen, setPasteOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<Invoice[] | null>(null)
  const create = useBulkCreate()
  const { downloadMany } = useInvoiceDownloads()
  useScrollTop()

  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(rows)) } catch { /* ignore */ } }, [rows])

  const clients = useMemo(() => [...pastClients(invoices).values()].map(c => c.company), [invoices])
  const { invs, bad } = useMemo(() => bulkGroups(rows, todayKey()), [rows])
  const ok = invs.filter(i => !i.problems.length)
  const gst = ok.filter(i => i.type === 'gst'), nongst = ok.filter(i => i.type === 'nongst')
  const total = ok.reduce((a, i) => a + calcTotals({ ...i, taxRate: settings.taxRate }).total, 0)
  const range = (type: InvoiceType, k: number) =>
    k ? ` (${nextLabel(settings, counters, type)}${k > 1 ? '–' + (settings.profiles[type].prefix || '') + (counters[type] + k - 1) : ''})` : ''

  const onChange = useCallback((i: number, k: BulkKey, v: string) =>
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, [k]: k === 'type' ? (v === 'nongst' ? 'nongst' : 'gst') : v } : r))), [])
  const onRemove = useCallback((i: number) => setRows(prev => {
    const next = prev.filter((_, j) => j !== i)
    return next.length ? next : [blankRow(defaults)]
  }), [defaults])

  const applyDefaults = () => setRows(prev => prev.map(r =>
    rowEmpty(r) ? { ...r, type: defaults.type, date: defaults.date } : r.date ? r : { ...r, date: defaults.date }))
  const addPasted = (pasted: BulkRow[]) => {
    setRows(prev => prev.filter(r => !rowEmpty(r)).concat(pasted))
    setPasteOpen(false)
    toast.success(`Added ${plural(pasted.length, 'row')}`)
  }
  const template = () => { downloadFile('invoice-bulk-template.csv', BULK_TEMPLATE); toast('Template downloaded') }

  async function createAll() {
    if (bad.size || !ok.length) return
    setCreating(true); setFailed(false)
    try {
      const created = await create(ok)
      setRows(three(defaults))
      setResult(created)
      toast.success(`Created ${plural(created.length, 'invoice')}`)
    } catch { setFailed(true) }
    setCreating(false)
  }

  // Rows that need fixing, with the reason, in grid order.
  const badRows = [...bad.entries()].sort((a, b) => a[0] - b[0])

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Invoices', to: '/invoices' }, { label: 'Create multiple' }]}
        title="Create multiple invoices"
        sub={<>Each row is one item. Rows with the same <b>Ref</b> become one invoice with several items; leave Ref empty to make each row its own invoice.</>}
        actions={<>
          <Button variant="outline" onClick={template}><Download aria-hidden />Template</Button>
          <Button variant="outline" onClick={() => setPasteOpen(true)}>Paste from sheet</Button>
        </>}
      />
      <div className="flex flex-wrap items-center gap-2 pt-[18px]">
        <span className="text-[12.5px] text-muted-foreground">Defaults for new rows:</span>
        <label htmlFor="bd-type" className="sr-only">Default type</label>
        <Select id="bd-type" value={defaults.type} onChange={e => setDefaults(d => ({ ...d, type: e.target.value === 'nongst' ? 'nongst' : 'gst' }))}>
          <option value="gst">GST</option><option value="nongst">Non-GST</option>
        </Select>
        <label htmlFor="bd-date" className="sr-only">Default date</label>
        <input id="bd-date" type="date" className="field w-auto" value={defaults.date} onChange={e => setDefaults(d => ({ ...d, date: e.target.value }))} />
        <Button size="sm" variant="outline" onClick={applyDefaults}>Apply to empty cells</Button>
      </div>

      <BulkGrid rows={rows} bad={bad} clients={clients} onChange={onChange} onRemove={onRemove} />

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setRows(prev => [...prev, ...Array.from({ length: 5 }, () => blankRow(defaults))])}><Plus aria-hidden />Add 5 rows</Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setRows(three(defaults))}>Clear all rows</Button>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-[22px] gap-y-2 text-[13.5px] text-ink-2" aria-live="polite">
        <span><b className="font-mono text-foreground">{ok.length}</b> {ok.length === 1 ? 'invoice' : 'invoices'} ready</span>
        <span>GST: <b className="font-mono text-foreground">{gst.length}</b>{range('gst', gst.length)}</span>
        <span>Non-GST: <b className="font-mono text-foreground">{nongst.length}</b>{range('nongst', nongst.length)}</span>
        <span>Total incl. GST: <b className="font-mono text-foreground">{money(total)}</b></span>
        {bad.size > 0 && <span className="text-destructive">{plural(bad.size, 'row')} need fixing (highlighted)</span>}
        <span className="flex-1" />
        <Button onClick={createAll} disabled={!ok.length || bad.size > 0 || creating || readOnly}>
          {creating ? 'Creating…' : failed ? 'Try again' : `Create ${ok.length || ''} invoice${ok.length === 1 ? '' : 's'}`}
        </Button>
      </div>
      {badRows.length > 0 && (
        <ul className="mt-2 flex list-none flex-col gap-0.5 p-0 text-[12.5px] text-destructive">
          {badRows.map(([i, p]) => <li key={i}>Row {i + 1}: needs {p.join(', ')}</li>)}
        </ul>
      )}

      {result && (
        <Panel className="mt-4 px-[18px] py-4">
          <h2 className="m-0 font-display text-lg font-semibold">Created {plural(result.length, 'invoice')}</h2>
          <ul className="mt-3 flex list-none flex-col gap-1.5 p-0">
            {result.map(c => (
              <li key={c.id}><Link to={`/invoices/${c.id}`} className="underline-offset-2 hover:underline">#{c.label} · {c.client.company} · {money(c.total)}</Link></li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => downloadMany(result)}><Download aria-hidden />Download all (ZIP)</Button>
            <Button variant="outline" asChild><Link to="/invoices">Go to invoices</Link></Button>
          </div>
        </Panel>
      )}

      <BulkPasteDialog open={pasteOpen} onOpenChange={setPasteOpen} defaults={defaults} onAdd={addPasted} />
    </>
  )
}
