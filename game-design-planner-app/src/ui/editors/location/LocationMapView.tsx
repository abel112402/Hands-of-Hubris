import { useState } from 'react'
import type { Entity } from '../../../core/model/types'
import { makeId } from '../../../core/model/project'
import { addObject, duplicateObject, findObject, setLayerLocked } from '../../../core/location/edit'
import { generateMap, regenerateLayer, regenerateStale, setLayerHidden, staleLayers } from '../../../core/location/generate'
import { kindInfo } from '../../../core/location/objects'
import { getLocationType, LOCATION_TYPES } from '../../../core/location/registry'
import { locationSvg } from '../../../core/location/render/svg'
import { mapOf } from '../../../core/location/schema'
import type { LocationMap } from '../../../core/location/types'
import { downloadText } from '../../../core/persistence/file'
import { useProject, useSection } from '../../hooks'
import type { ViewProps } from '../CollectionEditor'
import { MapStage } from './MapStage'
import { ObjectPanel } from './ObjectPanel'

const nameOf = (e: Entity) => String(e.name ?? '') || '(unnamed)'
const newSeed = () => Math.floor(Math.random() * 0x7fffffff)
const newObjectId = () => `m-${makeId()}`
const supported = LOCATION_TYPES.map((t) => t.id).join(', ')

/**
 * The map of one location (Locations › Map): generate it from the inputs, reroll single layers, show, hide and lock
 * layers, and edit objects by hand. The inputs stay editable in the inspector beside it.
 */
