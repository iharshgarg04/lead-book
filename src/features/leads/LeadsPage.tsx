/* Leads module: Today call list, All leads, lead drawer, add / import / export. */
import { Download, Plus, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common'
import { useStore } from '@/data/store'
import { MO, WD } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'
import { useLeadActions } from './actions'
import { AddLeadDialog } from './AddLeadDialog'
import { AllLeadsView } from './AllLeadsView'
import { Btn } from './bits'
import { PRESET_KEYS, presetFromQuery, presetToQuery, savePrefs, todaySections, type LeadsView, type TodaySection } from './filters'
import { isTypingTarget } from './helpers'
import { exportLeadsCsv } from './exportCsv'
import { ImportDialog } from './ImportDialog'
import { LeadDrawer, type DrawerState } from './LeadDrawer'
import { dueState, newestCmp } from './model'
import { TodayView } from './TodayView'
import { useLeadFilters } from './useLeadFilters'

type Modal = null | 'add' | 'import'

function Tabs({ view, due, total, onPick }: { view: LeadsView; due: number; total: number; onPick: (v: LeadsView) => void }) {
  const tab = (v: LeadsView, label: string, n: number, hot: boolean) => (
    <button type="button" role="tab" id={`tab-${v}`} aria-selected={view === v} aria-controls={`view-${v}`} onClick={() => onPick(v)}
      className="-mb-px border-b-2 border-transparent bg-transparent px-3.5 pt-3 pb-[11px] text-[14.5px] font-semibold text-muted-foreground hover:text-foreground aria-selected:border-primary aria-selected:text-foreground">
      {label}
      {total > 0 && (
        <span className={cn('ml-[5px] rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-muted-foreground',
          hot && view === v && 'bg-primary text-primary-foreground')}>{n}</span>
      )}
    </button>
  )
  return (
    <nav role="tablist" aria-label="Views" className="sticky top-0 z-[5] mt-5 flex gap-0.5 border-b bg-background">
      {tab('today', 'Today', due, due > 0)}
      {tab('all', 'All leads', total, false)}
    </nav>
  )
}

export default function LeadsPage() {
  const params = useParams()
  const view: LeadsView = params.view === 'all' ? 'all' : 'today'
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const { leads, months, ready, readOnly, getLead } = useStore()
  const actions = useLeadActions()
  const filters = useLeadFilters(leads)
  const sections = useMemo(() => todaySections(leads), [leads])
  const todayQueue = useMemo(() => [...new Set(sections.flatMap(s => s.items.map(l => l.path)))], [sections])
  const due = useMemo(() => leads.filter(l => { const d = dueState(l); return d === 'overdue' || d === 'today' }).length, [leads])
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [wantSearch, setWantSearch] = useState(false)

  const allQueue = useMemo(() => filters.list.map(l => l.path), [filters.list])
  const openLead = useCallback((path: string, ctx: 'today' | 'all') => {
    let queue = ctx === 'all' ? allQueue : todayQueue
    if (!queue.includes(path)) queue = [path]
    setModal(null)
    setDrawer({ path, queue, open: true })
  }, [allQueue, todayQueue])
  const closeDrawer = useCallback(() => setDrawer(d => (d ? { ...d, open: false } : d)), [])
  const navigateDrawer = useCallback((path: string) => setDrawer(d => (d ? { ...d, path } : d)), [])

  // Remember the view and filters (legacy key, so old preferences carry over).
  useEffect(() => { savePrefs(view, filters.f) }, [view, filters.f])

  // ?lead=<path> opens that lead; on /leads/all, ?rate=hot&st=new&fu=none… preset the filters.
  const { replace: replaceFilters } = filters
  useEffect(() => {
    const strip: string[] = []
    const preset = view === 'all' ? presetFromQuery(sp) : null
    if (preset) { replaceFilters(preset); strip.push(...PRESET_KEYS) }
    const leadParam = sp.get('lead')
    if (leadParam) {
      if (getLead(leadParam)) { openLead(leadParam, 'all'); strip.push('lead') }
      else if (ready) strip.push('lead')
    }
    if (strip.length) {
      const next = new URLSearchParams(sp)
      strip.forEach(k => next.delete(k))
      setSp(next, { replace: true })
    }
  }, [sp, view, getLead, ready, openLead, replaceFilters, setSp])

  // A lead that disappears while open was deleted elsewhere.
  useEffect(() => {
    if (drawer?.open && ready && !getLead(drawer.path)) {
      setDrawer(d => (d ? { ...d, open: false } : d))
      toast('That lead was deleted.')
    }
  }, [drawer, ready, getLead])

  // "/" jumps to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || isTypingTarget(e.target) || drawer?.open || modal || e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      if (view !== 'all') navigate('/leads/all')
      setWantSearch(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer?.open, modal, view, navigate])
  useEffect(() => {
    if (wantSearch && view === 'all') { searchRef.current?.focus(); setWantSearch(false) }
  }, [wantSearch, view])

  const pickView = (v: LeadsView) => navigate(v === 'all' ? '/leads/all' : '/leads')
  const seeAll = (s: TodaySection) => {
    const q = presetToQuery({ ...s.all })
    navigate(`/leads/all?${q || 'sort=newest'}`)
    window.scrollTo(0, 0)
  }
  const onDelete = (l: Lead) => { closeDrawer(); actions.deleteLead(l) }
  const doExport = () => exportLeadsCsv(view === 'all' ? filters.list : [...leads].sort(newestCmp), months)
  const notPicked = (path: string) => { actions.setStatus(path, 'no_answer') }
  const t = new Date()

  return (
    <>
      <PageHeader
        title="Leads"
        sub={`${WD[t.getDay()]} ${t.getDate()} ${MO[t.getMonth()]} · UGC ad enquiries`}
        actions={<>
          <Btn onClick={doExport} aria-label="Export CSV"><Download aria-hidden /><span className="max-[600px]:hidden">Export</span></Btn>
          <Btn onClick={() => setModal('import')} disabled={readOnly} aria-label="Import leads"><Upload aria-hidden /><span className="max-[600px]:hidden">Import</span></Btn>
          <Btn variant="primary" onClick={() => setModal('add')} disabled={readOnly}><Plus aria-hidden strokeWidth={2.4} />Add lead</Btn>
        </>}
      />
      <Tabs view={view} due={due} total={leads.length} onPick={pickView} />

      <div role="tabpanel" id={`view-${view}`} aria-labelledby={`tab-${view}`}>
        {view === 'today' ? (
          <TodayView leads={leads} sections={sections} ready={ready} readOnly={readOnly}
            onOpen={p => openLead(p, 'today')} onNotPicked={notPicked} onSeeAll={seeAll}
            onImport={() => setModal('import')} onAdd={() => setModal('add')} />
        ) : (
          <AllLeadsView leads={leads} months={months} ready={ready} filters={filters} searchRef={searchRef} onOpen={p => openLead(p, 'all')} />
        )}
      </div>

      <LeadDrawer state={drawer} actions={actions} readOnly={readOnly} shortcutsBlocked={!!modal}
        onClose={closeDrawer} onNavigate={navigateDrawer} onDelete={onDelete} />
      <AddLeadDialog open={modal === 'add'} onClose={() => setModal(null)} actions={actions} onOpenLead={p => openLead(p, 'all')} />
      <ImportDialog open={modal === 'import'} onClose={() => setModal(null)} onImported={() => navigate('/leads')} />
    </>
  )
}
