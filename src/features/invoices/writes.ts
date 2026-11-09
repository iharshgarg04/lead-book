/* Guard + error reporting for writes that go straight to Firestore (transactions,
   batches, addDoc) instead of through useWriter(). */
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useStore, writeErrorMessage } from '@/data/store'

export function useGuardedWrite() {
  const { readOnly, setReadOnly } = useStore()
  return useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (readOnly) {
      toast.error('View only — this Google account can’t make changes.')
      throw new Error('read_only')
    }
    try {
      return await fn()
    } catch (e) {
      if ((e as { code?: string })?.code === 'permission-denied') setReadOnly(true)
      toast.error(writeErrorMessage(e))
      throw e
    }
  }, [readOnly, setReadOnly])
}
