import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/data/auth'
import { useStore } from '@/data/store'

function GateCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-6">
      <div className="flex w-full max-w-[380px] flex-col items-start gap-3.5 rounded-[18px] border bg-card px-6 py-7 shadow-sm">
        <img src={`${import.meta.env.BASE_URL}assets/pages-logo.jpg`} alt="Pages Production" className="w-40 rounded-lg" />
        {children}
      </div>
    </div>
  )
}

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
    <path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
    <path fill="currentColor" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
    <path fill="currentColor" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" />
    <path fill="currentColor" opacity=".9" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
  </svg>
)

/** Shows sign-in / no-access screens; renders children once the user can see data. */
export function Gate({ children }: { children: ReactNode }) {
  const { status, error, signIn, signOut, user } = useAuth()
  const { denied } = useStore()

  if (status === 'loading') return <GateCard><h2 className="font-display text-2xl font-bold">Pages Desk</h2><p className="text-sm text-ink-2">Signing you in…</p></GateCard>
  if (status === 'signedOut') return (
    <GateCard>
      <h2 className="font-display text-2xl font-bold">Pages Desk</h2>
      <p className="text-sm leading-relaxed text-ink-2">Sign in with the Google account you use for leads and invoices.</p>
      <Button size="lg" className="mt-3 w-full" onClick={signIn}><GoogleMark />Sign in with Google</Button>
      {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
    </GateCard>
  )
  if (denied) return (
    <GateCard>
      <h2 className="font-display text-2xl font-bold">No access yet</h2>
      <p className="text-sm leading-relaxed text-ink-2"><b>{user?.email}</b> isn’t on this workspace’s list. Ask Harsh to add this email, or sign in with another account.</p>
      <Button variant="outline" className="mt-3 w-full" onClick={signOut}>Use another account</Button>
    </GateCard>
  )
  return <>{children}</>
}