export function LocationMapView({ docId, sec, items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const { update } = useSection<Entity[]>(docId, sec.id)
  const location = items.find((e) => e.id === selected) ?? items[0]
  const [picked, setPicked] = useState<string | null>(null)
  const [pickedFor, setPickedFor] = useState(location?.id)
  const [adding, setAdding] = useState('')
  // A selection belongs to one location: switching locations starts with nothing selected.
  if (location && pickedFor !== location.id) {
    setPickedFor(location.id)
    setPicked(null)
  }
  if (!location) return null
  const type = getLocationType(location.type)
  const stored = mapOf(location)
  const map = stored && stored.type === location.type ? stored : null
  /** Stores a map on the location. Calls with the same `key` close together are one undo step. */
  const commit = (next: LocationMap | null, key?: string) => {
    if (!next || next === map) return
    update((d) => {
      const e = d.find((x) => x.id === location.id)
      if (e) e.map = next
    }, key)
  }
  const stale = map ? staleLayers(map) : []
  const object = map ? findObject(map, picked) : null
  const addable = (type?.layers ?? []).flatMap((l) => (map?.layers[l.id]?.locked ? [] : (l.addable ?? []).map((kind) => ({ value: `${l.id}/${kind}`, label: kindInfo(kind)?.label ?? kind }))))
  const add = () => {
    const [layerId, kind] = (adding || addable[0]?.value || '').split('/')
    if (!map || !kind) return
    const id = newObjectId()
    commit(addObject(map, layerId, kind, [map.w / 2, map.h / 2], id))
    setPicked(id)
  }
  const duplicate = (id: string) => {
    if (!map) return
    const copy = newObjectId()
    commit(duplicateObject(map, id, copy))
    setPicked(copy)
  }

  return (
    <div className="loc-root">
      <div className="loc-bar">
        <label className="loc-pick">
          <span className="muted">Location</span>
          <select aria-label="Location" value={location.id} onChange={(e) => onSelect(e.target.value)}>
            {items.map((e) => <option key={e.id} value={e.id}>{nameOf(e)}{e.type ? ` (${e.type})` : ''}</option>)}
          </select>
        </label>
        {selected !== location.id && <button className="small ghost" onClick={() => onSelect(location.id)}>Edit inputs</button>}
        <span className="spacer" />
        {map && (
          <>
            <label className="loc-pick">
              <span className="muted">Seed</span>
              <input
                type="number"
                aria-label="Seed"
                min={0}
                value={map.seed}
                onChange={(e) => commit(generateMap(project, location, Math.max(0, Math.floor(Number(e.target.value) || 0)), map), `loc-seed-${location.id}`)}
              />
            </label>
            <button className="small ghost" onClick={() => { const svg = locationSvg(project, location); if (svg) downloadText(`${nameOf(location)}.svg`, svg, 'image/svg+xml') }}>Export SVG</button>
          </>
        )}
        {type && <button className="primary" data-guide="generate-map" onClick={() => { commit(generateMap(project, location, newSeed(), map)); setPicked(null) }}>{map ? 'New map' : 'Generate map'}</button>}
      </div>

      {!type && (
        <p className="loc-empty muted">
          {location.type ? `There is no map generator for ${location.type} locations yet.` : 'Choose a type for this location first.'} Available so far: {supported}.
        </p>
      )}
      {type && !map && (
        <p className="loc-empty muted">
          No map yet. Fill in the inputs, then press Generate map. The map is drawn in layers; each layer can be regenerated on its own later.
          {stored && ` The stored map was made for a ${stored.type} and no longer fits.`}
        </p>
      )}

      {type && map && (
        <div className="loc-body">
          <MapStage project={project} location={location} map={map} selected={object ? picked : null} onSelect={setPicked} commit={commit} onDuplicate={duplicate} />
          <div className="loc-side">
            <aside className="loc-layers" aria-label="Layers">
              <div className="row">
                <strong>Layers</strong>
                <span className="spacer" />
                {stale.length > 0 && <button className="small" onClick={() => commit(regenerateStale(project, location, map))}>Update {stale.length} out of date</button>}
              </div>
              <ul>
                {[...type.layers].reverse().map((l) => {
                  const layer = map.layers[l.id]
                  return (
                    <li key={l.id} className={layer?.hidden ? 'off' : ''}>
                      <label>
                        <input type="checkbox" checked={!layer?.hidden} onChange={(e) => commit(setLayerHidden(map, l.id, !e.target.checked))} aria-label={`Show ${l.label}`} />
                        <span>{l.label}</span>
                      </label>
                      {layer?.stale && <span className="loc-stale" title="A layer below has changed since this one was generated">out of date</span>}
                      <span className="muted num">{layer?.objects.length ?? 0}</span>
                      <button className="small ghost loc-lock" aria-pressed={!!layer?.locked} aria-label={`Lock ${l.label}`} title="A locked layer is not edited and not regenerated" onClick={() => commit(setLayerLocked(map, l.id, !layer?.locked))}>
                        {layer?.locked ? 'Locked' : 'Lock'}
                      </button>
                      <button className="small ghost" disabled={!!layer?.locked} title="Roll this layer again; pinned objects and the other layers stay" aria-label={`Regenerate ${l.label}`} onClick={() => commit(regenerateLayer(project, location, map, l.id))}>↻</button>
                    </li>
                  )
                })}
              </ul>
              <p className="muted">↻ rolls one layer again and keeps the rest. Layers drawn from it are marked out of date instead of being overwritten.</p>
            </aside>
            {object ? (
              <ObjectPanel
                map={map}
                object={object.object}
                layerLabel={type.layers.find((l) => l.id === object.layerId)?.label ?? object.layerId}
                commit={commit}
                onDuplicate={() => duplicate(object.object.id)}
                onDeleted={() => setPicked(null)}
              />
            ) : (
              <section className="loc-object" aria-label="Add object">
                <strong>Edit by hand</strong>
                <p className="muted">Click something on the map to select it. Drag to move; drag the square to resize, the round handle to rotate, the dots of a road or wall to bend it. Delete removes it, arrow keys nudge.</p>
                {addable.length > 0 && (
                  <div className="row">
                    <select aria-label="Object to add" value={adding || addable[0].value} onChange={(e) => setAdding(e.target.value)}>
                      {addable.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    <button className="small" onClick={add}>+ Add</button>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
