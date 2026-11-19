import { useState } from 'react'
import type { Entity, Project } from '../../../core/model/types'
import type { SvgNode } from '../../../core/location/render/node'
import { makeId } from '../../../core/model/project'
import { mapChecks, mapLight, mapNav, type MapCheck } from '../../../core/location/analysis'
import { lightOverlay, navOverlay } from '../../../core/location/render/overlays'
import { addStamp, splitRoom } from '../../../core/location/brush'
import { addMask, addObject, duplicateObject, findObject, maskAround, putObject, removeMask, setLayerLocked } from '../../../core/location/edit'
import { locationById, parentChain } from '../../../core/location/links'
import { generateMap, regenerateLayer, regenerateStale, setLayerHidden, staleLayers } from '../../../core/location/generate'
import { kindInfo } from '../../../core/location/objects'
import { getLocationType, LOCATION_TYPES } from '../../../core/location/registry'
import { locationSvg } from '../../../core/location/render/svg'
import { mapOf } from '../../../core/location/schema'
import type { LocationMap } from '../../../core/location/types'
import { downloadText } from '../../../core/persistence/file'
import { useProject, useSection } from '../../hooks'
import type { ViewProps } from '../CollectionEditor'
import { MapStage, PAINT, type Tool } from './MapStage'
import { HistoryPanel, ParamSliders, VersionsPanel } from './MapPanels'
import { THEMES } from '../../../core/location/render/theme'
import { ObjectPanel } from './ObjectPanel'

const nameOf = (e: Entity) => String(e.name ?? '') || '(unnamed)'
type Overlay = 'none' | 'nav' | 'light'

/** Checks and overlays walk the whole map; each is kept per stored map until the map (or the project) changes. */
const checkCache = new WeakMap<LocationMap, { project: Project; location: Entity; checks: MapCheck[] }>()
function cachedChecks(location: Entity, map: LocationMap, project: Project): MapCheck[] {
  const hit = checkCache.get(map)
  if (hit && hit.project === project && hit.location === location) return hit.checks
  const checks = mapChecks(location, map, project)
  checkCache.set(map, { project, location, checks })
  return checks
}
const overlayCache = new WeakMap<LocationMap, Partial<Record<Overlay, SvgNode>>>()
function cachedOverlay(map: LocationMap, kind: Exclude<Overlay, 'none'>): SvgNode {
  const kept = overlayCache.get(map) ?? {}
  kept[kind] ??= kind === 'nav' ? navOverlay(mapNav(map)) : lightOverlay(mapLight(map), mapNav(map))
  overlayCache.set(map, kept)
  return kept[kind]!
}
/** The map in another style; parchment, the default, is stored as no style at all. */
function withTheme(map: LocationMap, id: string): LocationMap {
  const next: LocationMap = { ...map, theme: id }
  if (id === 'parchment') delete next.theme
  return next
}
/** Where the sun can stand, as degrees clockwise from north. */
const SUN: [string, number][] = [['North', 0], ['North-east', 45], ['East', 90], ['South-east', 135], ['South', 180], ['South-west', 225], ['West', 270], ['North-west', 315]]
/** The map with some of its lighting settings changed; a setting set to undefined is removed. */
function withEnv(map: LocationMap, change: Partial<NonNullable<LocationMap['env']>>): LocationMap {
  const env: NonNullable<LocationMap['env']> = { ...map.env, ...change }
  for (const k of Object.keys(env) as (keyof typeof env)[]) if (env[k] === undefined) delete env[k]
  const next: LocationMap = { ...map, env }
  if (!Object.keys(env).length) delete next.env
  return next
}

