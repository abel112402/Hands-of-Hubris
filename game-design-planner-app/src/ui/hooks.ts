import { useCallback } from 'react'
import { useStore } from '../core/store/store'

/** Read/write access to one section of a document. */
export function useSection<T = any>(docId: string, sectionId: string) {
  const data = useStore((s) => s.project.documents[docId]?.data[sectionId]) as T | undefined
  const mutate = useStore((s) => s.mutate)
  const update = useCallback(
    (fn: (draft: T) => void, key?: string) =>
      mutate((p) => {
        const d = p.documents[docId]?.data
        if (d && d[sectionId] !== undefined) fn(d[sectionId])
      }, key),
    [mutate, docId, sectionId],
  )
  const set = useCallback(
    (value: T, key?: string) =>
      mutate((p) => {
        const d = p.documents[docId]?.data
        if (d) d[sectionId] = value
      }, key),
    [mutate, docId, sectionId],
  )
  return { data, update, set }
}

export const useProject = () => useStore((s) => s.project)
