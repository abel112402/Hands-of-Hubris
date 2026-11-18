import { putObject, removeObject, resized, setPinned } from '../../../core/location/edit'
import { kindInfo } from '../../../core/location/objects'
import type { LocationMap, MapObject } from '../../../core/location/types'

/** The selected map object: its text, variants, position and size, whether it is pinned, and Delete. */
export function ObjectPanel({ map, object, layerLabel, commit, onDuplicate, onDeleted }: {
  map: LocationMap
  object: MapObject
  layerLabel: string
  commit: (next: LocationMap, key?: string) => void
  onDuplicate: () => void
  onDeleted: () => void
}) {
  const info = kindInfo(object.kind)
  if (!info) return null
  const put = (next: MapObject, field: string) => commit(putObject(map, next), `loc-${object.id}-${field}`)
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
      <label className="row" title="A pinned object stays when its layer is regenerated. Editing an object pins it.">
        <input type="checkbox" checked={!!object.pinned} onChange={(e) => commit(setPinned(map, object.id, e.target.checked))} /> Keep when regenerating
      </label>
      <div className="row">
        <button className="small ghost" onClick={onDuplicate}>Duplicate</button>
        <button className="small danger" onClick={() => { commit(removeObject(map, object.id)); onDeleted() }}>Delete</button>
      </div>
    </section>
  )
}
