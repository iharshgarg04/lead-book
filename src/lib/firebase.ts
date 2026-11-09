import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore'
import { firebaseConfig } from './firebase-config'

/** Set VITE_USE_EMULATORS=1 (see .env.emulator) to run against the local Firebase emulators. */
export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === '1'

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // Offline cache so the app opens instantly and survives brief connection drops.
  ...(usingEmulators ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
})

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
