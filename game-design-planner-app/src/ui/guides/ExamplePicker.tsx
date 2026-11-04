import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import type { Project } from '../../core/model/types'
import { comparedLevels, depletion, levelTable, playerList, treeAnalysis } from '../../core/player'
import { useStore } from '../../core/store/store'
import { itemList, lootOdds, multiplier, rawCost } from '../../core/items'
import { combatList, damageFormula, damagePerHit, phaseCoverage, threat } from '../../core/combat'
import { TreeCanvas } from '../editors/playerViews'
import { useProject } from '../hooks'
import { useGuideUi } from './guideStore'

const fmt = (n: number) => (Math.round(n * 10) / 10).toString()

/** The project as it would be after the example, without touching the real one. */
export function previewProject(project: Project, ex: GuideExample, param?: string): Project {
  const copy: Project = JSON.parse(JSON.stringify(project))
  ex.apply(copy, param)
  return copy
}

export function applyExample(ex: GuideExample, param?: string) {
  useStore.getState().mutate((p) => ex.apply(p, param))
}

function Preview({ project, ex, param }: { project: Project; ex: GuideExample; param?: string }) {
  if (ex.preview === 'xpCurve') {
    const t = levelTable(project)
    return (
      <div>
        <div style={{ height: 170 }}>
          <ResponsiveContainer>
            <LineChart data={t.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334" />
              <XAxis dataKey="level" />
              <YAxis />
              <Tooltip />
              <Line dataKey="total" name="Total XP" stroke="#f2c94c" dot={false} />
              <Line dataKey="next" name="XP to level" stroke="#4f9cf9" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="muted">
          {[5, 10, t.cap].filter((l, i, a) => l <= t.cap && a.indexOf(l) === i).map((l) => {
            const r = t.rows.find((x) => x.level === l)
            return r ? `level ${l}: ${fmt(r.total)} XP${r.hours !== null ? ` (~${fmt(r.hours)} h)` : ''}` : ''
          }).join(' · ')}
        </p>
      </div>
    )
  }
  if (ex.preview === 'skillTree') {
    const castId = param ?? project.registry.catalogs.casts?.items[0]?.id
    const tree = treeAnalysis(project).casts.find((c) => c.cast.id === castId)
    const skills = playerList(project, 'skills').filter((s) => s.cast === castId)
    return tree ? (
      <div>
        <TreeCanvas skills={skills} lanes={[{ id: tree.cast.id, label: tree.cast.label, budget: tree.budget }]} onClick={() => {}} />
        <p className="muted">Tree cost {fmt(tree.totalCost)} vs. {fmt(tree.budget)} points at the level cap.</p>
      </div>
    ) : (
      <p className="empty">Add casts in Definitions first.</p>
    )
  }
  if (ex.preview === 'multiplier') {
    const rarities = project.registry.catalogs.rarities?.items ?? []
    const qualities = project.registry.catalogs.qualities?.items ?? []
    const sample = itemList(project, 'items').find((i) => typeof i.value === 'number')
    return (
      <div>
        <table className="grid npc-preview">
          <thead>
            <tr>
              <th>×</th>
              {qualities.map((q) => <th key={q.id}>{q.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rarities.map((r) => (
              <tr key={r.id}>
                <th>{r.label}</th>
                {qualities.map((q) => <td key={q.id} className="num">{fmt(multiplier(project, r.id, q.id))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {sample && rarities.length > 0 && (
          <p className="muted">
            {sample.name} (base {sample.value}): {rarities.map((r) => `${r.label} ${fmt(sample.value * multiplier(project, r.id, sample.quality ?? qualities[0]?.id))}`).join(' · ')}
          </p>
        )}
      </div>
    )
  }
  if (ex.preview === 'damageFormula') {
    const armors = [0, 50, 100, 200]
    return (
      <div>
        <p className="muted"><code>{damageFormula(project)}</code></p>
        <table className="grid npc-preview">
          <thead>
            <tr><th>A 20-damage hit against armor</th>{armors.map((a) => <th key={a}>{a}</th>)}</tr>
          </thead>
          <tbody>
            {[0, 25, -25].map((res) => (
              <tr key={res}>
                <td>{res === 0 ? 'no resistance' : res > 0 ? `${res}% resistance` : `${-res}% weakness`}</td>
                {armors.map((a) => {
                  const d = damagePerHit(project, 20, { armor: a, resistances: { x: res }, weaknesses: [] }, 'x')
                  return <td key={a} className="num">{d === null ? '⚠' : fmt(d)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (ex.preview === 'enemyRoster') {
    const rows = combatList(project, 'enemies').slice(-4)
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Enemy</th><th>Role</th><th>HP</th><th>Damage</th><th>Per s</th><th>Armor</th><th>Threat</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td><td>{e.role}</td>
              <td className="num">{e.hp}</td><td className="num">{e.damage}</td><td className="num">{e.attackRate}</td><td className="num">{e.armor}</td>
              <td className="num">{fmt(threat(e) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'bossPhases') {
    const bossId = param ?? combatList(project, 'bosses')[0]?.id
    if (!bossId) return <p className="empty">Add a boss first.</p>
    const cov = phaseCoverage(project, bossId)
    return (
      <div className="phase-track" style={{ height: 32 }}>
        {cov.phases.map((ph, i) => (
          <div key={ph.id} className="phase-seg" style={{ left: `${100 - ph.hpFrom}%`, width: `${ph.hpFrom - ph.hpTo}%`, background: ['#53c28b', '#4f9cf9', '#f2c94c', '#f97b4f', '#e5707e'][i % 5] }} title={ph.mechanics}>
            {ph.name}
          </div>
        ))}
        {cov.gaps.map(([a, z], i) => <div key={`g${i}`} className="phase-gap" style={{ left: `${100 - a}%`, width: `${a - z}%` }} />)}
      </div>
    )
  }
  if (ex.preview === 'statusSet') {
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Effect</th><th>Per tick</th><th>Every (s)</th><th>Duration (s)</th><th>Stacks</th><th>Total damage</th></tr>
        </thead>
        <tbody>
          {combatList(project, 'statusEffects').map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td className="num">{s.tickDamage ?? '–'}</td><td className="num">{s.tickInterval ?? '–'}</td><td className="num">{s.duration ?? '–'}</td><td className="num">{s.maxStacks ?? '–'}</td>
              <td className="num">{s.tickDamage && s.tickInterval && s.duration ? fmt((s.tickDamage * s.duration) / s.tickInterval) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'loadouts') {
    const items = itemList(project, 'items')
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Loadout</th><th>Level</th><th>Weapon</th><th>Abilities</th></tr>
        </thead>
        <tbody>
          {combatList(project, 'loadouts').map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td><td className="num">{l.level}</td>
              <td>{items.find((i) => i.id === l.weapon)?.name ?? '— none: add a weapon item with damage —'}</td>
              <td className="num">{(l.abilities ?? []).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'typeProfiles') {
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Type</th><th>Combat</th><th>Use</th><th>Build</th><th>Tool</th></tr>
        </thead>
        <tbody>
          {itemList(project, 'types').map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              {['combat', 'use', 'build', 'tool'].map((k) => <td key={k} className="num">{t[k] ? '✓' : ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'recipes') {
    const items = itemList(project, 'items')
    const res = new Map((project.registry.catalogs.resources?.items ?? []).map((r) => [r.id, r.label]))
    const name = (id: string) => items.find((i) => i.id === id)?.name ?? '?'
    const recipes = itemList(project, 'recipes').slice(-3)
    const top = recipes[recipes.length - 1]
    const cost = top?.result ? rawCost(project, top.result) : null
    return (
      <div>
        <table className="grid npc-preview">
          <thead>
            <tr><th>Recipe</th><th>Makes</th><th>From</th></tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.outputQty ?? 1} × {name(r.result)}</td>
                <td>
                  {[...Object.entries(r.ingredients ?? {}).map(([id, n]) => `${n} ${name(id)}`), ...Object.entries(r.resources ?? {}).map(([id, n]) => `${n} ${res.get(id) ?? id}`)].join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cost && top && (
          <p className="muted">
            Raw cost of one {name(top.result)}: {Object.entries(cost.resources).map(([id, n]) => `${fmt(n)} ${res.get(id) ?? id}`).join(', ') || 'none'} · depth {cost.depth}
          </p>
        )}
      </div>
    )
  }
  if (ex.preview === 'lootOdds') {
    const table = itemList(project, 'loot').at(-1)
    const odds = table ? lootOdds(project, table) : null
    const items = itemList(project, 'items')
    return !odds || odds.rows.length === 0 ? (
      <p className="empty">No items at these rarities yet: add items with a rarity first.</p>
    ) : (
      <table className="grid npc-preview">
        <thead>
          <tr><th>{table!.name}</th><th>Per drop</th><th>Kills for 90%</th></tr>
        </thead>
        <tbody>
          {odds.rows.slice(0, 8).map((r) => (
            <tr key={r.id}>
              <td>{items.find((i) => i.id === r.id)?.name ?? r.id}{r.guaranteed ? ' (always)' : ''}</td>
              <td className="num">{fmt(r.perDrop * 100)}%</td>
              <td className="num">{r.killsFor90 ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const levels = comparedLevels(project)
  return (
    <table className="grid npc-preview">
      <thead>
        <tr>
          <th>Minutes to critical</th>
          {levels.map((l) => <th key={l.id}>{l.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {depletion(project).map((r) => (
          <tr key={r.stat.id}>
            <td>{r.stat.name}</td>
            {levels.map((l) => <td key={l.id} className="num">{r.times[l.id] === null ? '–' : fmt(r.times[l.id]!)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** “Insert example…”: pick an example, see the result on a copy, then insert it as one undo step. */
export function ExamplePicker({ guide }: { guide: ModuleGuide }) {
  const section = useGuideUi((s) => s.picker)
  const close = () => useGuideUi.getState().openPicker(null)
  const project = useProject()
  const options = guide.examples.filter((e) => e.section === section)
  const [chosen, setChosen] = useState<string | null>(null)
  const ex = options.find((e) => e.id === chosen) ?? options[0]
  const paramOptions = ex?.param ? ex.param.options(project) : []
  const [param, setParam] = useState<string | undefined>()
  const value = paramOptions.some((o) => o.id === param) ? param : paramOptions[0]?.id
  const preview = section && ex ? previewProject(project, ex, value) : null

  useEffect(() => {
    if (!section) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && useGuideUi.getState().openPicker(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [section])

  if (!section || !ex || !preview) return null
  return (
    <div className="overlay" onClick={close}>
      <div className="help-popup example-picker" role="dialog" aria-label="Insert example" onClick={(e) => e.stopPropagation()}>
        <div className="inspector-head">
          <h2>Insert example</h2>
          <span className="spacer" />
          <button onClick={close} aria-label="Close">✕</button>
        </div>
        <div className="example-list" role="radiogroup">
          {options.map((o) => (
            <label key={o.id} className={'example-option' + (o.id === ex.id ? ' on' : '')}>
              <input type="radio" name="example" checked={o.id === ex.id} onChange={() => setChosen(o.id)} />
              <strong>{o.title}</strong>
              <span className="muted">{o.description}</span>
            </label>
          ))}
        </div>
        {ex.param && (
          <div className="row">
            <span className="muted">{ex.param.label}</span>
            <select aria-label={ex.param.label} value={value ?? ''} onChange={(e) => setParam(e.target.value)}>
              {paramOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        )}
        <h3>Preview</h3>
        <Preview project={preview} ex={ex} param={value} />
        <div className="hint-actions">
          <button
            className="primary"
            onClick={() => {
              applyExample(ex, value)
              close()
            }}
          >
            Insert
          </button>
          <button onClick={close}>Cancel</button>
          <span className="muted">One Ctrl+Z undoes the whole insert.</span>
        </div>
      </div>
    </div>
  )
}
