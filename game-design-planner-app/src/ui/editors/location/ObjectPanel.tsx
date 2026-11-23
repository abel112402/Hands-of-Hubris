import { useState } from 'react'
import { putObject, removeObject, resized, setPinned } from '../../../core/location/edit'
import { defaultChildType, LINKABLE } from '../../../core/location/links'
import { LOCK_NAMES } from '../../../core/location/mission'
import { kindInfo } from '../../../core/location/objects'
import { SPAWN_ROLES, type LocationMap, type MapObject, type RoadRank, type SpawnRole } from '../../../core/location/types'
import { roadRank } from '../../../core/location/types/shared'
import type { Entity } from '../../../core/model/types'
import { useProject } from '../../hooks'

const RANK_WIDTH: Record<RoadRank, number> = { main: 16, street: 11, alley: 6 }
/** What a map object stands for in the game (core/gameplay.ts reads player starts, item pickups, enemies and NPCs). */
const SPAWN_LABEL: Record<SpawnRole, string> = { player: 'Player start', item: 'Item to pick up', enemy: 'Enemy spawn', boss: 'Boss spawn', npc: 'NPC', merchant: 'Merchant' }
/** What a linked map inside an object can be. */
const CHILD_TYPES = ['Dwelling', 'Dungeon', 'Cave', 'Village', 'City']

/**
 * The selected map object: its text, variants, position and size, road rank, lock, whether it is for the game
 * master only, whether it is pinned, masking the area around it, and Delete.
 */
