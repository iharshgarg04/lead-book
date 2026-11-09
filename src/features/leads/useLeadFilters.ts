/* All-leads filter state: restored from localStorage, paged list derived with useMemo. */
import { useCallback, useMemo, useState } from 'react'
import type { Lead, LeadStatus } from '@/types'
import { BLANK_F, filterLeads, loadPrefs, type Filters } from './filters'

export const PAGE_SIZE = 150

export function useLeadFilters(leads: Lead[]) {
  const [f, setF] = useState<Filters>(() => loadPrefs().f)
  const [shown, setShown] = useState(PAGE_SIZE)

  /** Merge a change into the filters (resets paging). */
  const update = useCallback((p: Partial<Filters>) => { setF(prev => ({ ...prev, ...p })); setShown(PAGE_SIZE) }, [])
  /** Replace all filters, e.g. from a "See all" preset. */
  const replace = useCallback((next: Filters) => { setF(next); setShown(PAGE_SIZE) }, [])
  /** Clear every filter but keep the sort. */
  const clear = useCallback(() => { setF(prev => ({ ...BLANK_F(), sort: prev.sort })); setShown(PAGE_SIZE) }, [])
  const toggleStatus = useCallback((s: LeadStatus) => {
    setF(prev => ({ ...prev, st: prev.st.includes(s) ? prev.st.filter(x => x !== s) : [...prev.st, s] }))
    setShown(PAGE_SIZE)
  }, [])
  const showMore = useCallback(() => setShown(n => n + PAGE_SIZE), [])

  const list = useMemo(() => filterLeads(leads, f), [leads, f])
  return { f, update, replace, clear, toggleStatus, list, shown, showMore }
}
export type LeadFiltersApi = ReturnType<typeof useLeadFilters>
