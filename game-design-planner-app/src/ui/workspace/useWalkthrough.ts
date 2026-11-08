import { useMemo } from 'react'
import { useStore } from '../../core/store/store'
import { evaluateWalkthrough } from '../../core/walkthrough/evaluate'
import { projectWalkthrough } from '../../core/walkthrough/project'

/** The project's walkthrough and its progress; evaluated once per project change and shared by the panes. */
export function useWalkthrough() {
  const project = useStore((s) => s.project)
  const walk = projectWalkthrough(project)
  const progress = useMemo(() => evaluateWalkthrough(walk, project), [walk, project])
  return { walk, progress }
}

export type WalkthroughView = ReturnType<typeof useWalkthrough>
