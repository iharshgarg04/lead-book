import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore'
import { firebaseConfig } from './firebase-config'

/** Set VITE_USE_EMULATORS=1 (see .env.emulator) to run against the local Firebase emulators. */
export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === '1'

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// In-memory cache only. An on-disk (IndexedDB) cache can hang forever when a tab running an
// older Firebase version holds the same database open, so we trade offline start-up for reliability.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: memoryLocalCache() })

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
