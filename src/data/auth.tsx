import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, updateProfile, type User,
} from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { auth, googleProvider, usingEmulators } from '@/lib/firebase'

type AuthStatus = 'loading' | 'signedOut' | 'signedIn'
interface AuthCtx {
  user: User | null
  status: AuthStatus
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  /** Local emulator only: sign in as the fake test account. */
  devSignIn?: () => Promise<void>
}
const Ctx = createContext<AuthCtx | null>(null)

const SIGN_IN_ERRORS: Record<string, string> = {
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site (the icon at the right of the address bar), then press Sign in again.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing. Press Sign in and pick your Google account.',
  'auth/cancelled-popup-request': 'Another sign-in window is already open — finish or close it, then try again.',
  'auth/unauthorized-domain': 'This website isn’t on Firebase’s allowed domains yet (Authentication → Settings → Authorized domains).',
  'auth/network-request-failed': 'Couldn’t reach Google. Check your internet connection and try again.',
  'auth/web-storage-unsupported': 'This browser is blocking the storage sign-in needs. Turn off strict tracking protection for this site or use Chrome.',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setStatus(u ? 'signedIn' : 'signedOut') }), [])

  const signIn = useCallback(async () => {
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      console.error('[sign-in]', err.code, err.message)
      setError(SIGN_IN_ERRORS[err.code || ''] || `Sign-in didn’t finish (${err.code || 'unknown error'}).`)
    }
  }, [])
  const signOut = useCallback(async () => { await fbSignOut(auth); location.reload() }, [])

  // Emulator-only test account (see firestore.emulator.rules). Never available in production builds.
  const devSignIn = useMemo(() => !usingEmulators ? undefined : async () => {
    const email = 'tester@example.com', password = 'local-test-only'
    try { await signInWithEmailAndPassword(auth, email, password) } catch {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: 'Test User' })
    }
  }, [])

  const value = useMemo(() => ({ user, status, error, signIn, signOut, devSignIn }), [user, status, error, signIn, signOut, devSignIn])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>')
  return c
}
