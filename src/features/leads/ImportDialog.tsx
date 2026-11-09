/* Import leads: paste rows or drop a CSV/TSV, or restore a Lead Book backup (.json). */
import { Download } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { Pill } from '@/components/common'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useStore, writeErrorMessage } from '@/data/store'
import { downloadFile, readTextFile } from '@/lib/files'
import { fmtPhone, monthKeyOf, monthLabelOf, nowIso } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LeadNote } from '@/types'
import { MODAL_CLS, MODAL_TITLE } from './AddLeadDialog'
import { commitInBatches, isPermissionError, type BatchOp } from './batch'
import { Btn, Tag } from './bits'
import { isBackup, makeId, newLeadDoc, previewRows, TEMPLATE, type ImportRow, type LeadBookBackup } from './importParser'
import { PKG, TL } from './model'

const READ_ONLY_MSG = 'View only — this Google account can’t make changes.'

function useImportWriter() {
  const { getLead, months, meId, readOnly, setReadOnly } = useStore()
  const report = (e: unknown) => { if (isPermissionError(e)) setReadOnly(true); toast.error(writeErrorMessage(e)) }

  /** New rows become leads; existing ones get a "filled the form again" entry (optional). */
  async function importRows(rows: ImportRow[], doDupes: boolean, progress: (label: string) => void) {
    const fresh = rows.filter(r => !r.existing), old = doDupes ? rows.filter(r => r.existing) : []
    const total = fresh.length + old.length
    progress(`Saving 0 of ${total}…`)
    const known = new Set(months.map(m => m.key))
    const monthOps: BatchOp[] = [...new Set(fresh.map(r => monthKeyOf(r.created || new Date())))]
      .filter(k => !known.has(k))
      .map(k => ({ kind: 'set', path: `months/${k}`, data: { key: k, label: monthLabelOf(k) } }))
    if (monthOps.length) {
      const m = await commitInBatches(monthOps, undefined, { stopOnError: true })
      if (m.error) { report(m.error); return { ok: false as const } }
    }
    const ops: BatchOp[] = fresh.map((r, i) => ({ kind: 'set', path: `months/${monthKeyOf(r.created || new Date())}/leads/${makeId(r)}`, data: newLeadDoc(r, i, meId) }))
    for (const r of old) {
      const l = r.existing && getLead(r.existing.path); if (!l) continue
      const entry: LeadNote = { kind: 'status', s: l.status || 'new', t: 'Filled the form again', at: nowIso(), by: meId }
      if (r.notes.length) entry.note = r.notes.join(' · ')
      const patch: Record<string, unknown> = { enquiries: (l.enquiries || 1) + 1, notes: [...l.notes, entry], updatedAt: nowIso(), updatedBy: meId }
      if (l.status === 'no_answer' || l.status === 'lost') Object.assign(patch, { status: 'new', attempts: 0, nextAt: null })
      ops.push({ kind: 'update', path: l.path, data: patch })
    }
    const res = await commitInBatches(ops, done => progress(`Saving ${done} of ${total}…`))
    const failed = res.failed
    if (res.error) report(res.error)
    toast(failed
      ? `Saved ${total - failed} of ${total}. ${failed} didn’t save — try importing them again.`
      : `Imported ${fresh.length} new lead${fresh.length === 1 ? '' : 's'}${old.length ? `, updated ${old.length}` : ''}`)
    return { ok: true as const, fresh: fresh.length }
  }

  async function restore(json: LeadBookBackup, progress: (label: string) => void) {
    const ops: BatchOp[] = [
      ...(json.months || []).map(m => ({ kind: 'set' as const, path: `months/${m.id}`, data: m.data })),
      ...json.leads.map(r => ({ kind: 'set' as const, path: `months/${r.month}/leads/${r.id}`, data: r.data })),
    ]
    try {
      const res = await commitInBatches(ops, done => progress(`Restoring ${done} of ${ops.length}…`), { stopOnError: true })
      if (res.error) { report(res.error); return false }
    } catch (e) { report(e); return false }
    toast(`Restored ${json.leads.length} leads`)
    return true
  }
  return { importRows, restore, readOnly }
}

