import { FileText, LayoutGrid, Phone, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/data/auth'
import { useStore } from '@/data/store'
import { dueState } from '@/features/leads/model'
import { invoiceStatus } from '@/features/invoices/model'
import { cn } from '@/lib/utils'

interface NavItem { to: string; label: string; icon: LucideIcon; count?: number }

function useNav(): NavItem[] {
  const { leads, invoices } = useStore()
  const due = useMemo(() => leads.filter(l => { const d = dueState(l); return d === 'overdue' || d === 'today' }).length, [leads])
  const unpaid = useMemo(() => invoices.filter(i => ['unpaid', 'partial'].includes(invoiceStatus(i))).length, [invoices])
  return [
    { to: '/overview', label: 'Overview', icon: LayoutGrid },
    { to: '/leads', label: 'Leads', icon: Phone, count: due },
    { to: '/invoices', label: 'Invoices', icon: FileText, count: unpaid },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ]
}

function Banner() {
  const { error, slow, readOnly, leads } = useStore()
  let msg = ''
  if (error) msg = `Data stopped updating (${error}). Reload the page to reconnect.`
  else if (readOnly) msg = 'You can view this data but not change it. Ask Harsh to give this Google account edit access.'
  else if (slow) msg = leads.length ? 'Can’t reach the database right now — what you see may be out of date. This page keeps trying.' : 'Still connecting to the database… check your internet connection.'
  if (!msg) return null
  return <div role="status" className="mb-4 rounded-lg border border-[color-mix(in_srgb,var(--s-callback)_30%,transparent)] bg-[var(--s-callback-bg)] px-3.5 py-2.5 text-[13.5px]">{msg}</div>
}

export function AppShell() {
  const nav = useNav()
  const { user, signOut } = useAuth()
  return (
    <div className="flex min-h-screen">
      <aside aria-label="Main" className="sticky top-0 hidden h-screen w-[228px] flex-none flex-col gap-[18px] bg-side px-3 pt-4 pb-[18px] text-side-ink md:flex">
        <NavLink to="/overview" className="block overflow-hidden rounded-[10px]" aria-label="Pages Production — Overview">
          <img src={`${import.meta.env.BASE_URL}assets/pages-logo.jpg`} alt="Pages Production" className="block w-full" />
        </NavLink>
        <nav className="flex flex-col gap-0.5">
          {nav.map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cn(
              'flex items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-sm font-semibold transition-colors',
              isActive ? 'bg-lime/12 text-side-hi [&_svg]:text-lime' : 'hover:bg-white/6 hover:text-white')}>
              <n.icon className="size-[18px] flex-none" aria-hidden /><span>{n.label}</span>
              {!!n.count && <em className="ml-auto rounded-full bg-lime px-[7px] py-0.5 font-mono text-[11px] font-semibold text-side not-italic">{n.count}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5 px-3 text-[12.5px]">
          <div className="font-semibold text-white">{user?.displayName || 'Signed in'}</div>
          <div className="break-all">{user?.email}</div>
          <button type="button" onClick={signOut} className="mt-1.5 self-start underline underline-offset-2 hover:text-white">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1240px] px-4 pt-4 pb-28 sm:px-6 md:pt-5 md:pb-24">
          <Banner />
          <Outlet />
        </div>
      </main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex bg-side px-1.5 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))] md:hidden">
        {nav.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => cn(
            'relative flex flex-1 flex-col items-center gap-[3px] rounded-lg px-0.5 py-1.5 text-[11px] font-semibold text-side-ink',
            isActive && 'bg-lime/10 text-side-hi')}>
            <n.icon className="size-5" aria-hidden />{n.label}
            {!!n.count && <em className="absolute top-0.5 left-[calc(50%+6px)] rounded-full bg-lime px-[5px] py-px font-mono text-[10px] font-semibold text-side not-italic">{n.count}</em>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
