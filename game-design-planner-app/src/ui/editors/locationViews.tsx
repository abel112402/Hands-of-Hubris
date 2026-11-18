import type { Entity } from '../../core/model/types'
import { locationSvg } from '../../core/location/render/svg'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
const nameOf = (e: Entity) => String(e.name ?? '') || '(unnamed)'

/** Every location as a card with its map; locations without a map show a placeholder. */
export function LocationGalleryView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  return (
    <div className="loc-gallery">
      {items.map((e) => {
        const svg = locationSvg(project, e)
        return (
          <button key={e.id} className={'loc-card' + (e.id === selected ? ' on' : '')} onClick={() => onSelect(e.id)}>
            {svg ? <img alt={`Map of ${nameOf(e)}`} src={svgSrc(svg)} /> : <span className="loc-nomap muted">No map yet</span>}
            <strong>{nameOf(e)}</strong>
            <span className="muted">{e.type ?? 'No type'}</span>
          </button>
        )
      })}
    </div>
  )
}
