import { Link } from 'react-router-dom'
import { bossGates, threat } from '../../core/combat'
import type { Entity } from '../../core/model/types'
import { useProject } from '../hooks'

/** Inspector block for an enemy or boss: threat score, the Items loot tables that drop from it, and (bosses) what it gates. */
export function CombatLinks({ entity, boss }: { entity: Entity; boss: boolean }) {
  const project = useProject()
  const loot = ((project.documents['design.items']?.data.loot ?? []) as Entity[]).filter((t) => Array.isArray(t.sources) && t.sources.includes(entity.id))
  const t = threat(entity)
  const gates = boss ? bossGates(project, entity.id) : []
  return (
    <>
      {t !== null && (
        <div className="field">
          <label>Threat</label>
          <span>{Math.round(t)} <span className="muted">(damage × attacks per second × HP)</span></span>
        </div>
      )}
      <div className="field">
        <label>Drops (Items › Loot tables)</label>
        {loot.length === 0 ? (
          <span className="muted">No loot table names this as a source. <Link to="/doc/design.items?s=loot">Open loot tables</Link></span>
        ) : (
          <ul className="usages">
            {loot.map((l) => <li key={l.id}><Link to="/doc/design.items?s=loot">{l.name || '(unnamed)'}</Link></li>)}
          </ul>
        )}
      </div>
      {boss && (
        <div className="field">
          <label>Gates</label>
          {gates.length === 0 ? <span className="muted">Nothing yet: no unlocks, biome entry or progression connection.</span> : <span>{gates.join(', ')}</span>}
        </div>
      )}
    </>
  )
}
