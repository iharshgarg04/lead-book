/* Multi-document writes (import, backup restore) in Firestore batches of ≤400. */
import { doc, writeBatch, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export interface BatchOp {
  kind: 'set' | 'update'
  path: string
  data: DocumentData
}
export interface BatchResult {
  done: number
  failed: number
  /** first error seen, if any */
  error: unknown
}

const FATAL = new Set(['permission-denied', 'resource-exhausted'])
const codeOf = (e: unknown) => (e as { code?: string } | null)?.code

/**
 * Commit ops in chunks. A failed chunk is counted and skipped; permission/quota
 * errors (or `stopOnError`) stop the run and count everything left as failed.
 */
export async function commitInBatches(
  ops: BatchOp[],
  onProgress?: (done: number, total: number) => void,
  { size = 400, stopOnError = false } = {},
): Promise<BatchResult> {
  let done = 0, failed = 0, error: unknown = null
  for (let i = 0; i < ops.length; i += size) {
    const chunk = ops.slice(i, i + size)
    const b = writeBatch(db)
    for (const op of chunk) {
      if (op.kind === 'set') b.set(doc(db, op.path), op.data)
      else b.update(doc(db, op.path), op.data)
    }
    try {
      await b.commit()
      done += chunk.length
    } catch (e) {
      error = error || e
      if (stopOnError || FATAL.has(codeOf(e) || '')) { failed += ops.length - i; break }
      failed += chunk.length
    }
    onProgress?.(done + failed, ops.length)
  }
  return { done, failed, error }
}
export const isPermissionError = (e: unknown) => codeOf(e) === 'permission-denied'