function Preview({ rows }: { rows: ImportRow[] }) {
  const fresh = rows.filter(r => !r.existing).length
  return (
    <>
      <div className="mb-2.5 flex flex-wrap gap-x-[18px] gap-y-2 text-[13.5px] text-ink-2">
        <span><b className="font-mono text-foreground">{fresh}</b> new</span>
        <span><b className="font-mono text-foreground">{rows.length - fresh}</b> already in the list</span>
      </div>
      <div className="overflow-x-auto rounded-[10px] border">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-muted text-left text-[11px] tracking-[0.06em] text-muted-foreground uppercase">
              {['', 'Name', 'Phone', 'Company', 'Package', 'Go-live', 'Notes'].map((h, i) => <th key={i} scope="col" className="px-2.5 py-[7px] font-semibold whitespace-nowrap">{h || <span className="sr-only">Status</span>}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r, i) => (
              <tr key={i} className="border-t [&>td]:max-w-[220px] [&>td]:truncate [&>td]:px-2.5 [&>td]:py-[7px] [&>td]:whitespace-nowrap">
                <td>{r.existing ? <Tag>exists</Tag> : <Pill data-s="new">New</Pill>}</td>
                <td>{r.name}</td>
                <td className="font-mono">{fmtPhone(r.phone)}</td>
                <td>{r.company}</td>
                <td>{(r.package && PKG[r.package]?.label) || ''}</td>
                <td>{(r.timeline && TL[r.timeline]?.short) || ''}</td>
                <td>{r.notes.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 12 && <p className="mt-2 mb-0 text-[12.5px] text-muted-foreground">…and {rows.length - 12} more</p>}
    </>
  )
}

function ImportBody({ onClose, onImported }: { onClose: () => void; onImported: (fresh: number) => void }) {
  const { leads } = useStore()
  const { importRows, restore, readOnly } = useImportWriter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [parsedText, setParsedText] = useState('')
  const [fileName, setFileName] = useState('')
  const [over, setOver] = useState(false)
  const [dupes, setDupes] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [failedOnce, setFailedOnce] = useState(false)
  const [error, setError] = useState('')
  const [backup, setBackup] = useState<LeadBookBackup | null>(null)
  const [frozen, setFrozen] = useState<ImportRow[] | null>(null)

  // Re-parse 200 ms after typing stops.
  useEffect(() => {
    if (parsedText === text) return
    const t = setTimeout(() => setParsedText(text), 200)
    return () => clearTimeout(t)
  }, [text, parsedText])
  const live = useMemo(() => previewRows(parsedText, leads), [parsedText, leads])
  const rows = frozen || live.rows
  const fresh = rows.filter(r => !r.existing).length, old = rows.length - fresh
  const hasText = !!parsedText.trim()

  const onText = (v: string) => { setText(v); setBackup(null); setError(''); setFailedOnce(false) }

  async function takeFile(file: File | undefined) {
    if (!file) return
    setError(''); setFailedOnce(false)
    if (/\.json$/i.test(file.name)) {
      setFileName(file.name)
      try {
        const json: unknown = JSON.parse(await readTextFile(file))
        if (!isBackup(json)) { toast('That file isn’t a Lead Book backup.'); return }
        if (readOnly) { toast('You need edit access to restore a backup.'); return }
        setBackup(json)
      } catch { setBackup(null); setError('That backup file couldn’t be read.') }
      return
    }
    try {
      const t = await readTextFile(file)
      setBackup(null); setText(t); setParsedText(t); setFileName(file.name)
    } catch { setError('Couldn’t read that file. Save it as CSV and try again.') }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); takeFile(e.dataTransfer.files[0]) }

  async function go() {
    if (busy) return
    if (readOnly) { toast.error(READ_ONLY_MSG); return }
    if (!fresh && !(dupes && old)) return
    setFrozen(rows)
    const r = await importRows(rows, dupes, setBusy)
    if (!r.ok) { setBusy(null); setFrozen(null); setFailedOnce(true); return }
    onClose()
    if (r.fresh) onImported(r.fresh)
  }
  async function runRestore(json: LeadBookBackup) {
    if (busy) return
    const ok = await restore(json, setBusy)
    if (ok) onClose()
    else { setBusy(null); setFailedOnce(true) }
  }

  const existing = useMemo(() => new Set(leads.map(l => l.path)), [leads])
  const clash = backup ? backup.leads.filter(r => existing.has(`months/${r.month}/leads/${r.id}`)).length : 0
  const goLabel = busy && !backup ? busy : failedOnce && !backup ? 'Try again' : fresh ? `Add ${fresh} lead${fresh === 1 ? '' : 's'}` : hasText && rows.length ? 'Update existing' : 'Add leads'

  return (
    <>
      <ul className="m-0 -mt-2 mb-1 grid max-w-[62ch] list-disc gap-1 pl-[18px] text-[13.5px] text-ink-2">
        <li><b>Google Sheet rows</b> — select rows, copy (Ctrl/⌘ + C) and paste below.</li>
        <li><b>Meta Leads Center CSV</b> — upload the file as it is.</li>
        <li>
          <b>Your own list</b> — use our template. Columns: <span className="font-mono text-xs">name, phone, email, company, package, go_live, date, rating, notes</span>.
          Only <b>phone</b> or <b>email</b> is required; <b>date</b> (DD/MM/YYYY) decides the month the lead is filed under.
          <br />
          <Btn size="sm" className="mt-2" onClick={() => { downloadFile('lead-import-template.csv', TEMPLATE); toast('Template saved') }}><Download aria-hidden />Download template</Btn>
        </li>
      </ul>
      <p className="m-0 max-w-[62ch] text-[13.5px] text-ink-2">
        Numbers already in the list won’t be added twice. Moving from an older Lead Book? Choose its <b>backup .json</b> file below to restore everything, history included.
      </p>

      <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
        className={cn('flex flex-col gap-2.5 rounded-xl border-[1.5px] border-dashed border-input p-3.5', over && 'border-primary bg-primary/10')}>
        <label htmlFor="i-text" className="sr-only">Rows to import</label>
        <textarea id="i-text" rows={6} className="field resize-y" placeholder="Paste rows here…" value={text} onChange={e => onText(e.target.value)} autoFocus />
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground">
          <Btn size="sm" onClick={() => fileRef.current?.click()}>Choose file</Btn>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" className="hidden" aria-hidden tabIndex={-1}
            onChange={e => { takeFile(e.target.files?.[0]); e.target.value = '' }} />
          <span aria-live="polite">{fileName || 'or drop a file here'}</span>
        </div>
      </div>

      <div aria-live="polite">
        {error ? <p className="m-0 text-[13px] text-destructive">{error}</p>
          : backup ? (
            <>
              <div className="mb-2.5 flex flex-wrap gap-x-[18px] gap-y-2 text-[13.5px] text-ink-2">
                <span><b className="font-mono text-foreground">{backup.leads.length}</b> leads in backup</span>
                <span><b className="font-mono text-foreground">{(backup.months || []).length}</b> months</span>
                {clash > 0 && <span><b className="font-mono text-foreground">{clash}</b> will overwrite leads already here</span>}
              </div>
              <Btn variant="primary" disabled={!!busy} onClick={() => runRestore(backup)}>
                {busy || (failedOnce ? 'Try again' : `Restore ${backup.leads.length} leads`)}
              </Btn>
            </>
          ) : hasText && !live.parsed ? <p className="m-0 text-[13px] text-destructive">No leads found. Each row needs a phone number or an email.</p>
            : hasText ? <Preview rows={rows} /> : null}
      </div>

      <div className="flex items-start gap-2 text-[13px] text-ink-2">
        <Checkbox id="i-dupe" checked={dupes} onCheckedChange={v => setDupes(v === true)} className="mt-0.5" />
        <label htmlFor="i-dupe">For people already in the list, add a “filled the form again” note — and move any marked Not picked or Not interested back to New.</label>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" disabled={!!busy || !hasText || !rows.length || !!backup} onClick={go}>{goLabel}</Btn>
      </div>
    </>
  )
}

export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (fresh: number) => void }) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className={cn(MODAL_CLS, 'gap-3.5')}>
        <DialogTitle className={MODAL_TITLE}>Import leads</DialogTitle>
        <DialogDescription className="-mt-1 text-[13.5px] text-ink-2">No special format needed. Any of these work:</DialogDescription>
        <ImportBody onClose={onClose} onImported={onImported} />
      </DialogContent>
    </Dialog>
  )
}
