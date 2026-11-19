import { useState } from 'react'
import { putObject, removeObject, resized, setPinned } from '../../../core/location/edit'
import { defaultChildType, LINKABLE } from '../../../core/location/links'
import { LOCK_NAMES } from '../../../core/location/mission'
import { kindInfo } from '../../../core/location/objects'
import type { LocationMap, MapObject, RoadRank } from '../../../core/location/types'
import { roadRank } from '../../../core/location/types/shared'

const RANK_WIDTH: Record<RoadRank, number> = { main: 16, street: 11, alley: 6 }
/** What a linked map inside an object can be. */
const CHILD_TYPES = ['Dwelling', 'Dungeon', 'Cave', 'Village', 'City']

/**
 * The selected map object: its text, variants, position and size, road rank, lock, whether it is for the game
 * master only, whether it is pinned, masking the area around it, and Delete.
 */
export function ObjectPanel({ map, object, layerLabel, commit, onDuplicate, onDeleted, onMask, linkName, onOpen, onCreateLinked }: {
  map: LocationMap
  object: MapObject
  layerLabel: string
  commit: (next: LocationMap, key?: string, label?: string) => void
  onDuplicate: () => void
  onDeleted: () => void
  onMask: () => void
  /** Name of the location the object opens, when it has a link that still leads somewhere. */
  linkName?: string
  onOpen?: (locationId: string) => void
  /** Make a new location of  inside this object and link it. */
  onCreateLinked?: (type: string) => void
}) {
  const [childType, setChildType] = useState('')
  const info = kindInfo(object.kind)
  if (!info) return null
  const put = (next: MapObject, field: string) => commit(putObject(map, next), `loc-${object.id}-${field}`, `Edit ${info.label.toLowerCase()}`)
  const number = (label: string, value: number, apply: (n: number) => MapObject) => (
    <label className="loc-num">
      <span className="muted">{label}</span>
      <input type="number" aria-label={label} value={value} onChange={(e) => put(apply(Number(e.target.value) || 0), label)} />
    </label>
  )
  const isBox = info.shape === 'box'
  return (
    <section className="loc-object" aria-label="Selected object">
      <div className="row">
        <strong>{info.label}</strong>
        <span className="muted">in {layerLabel}</span>
      </div>
      {info.text && (
        <div className="field">
          <label htmlFor="loc-object-text">Text</label>
          <input id="loc-object-text" value={object.label ?? ''} onChange={(e) => put({ ...object, label: e.target.value }, 'text')} />
        </div>
      )}
      {info.variants?.map((v) => {
        const current = object.props?.[v.prop]
        const value = v.byIndex ? v.options[Number(current) || 0] : String(current ?? v.options[0])
        return (
          <div className="field" key={v.prop}>
            <label htmlFor={`loc-object-${v.prop}`}>{v.label}</label>
            <select
              id={`loc-object-${v.prop}`}
              value={value}
              onChange={(e) => put({ ...object, props: { ...object.props, [v.prop]: v.byIndex ? v.options.indexOf(e.target.value) : e.target.value } }, v.prop)}
            >
              {v.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        )
      })}
      <div className="loc-nums">
        {info.shape !== 'curve' && info.shape !== 'outline' && number('X', object.x, (n) => ({ ...object, x: n }))}
        {info.shape !== 'curve' && info.shape !== 'outline' && number('Y', object.y, (n) => ({ ...object, y: n }))}
        {isBox && number('Width', object.w ?? 0, (n) => resized(object, n, object.h ?? n))}
        {isBox && !info.square && number('Height', object.h ?? 0, (n) => resized(object, object.w ?? n, n))}
        {isBox && !info.fixedAngle && number('Angle', object.rot ?? 0, (n) => ({ ...object, rot: n }))}
      </div>
      {object.kind === 'road' && (
        <div className="field">
          <label htmlFor="loc-object-rank">Rank</label>
          <select id="loc-object-rank" value={roadRank(object)} onChange={(e) => {
            const rank = e.target.value as RoadRank
            put({ ...object, rank, props: { ...object.props, width: RANK_WIDTH[rank] } }, 'rank')
          }}>
            <option value="main">Trade route</option>
            <option value="street">Street</option>
            <option value="alley">Alley</option>
          </select>
        </div>
      )}
      {(object.kind === 'door' || object.kind === 'gate' || (object.kind === 'furniture' && object.props?.type === 'chest')) && (
        <div className="field">
          <label htmlFor="loc-object-lock">Lock</label>
          <select id="loc-object-lock" value={object.lock ?? ''} onChange={(e) => {
            const next: MapObject = { ...object }
            if (e.target.value) next.lock = e.target.value
            else delete next.lock
            put(next, 'lock')
          }}>
            <option value="">No lock</option>
            {LOCK_NAMES.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)} lock</option>)}
          </select>
        </div>
      )}
      <label className="row" title="Left out of the player view and the player export.">
        <input type="checkbox" checked={!!object.secret} onChange={(e) => {
          const next: MapObject = { ...object }
          if (e.target.checked) next.secret = true
          else delete next.secret
          put(next, 'secret')
        }} /> Game master only
      </label>
      {object.link && linkName && onOpen && (
        <button className="small" onClick={() => onOpen(object.link!.locationId)}>Open {linkName} ↗</button>
      )}
      {!object.link && onCreateLinked && LINKABLE.has(object.kind) && (
        <div className="row">
          <select aria-label="Linked map type" value={childType || defaultChildType(object, map.type)} onChange={(e) => setChildType(e.target.value)}>
            {CHILD_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button className="small" title="Make a new location inside this one, with its own map, and open it" onClick={() => onCreateLinked(childType || defaultChildType(object, map.type))}>Create linked map</button>
        </div>
      )}
      <label className="row" title="A pinned object stays when its layer is regenerated. Editing an object pins it.">
        <input type="checkbox" checked={!!object.pinned} onChange={(e) => commit(setPinned(map, object.id, e.target.checked))} /> Keep when regenerating
      </label>
      <div className="row">
        <button className="small ghost" title="Mask the area around this object: everything in it survives every reroll" onClick={onMask}>Keep this area</button>
        <button className="small ghost" onClick={onDuplicate}>Duplicate</button>
        <button className="small danger" onClick={() => { commit(removeObject(map, object.id), undefined, `Delete ${info.label.toLowerCase()}`); onDeleted() }}>Delete</button>
      </div>
    </section>
  )
}
