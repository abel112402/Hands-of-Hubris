import { Link } from 'react-router-dom'
import { finalValue, itemSources, itemUses, type ItemLink } from '../../core/items'
import type { Entity } from '../../core/model/types'
import { useProject } from '../hooks'

function List({ title, links, empty }: { title: string; links: ItemLink[]; empty: string }) {
  return (
    <div className="field">
      <label>{title}</label>
      {links.length === 0 ? (
        <span className="muted">{empty}</span>
      ) : (
        <ul className="usages">
          {links.map((l, i) => (
            <li key={i}>
              <span className="muted">{l.kind}:</span> <Link to={`/doc/${l.docId}?s=${l.sectionId}`}>{l.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Inspector block for an item: final value, where it comes from and what uses it, across documents. */
export function ItemLinks({ item }: { item: Entity }) {
  const project = useProject()
  const value = finalValue(project, item)
  return (
    <>
      {value !== null && (
        <div className="field">
          <label>Final value</label>
          <span>{Math.round(value * 100) / 100} <span className="muted">(base × rarity/quality multiplier)</span></span>
        </div>
      )}
      <List title="Obtained from" links={itemSources(project, item.id)} empty="Nowhere yet: no recipe, loot, merchant or reward." />
      <List title="Used for" links={itemUses(project, item.id)} empty="Not an ingredient, restore item or trade good." />
    </>
  )
}
