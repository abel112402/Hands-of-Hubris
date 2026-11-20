import { useMemo, useState } from 'react'
import type { Entity, Project } from '../../../core/model/types'
import { makeId } from '../../../core/model/project'
import { withParams } from '../../../core/location/generate'
import { toSvgString } from '../../../core/location/render/node'
import { renderMap } from '../../../core/location/render/svg'
import { removeSnapshot, restoreSnapshot, saveSnapshot } from '../../../core/location/snapshots'
import type { LocationMap, LocationTypeDef } from '../../../core/location/types'
import { useStore } from '../../../core/store/store'

type Commit = (next: LocationMap, key?: string, label?: string) => void

/**
 * The type's generator sliders. Moving one shows the result at once (a draft, not stored); letting go stores it as
 * one undo step. Only the layers a slider feeds are made again, each with its current roll.
 */
export function ParamSliders({ project, location, map, type, commit, onDraft }: {
  project: Project
  location: Entity
  map: LocationMap
  type: LocationTypeDef
  commit: Commit
  onDraft: (draft: LocationMap | null) => void
}) {
  const [moving, setMoving] = useState<{ id: string; value: number; draft: LocationMap } | null>(null)
  if (!type.params?.length) return null
  const valueOf = (id: string, fallback: number) => (moving?.id === id ? moving.value : map.params?.[id] ?? fallback)
  const finish = () => {
    if (!moving) return
    const label = type.params!.find((p) => p.id === moving.id)?.label ?? 'slider'
    commit(moving.draft, undefined, `Set ${label.toLowerCase()}`)
    setMoving(null)
    onDraft(null)
  }
  return (
    <section className="loc-params" aria-label="Generator sliders">
      {type.params.map((p) => (
        <label key={p.id} className="loc-param" title={p.help}>
          <span className="muted">{p.label}</span>
          <input
            type="range"
            aria-label={p.label}
            min={p.min}
            max={p.max}
            step={p.step}
            value={valueOf(p.id, p.default)}
            onChange={(e) => {
              const value = Number(e.target.value)
              const draft = withParams(project, location, map, { [p.id]: value })
              setMoving({ id: p.id, value, draft })
              onDraft(draft)
            }}
            onPointerUp={finish}
            onKeyUp={finish}
            onBlur={finish}
          />
          <span className="num">{Number(valueOf(p.id, p.default)).toFixed(p.step < 1 ? 2 : 0)}</span>
        </label>
      ))}
    </section>
  )
}

/**
 * The latest edits, newest first, each with what it did. A click goes back to just after that edit (the steps
 * after it can be redone with Redo).
 */
export function HistoryPanel() {
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const shown = past.slice(-12).reverse()
  return (
    <section className="loc-history" aria-label="History">
      <div className="row">
        <button className="small ghost" disabled={!past.length} onClick={undo}>Undo</button>
        <button className="small ghost" disabled={!future.length} onClick={redo}>Redo</button>
      </div>
      {shown.length ? (
        <ol>
          {shown.map((h, i) => (
            <li key={past.length - i}>
              {i === 0 ? (
                <span className="current">{h.label ?? 'Edit'} (now)</span>
              ) : (
                <button className="link" title="Go back to just after this step" onClick={() => { for (let k = 0; k < i; k++) undo() }}>{h.label ?? 'Edit'}</button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Nothing to undo yet.</p>
      )}
    </section>
  )
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Saved versions of this map: save the current one under a name, compare thumbnails, restore or delete. */
export function VersionsPanel({ project, location, map, commit }: { project: Project; location: Entity; map: LocationMap; commit: Commit }) {
  const [name, setName] = useState('')
  const snapshots = map.snapshots
  const thumbs = useMemo(
    () => new Map((snapshots ?? []).map((s) => [s.id, svgUrl(toSvgString(renderMap(project, location, s.map, { uid: `snap-${s.id}` }).node))])),
    // Thumbnails change only when the list of versions changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshots],
  )
  return (
    <section className="loc-versions" aria-label="Versions">
      <div className="row">
        <input aria-label="Version name" placeholder="Name this version" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="small" aria-label="Save version" onClick={() => {
          commit(saveSnapshot(map, `v-${makeId()}`, name, new Date().toISOString()), undefined, 'Save version')
          setName('')
        }}>Save</button>
      </div>
      {snapshots?.length ? (
        <ul>
          {[...snapshots].reverse().map((s) => (
            <li key={s.id}>
              <img src={thumbs.get(s.id)} alt={`Map as it was in ${s.label}`} />
              <div>
                <div>{s.label}</div>
                <div className="muted">{new Date(s.at).toLocaleString()}</div>
                <div className="row">
                  <button className="small ghost" onClick={() => commit(restoreSnapshot(map, s.id), undefined, `Restore ${s.label}`)}>Restore</button>
                  <button className="small ghost" aria-label={`Delete ${s.label}`} onClick={() => commit(removeSnapshot(map, s.id), undefined, 'Delete version')}>Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Save a version before trying something new; restoring one is a normal step you can undo.</p>
      )}
    </section>
  )
}