/** What the map's own rules say is wrong (house rules, locks, rooms nothing leads into); a click selects the room or door. */
function MapChecks({ checks, onPick }: { checks: MapCheck[]; onPick: (id: string) => void }) {
  return (
    <section className="loc-checks" aria-label="Checks">
      <strong>Checks</strong>
      {checks.length ? (
        <ul>
          {checks.map((c) => (
            <li key={c.id}>
              {c.objects.length ? <button className="link" onClick={() => onPick(c.objects[0])}>{c.text}</button> : <span>{c.text}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">The layout keeps its rules: every room can be reached and every lock opened.</p>
      )}
    </section>
  )
}
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
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [player, setPlayer] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [brush, setBrush] = useState(24)
  /** The map as a slider being moved would make it; shown instead of the stored map until the slider is let go. */
  const [draft, setDraft] = useState<LocationMap | null>(null)
  // A selection belongs to one location: switching locations starts with nothing selected.
  if (location && pickedFor !== location.id) {
    setPickedFor(location.id)
    setPicked(null)
  }
  if (!location) return null
  const type = getLocationType(location.type)
  const stored = mapOf(location)
  const map = stored && stored.type === location.type ? stored : null
  /**
   * Stores a map on the location. Calls with the same `key` close together are one undo step; `label` is how the
   * step reads in the history list.
   */
  const commit = (next: LocationMap | null, key?: string, label?: string) => {
    if (!next || next === map) return
    update((d) => {
      const e = d.find((x) => x.id === location.id)
      if (e) e.map = next
    }, key, label)
  }
  const stale = map ? staleLayers(map) : []
  // Both walk the whole map, so they are worked out again only when the map (or the project) changes.
  const checks = map ? cachedChecks(location, map, project) : []
  const overlayNode = !map || overlay === 'none' ? null : cachedOverlay(map, overlay)
  const object = map ? findObject(map, picked) : null
  const addable = [
    ...(type?.layers ?? []).flatMap((l) => (map?.layers[l.id]?.locked ? [] : (l.addable ?? []).map((kind) => ({ value: `${l.id}/${kind}`, label: kindInfo(kind)?.label ?? kind })))),
    ...(type?.stamps ?? []).filter((s) => map?.layers[s.layer] && !map.layers[s.layer].locked).map((s) => ({ value: `${s.layer}/stamp:${s.id}`, label: `${s.label} (stamp)` })),
  ]
  const add = () => {
    const [layerId, kind] = (adding || addable[0]?.value || '').split('/')
    if (!map || !kind) return
    const at: [number, number] = [map.w / 2, map.h / 2]
    const stamp = kind.startsWith('stamp:') ? type?.stamps?.find((s) => s.id === kind.slice(6)) : undefined
    if (stamp) {
      const made = stamp.make(at[0], at[1])
      const ids = made.map(() => newObjectId())
      commit(addStamp(map, layerId, made, ids), undefined, `Add ${stamp.label.toLowerCase()}`)
      setPicked(ids[0])
      return
    }
    const id = newObjectId()
    commit(addObject(map, layerId, kind, at, id), undefined, `Add ${(kindInfo(kind)?.label ?? kind).toLowerCase()}`)
    setPicked(id)
  }
  const pickedShape = object ? kindInfo(object.object.kind)?.shape : undefined
  /** The tools that make sense for this map and the current selection. */
  const tools: [Tool, string, string][] = [
    ['select', 'Select', 'Click to select, drag to move; hold Alt to move without snapping'],
    ['mask', 'Keep area', 'Drag a rectangle: everything in it survives every reroll'],
    ...(map?.fields?.rock ? ([['carve', 'Carve rock', 'Paint floor into the rock'], ['fill', 'Fill rock', 'Paint rock over the floor']] as [Tool, string, string][]) : []),
    ['walk', 'Paint walkable', 'Mark ground walkable whatever is drawn there'],
    ['block', 'Paint blocked', 'Mark ground blocked whatever is drawn there'],
    ['clear', 'Clear paint', 'Remove walkable or blocked paint'],
    ...(pickedShape === 'curve' || pickedShape === 'outline' ? ([['redraw', 'Redraw', 'Draw the selected road, river or wall again by hand']] as [Tool, string, string][]) : []),
    ...(object && ['room', 'chamber'].includes(object.object.kind) ? ([['split', 'Split room', 'Click where the selected room should be cut in two']] as [Tool, string, string][]) : []),
  ]
  const activeTool = tools.some(([t]) => t === tool) ? tool : 'select'
  const keepArea = (poly: [number, number][]) => map && commit(addMask(map, poly, `mask-${makeId()}`, `Kept area ${(map.masks?.length ?? 0) + 1}`), undefined, 'Keep area')
  /**
   * A new location inside the selected object (a house's floor plan, the dungeon under a cellar door): the object
   * links to it, it names this location as its parent, and its map is generated so its entrance matches. One step
   * to undo; the new location opens.
   */
  const createLinked = (childType: string) => {
    if (!map || !object) return
    const id = makeId()
    const child: Entity = { id, name: object.object.label || `${childType} in ${nameOf(location)}`, type: childType, parent: location.id }
    const parentMap = putObject(map, { ...object.object, link: { locationId: id } }, { heal: false })
    const doc = project.documents[docId]
    const list = (doc.data[sec.id] as Entity[]).map((l) => (l.id === location.id ? { ...l, map: parentMap } : l))
    const withChild = { ...project, documents: { ...project.documents, [docId]: { ...doc, data: { ...doc.data, [sec.id]: [...list, child] } } } }
    const childMap = generateMap(withChild, child, newSeed())
    update((d) => {
      const e = d.find((x) => x.id === location.id)
      if (e) e.map = parentMap
      d.push(childMap ? { ...child, map: childMap } : child)
    })
    onSelect(id)
  }
  const chain = parentChain(project, location)
  const nameOfId = (id: string) => { const l = locationById(project, id); return l ? nameOf(l) : undefined }
  const duplicate = (id: string) => {
    if (!map) return
    const copy = newObjectId()
    commit(duplicateObject(map, id, copy), undefined, 'Duplicate')
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
        {chain.length > 1 && (
          <nav className="loc-crumbs" aria-label="Inside">
            {chain.map((l, i) => (i < chain.length - 1 ? <span key={l.id}><button className="link" onClick={() => onSelect(l.id)}>{nameOf(l)}</button> › </span> : <strong key={l.id}>{nameOf(l)}</strong>))}
          </nav>
        )}
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
                onChange={(e) => commit(generateMap(project, location, Math.max(0, Math.floor(Number(e.target.value) || 0)), map), `loc-seed-${location.id}`, 'Change seed')}
              />
            </label>
            <button className="small ghost" onClick={() => { const svg = locationSvg(project, location); if (svg) downloadText(`${nameOf(location)}.svg`, svg, 'image/svg+xml') }}>Export SVG</button>
            <button className="small ghost" title="Without secrets, creatures, traps and keys" onClick={() => { const svg = locationSvg(project, location, { player: true }); if (svg) downloadText(`${nameOf(location)} (player).svg`, svg, 'image/svg+xml') }}>Export player SVG</button>
          </>
        )}
        {type && <button className="primary" data-guide="generate-map" onClick={() => { commit(generateMap(project, location, newSeed(), map), undefined, map ? 'New map' : 'Generate map'); setPicked(null) }}>{map ? 'New map' : 'Generate map'}</button>}
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
        <div className="loc-bar loc-view" aria-label="View">
          <label className="loc-pick">
            <span className="muted">Show</span>
            <select aria-label="Overlay" value={overlay} onChange={(e) => setOverlay(e.target.value as Overlay)}>
              <option value="none">Map only</option>
              <option value="nav">Walkable ground</option>
              <option value="light">Light and shadow</option>
            </select>
          </label>
          <label className="loc-pick">
            <input type="checkbox" checked={player} onChange={(e) => setPlayer(e.target.checked)} />
            <span>Player view</span>
          </label>
          <span className="spacer" />
          <label className="loc-pick">
            <span className="muted">Style</span>
            <select aria-label="Map style" value={map.theme ?? 'parchment'} onChange={(e) => commit(withTheme(map, e.target.value), undefined, 'Change style')}>
              {Object.values(THEMES).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="loc-pick">
            <span className="muted">Time</span>
            <select aria-label="Time of day" value={map.env?.time ?? 'day'} onChange={(e) => commit(withEnv(map, { time: e.target.value as 'day' | 'dusk' | 'night' }), undefined, 'Change time of day')}>
              <option value="day">Day</option>
              <option value="dusk">Dusk</option>
              <option value="night">Night</option>
            </select>
          </label>
          <label className="loc-pick">
            <span className="muted">Sun from</span>
            <select aria-label="Sun direction" value={map.env?.sun ?? ''} onChange={(e) => commit(withEnv(map, { sun: e.target.value === '' ? undefined : Number(e.target.value) }), undefined, 'Change sun')}>
              <option value="">Default</option>
              {SUN.map(([label, deg]) => <option key={deg} value={deg}>{label}</option>)}
            </select>
          </label>
        </div>
      )}

      {type && map && (
        <div className="loc-body">
          <div className="loc-main">
            <div className="loc-tools" role="toolbar" aria-label="Tools">
              {tools.map(([t, label, title]) => (
                <button key={t} className="small ghost" aria-pressed={activeTool === t} title={title} onClick={() => setTool(t)}>{label}</button>
              ))}
              {PAINT[activeTool] && (
                <label className="loc-pick">
                  <span className="muted">Brush</span>
                  <input type="range" min={8} max={80} value={brush} aria-label="Brush size" onChange={(e) => setBrush(Number(e.target.value))} />
                </label>
              )}
            </div>
            <ParamSliders project={project} location={location} map={map} type={type} commit={commit} onDraft={setDraft} />
            <MapStage
              project={project}
              location={location}
              map={draft ?? map}
              selected={object ? picked : null}
              onSelect={setPicked}
              commit={commit}
              onDuplicate={duplicate}
              overlay={overlayNode}
              player={player}
              tool={activeTool}
              brush={brush}
              onMask={keepArea}
              onOpen={onSelect}
              onSplit={(id, at) => {
                commit(splitRoom(map, id, at, newObjectId()), undefined, 'Split room')
                setTool('select')
              }}
            />
          </div>
          <div className="loc-side">
            <aside className="loc-layers" aria-label="Layers">
              <div className="row">
                <strong>Layers</strong>
                <span className="spacer" />
                {stale.length > 0 && <button className="small" onClick={() => commit(regenerateStale(project, location, map), undefined, 'Update out of date')}>Update {stale.length} out of date</button>}
              </div>
              <ul>
                {[...type.layers].reverse().map((l) => {
                  const layer = map.layers[l.id]
                  return (
                    <li key={l.id} className={layer?.hidden ? 'off' : ''}>
                      <label>
                        <input type="checkbox" checked={!layer?.hidden} onChange={(e) => commit(setLayerHidden(map, l.id, !e.target.checked), undefined, `${e.target.checked ? 'Show' : 'Hide'} ${l.label}`)} aria-label={`Show ${l.label}`} />
                        <span>{l.label}</span>
                      </label>
                      {layer?.stale && <span className="loc-stale" title="A layer below has changed since this one was generated">out of date</span>}
                      <span className="muted num">{layer?.objects.length ?? 0}</span>
                      <button className="small ghost loc-lock" aria-pressed={!!layer?.locked} aria-label={`Lock ${l.label}`} title="A locked layer is not edited and not regenerated" onClick={() => commit(setLayerLocked(map, l.id, !layer?.locked), undefined, `${layer?.locked ? 'Unlock' : 'Lock'} ${l.label}`)}>
                        {layer?.locked ? 'Locked' : 'Lock'}
                      </button>
                      <button className="small ghost" disabled={!!layer?.locked} title="Roll this layer again; pinned objects and the other layers stay" aria-label={`Regenerate ${l.label}`} onClick={() => commit(regenerateLayer(project, location, map, l.id), undefined, `Reroll ${l.label}`)}>↻</button>
                    </li>
                  )
                })}
              </ul>
              <p className="muted">↻ rolls one layer again and keeps the rest. Layers drawn from it are marked out of date instead of being overwritten.</p>
              {!!map.masks?.length && (
                <>
                  <strong>Kept areas</strong>
                  <ul className="loc-masks-list">
                    {map.masks.map((m) => (
                      <li key={m.id} className="row">
                        <span>{m.label ?? 'Kept area'}</span>
                        <span className="spacer" />
                        <button className="small ghost" aria-label={`Remove ${m.label ?? 'kept area'}`} onClick={() => commit(removeMask(map, m.id), undefined, 'Remove kept area')}>Remove</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </aside>
            <MapChecks checks={checks} onPick={setPicked} />
            <VersionsPanel project={project} location={location} map={map} commit={commit} />
            <HistoryPanel />
            {object ? (
              <ObjectPanel
                map={map}
                object={object.object}
                layerLabel={type.layers.find((l) => l.id === object.layerId)?.label ?? object.layerId}
                commit={commit}
                onDuplicate={() => duplicate(object.object.id)}
                onDeleted={() => setPicked(null)}
                onMask={() => keepArea(maskAround(object.object))}
                linkName={object.object.link ? nameOfId(object.object.link.locationId) : undefined}
                onOpen={onSelect}
                onCreateLinked={createLinked}
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