export function ObjectPanel({ map, object, layerLabel, commit, onDuplicate, onDeleted, onMask, onClose, linkName, onOpen, onCreateLinked }: {
  map: LocationMap
  object: MapObject
  layerLabel: string
  commit: (next: LocationMap, key?: string, label?: string) => void
  onDuplicate: () => void
  onDeleted: () => void
  onMask: () => void
  /** Clears the selection. */
  onClose?: () => void
  /** Name of the location the object opens, when it has a link that still leads somewhere. */
  linkName?: string
  onOpen?: (locationId: string) => void
  /** Make a new location of  inside this object and link it. */
  onCreateLinked?: (type: string) => void
}) {
  const [childType, setChildType] = useState('')
  const project = useProject()
  const items = ((project.documents['design.items']?.data.items ?? []) as Entity[]).filter((i) => typeof i.name === 'string' && i.name.trim())
  const enemies = ((project.documents['design.combat']?.data.enemies ?? []) as Entity[]).filter((i) => typeof i.name === 'string' && i.name.trim())
  const characters = ((project.documents['design.story']?.data.characters ?? []) as Entity[]).filter((i) => typeof i.name === 'string' && i.name.trim())
  const merchants = ((project.documents['design.trade']?.data.merchants ?? []) as Entity[]).filter((i) => typeof i.name === 'string' && i.name.trim())
  // Lines of this map an enemy can patrol: any object drawn as a line of at least two points.
  const routes = Object.values(map.layers).flatMap((l) => l.objects).filter((o) => o.id !== object.id && (o.points?.length ?? 0) >= 2)
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
      <div className="loc-object-head">
        <strong>{info.label}</strong>
        <span className="loc-chip">{layerLabel}</span>
        <span className="spacer" />
        {onClose && <button className="loc-mini" aria-label="Clear selection" title="Clear selection (Esc)" onClick={onClose}>×</button>}
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
      {info.shape !== 'curve' && info.shape !== 'outline' && (
        <div className="field">
          <label htmlFor="loc-object-spawn">Gameplay</label>
          <select
            id="loc-object-spawn"
            value={object.spawn?.role ?? ''}
            onChange={(e) => {
              const role = e.target.value as SpawnRole | ''
              const next: MapObject = { ...object }
              if (!role) delete next.spawn
              else if (role === 'item') next.spawn = { role, ...(object.spawn?.refId && items.some((i) => i.id === object.spawn!.refId) ? { refId: object.spawn.refId } : items[0] ? { refId: String(items[0].id) } : {}), count: object.spawn?.count ?? 1 }
              else if (role === 'npc') next.spawn = { role, ...(object.spawn?.role === 'npc' && object.spawn.refId ? { refId: object.spawn.refId } : characters[0] ? { refId: String(characters[0].id) } : {}) }
              else if (role === 'enemy') next.spawn = { role, ...(object.spawn?.role === 'enemy' && object.spawn.refId ? { refId: object.spawn.refId } : enemies[0] ? { refId: String(enemies[0].id) } : {}) }
              else if (role === 'merchant') next.spawn = { role, ...(object.spawn?.role === 'merchant' && object.spawn.refId ? { refId: object.spawn.refId } : merchants[0] ? { refId: String(merchants[0].id) } : {}) }
              else next.spawn = { role, ...(object.spawn?.role === role && object.spawn.refId ? { refId: object.spawn.refId } : {}), ...(object.spawn?.role === role && object.spawn.count ? { count: object.spawn.count } : {}) }
              put(next, 'spawn')
            }}
          >
            <option value="">Nothing</option>
            {SPAWN_ROLES.map((r) => (
              <option key={r} value={r}>
                {SPAWN_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      )}
      {object.spawn?.role === 'item' && (
        <div className="loc-nums">
          <label className="loc-num">
            <span className="muted">Item</span>
            <select aria-label="Item to pick up" value={object.spawn.refId ?? ''} onChange={(e) => put({ ...object, spawn: { ...object.spawn!, refId: e.target.value } }, 'spawn-item')}>
              {!items.some((i) => i.id === object.spawn!.refId) && <option value={object.spawn.refId ?? ''}>{object.spawn.refId ? `Unknown item (${object.spawn.refId})` : 'Choose an item'}</option>}
              {items.map((i) => (
                <option key={String(i.id)} value={String(i.id)}>
                  {String(i.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="loc-num">
            <span className="muted">Amount</span>
            <input type="number" min={1} max={99} step={1} aria-label="Amount" value={object.spawn.count ?? 1} onChange={(e) => put({ ...object, spawn: { ...object.spawn!, count: Math.min(99, Math.max(1, Math.round(Number(e.target.value) || 1))) } }, 'spawn-count')} />
          </label>
        </div>
      )}
      {object.spawn?.role === 'merchant' && (
        <div className="loc-nums">
          <label className="loc-num">
            <span className="muted">Merchant</span>
            <select aria-label="Merchant" value={object.spawn.refId ?? ''} onChange={(e) => put({ ...object, spawn: { ...object.spawn!, refId: e.target.value } }, 'spawn-merchant')}>
              {!merchants.some((i) => i.id === object.spawn!.refId) && <option value={object.spawn.refId ?? ''}>{object.spawn.refId ? `Unknown merchant (${object.spawn.refId})` : 'Choose a merchant'}</option>}
              {merchants.map((i) => (
                <option key={String(i.id)} value={String(i.id)}>
                  {String(i.name)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {object.spawn?.role === 'npc' && (
        <div className="loc-nums">
          <label className="loc-num">
            <span className="muted">Character</span>
            <select aria-label="Character" value={object.spawn.refId ?? ''} onChange={(e) => put({ ...object, spawn: { ...object.spawn!, refId: e.target.value } }, 'spawn-npc')}>
              {!characters.some((i) => i.id === object.spawn!.refId) && <option value={object.spawn.refId ?? ''}>{object.spawn.refId ? `Unknown character (${object.spawn.refId})` : 'Choose a character'}</option>}
              {characters.map((i) => (
                <option key={String(i.id)} value={String(i.id)}>
                  {String(i.name)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {object.spawn?.role === 'enemy' && (
        <div className="loc-nums">
          <label className="loc-num">
            <span className="muted">Enemy</span>
            <select aria-label="Enemy" value={object.spawn.refId ?? ''} onChange={(e) => put({ ...object, spawn: { ...object.spawn!, refId: e.target.value } }, 'spawn-enemy')}>
              {!enemies.some((i) => i.id === object.spawn!.refId) && <option value={object.spawn.refId ?? ''}>{object.spawn.refId ? `Unknown enemy (${object.spawn.refId})` : 'Choose an enemy'}</option>}
              {enemies.map((i) => (
                <option key={String(i.id)} value={String(i.id)}>
                  {String(i.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="loc-num" title="A line on this map (a path, a road) the enemy walks along; empty: it guards its spot.">
            <span className="muted">Patrol route</span>
            <select aria-label="Patrol route" value={object.spawn.route ?? ''} onChange={(e) => {
              const spawn = { ...object.spawn! }
              if (e.target.value) spawn.route = e.target.value
              else delete spawn.route
              put({ ...object, spawn }, 'spawn-route')
            }}>
              <option value="">None (guards its spot)</option>
              {object.spawn.route && !routes.some((r) => r.id === object.spawn!.route) && <option value={object.spawn.route}>{`Unknown line (${object.spawn.route})`}</option>}
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label || `${r.kind} ${r.id}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="loc-check" title="Left out of the player view and the player export.">
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
      <label className="loc-check" title="A pinned object stays when its layer is regenerated. Editing an object pins it.">
        <input type="checkbox" checked={!!object.pinned} onChange={(e) => commit(setPinned(map, object.id, e.target.checked))} /> Keep when regenerating
      </label>
      <div className="loc-actions">
        <button className="small ghost" title="Mask the area around this object: everything in it survives every reroll" onClick={onMask}>Keep this area</button>
        <button className="small ghost" onClick={onDuplicate}>Duplicate</button>
        <span className="spacer" />
        <button className="small danger" onClick={() => { commit(removeObject(map, object.id), undefined, `Delete ${info.label.toLowerCase()}`); onDeleted() }}>Delete</button>
      </div>
    </section>
  )
}
