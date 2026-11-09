import { useSyncExternalStore } from 'react'

const QUERY = '(max-width: 767px)'

/** True on phone-width screens, where the lead panel becomes a bottom sheet. */
export function useIsPhone() {
  return useSyncExternalStore(
    cb => { const m = matchMedia(QUERY); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => matchMedia(QUERY).matches,
    () => false,
  )
}
