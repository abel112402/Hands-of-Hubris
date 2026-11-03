import type { Entity } from '../../core/model/types'
import { useProject } from '../hooks'

const DOC = 'overview.roadmap'

/** Shows whether the phase a gate closes has met its exit criteria and finished its tasks. */
export function GateReadiness({ entity }: { entity: Entity }) {
  const project = useProject()
  const data = project.documents[DOC]?.data ?? {}
  const phase: Entity | undefined = (data.phases ?? []).find((p: Entity) => p.id === entity.phase)
  if (!phase) return <p className="muted">Choose the phase this gate closes to see its readiness.</p>

  const exit: { id: string; text: string; done: boolean }[] = phase.exit ?? []
  const openTasks: Entity[] = (data.tasks ?? []).filter((t: Entity) => t.phase === phase.id && t.status !== 'Done')
  const openExit = exit.filter((c) => !c.done)
  const ready = exit.length > 0 && openExit.length === 0 && openTasks.length === 0

  return (
    <div className={'readiness' + (ready ? ' ready' : '')} aria-live="polite">
      <strong>{ready ? '✓ Ready to close' : 'Not ready to close yet'}</strong>
      {exit.length === 0 && <div className="muted">“{phase.name}” has no exit criteria.</div>}
      {openExit.length > 0 && (
        <>
          <div>Open exit criteria ({exit.length - openExit.length}/{exit.length} met):</div>
          <ul>{openExit.map((c) => <li key={c.id}>{c.text || '(empty)'}</li>)}</ul>
        </>
      )}
      {openTasks.length > 0 && <div>{openTasks.length} task(s) in this phase are not done.</div>}
    </div>
  )
}
