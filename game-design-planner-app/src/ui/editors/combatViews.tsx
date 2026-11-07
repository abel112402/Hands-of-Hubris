import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Entity } from '../../core/model/types'
import {
  combatList,
  damageTypes,
  enemyDamageMult,
  enemyHpMult,
  fighterOf,
  immuneFighters,
  phaseCoverage,
  playerDamageTypes,
  resistanceOf,
  threatRamp,
  timeToDie,
  timeToKill,
  variantFighter,
  type Fighter,
} from '../../core/combat'
import { comparedLevels } from '../../core/player'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'
import { countOf } from '../../core/text'

const STAGE_COLORS = ['#53c28b', '#4f9cf9', '#f2c94c', '#f97b4f', '#e5707e', '#8b93a5']
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString())
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Loadouts × enemies, bosses and variants: seconds to kill and seconds to die, per difficulty and at night. */
export function CombatSandboxView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const levels = comparedLevels(project)
  const [levelId, setLevelId] = useState(levels[Math.floor((levels.length - 1) / 2)]?.id ?? '')
  const [night, setNight] = useState(false)
  const [biome, setBiome] = useState('')
  const [cell, setCell] = useState<string | null>(null)
  const biomes = (project.documents['design.world']?.data.biomes ?? []) as Entity[]
  const useNight = !!project.documents['design.combat']?.data.damageModel?.useNightStrength
  const foes: { f: Fighter; kind: string; biome?: string }[] = [
    ...combatList(project, 'enemies').map((e) => ({ f: fighterOf(e), kind: 'enemy', biome: e.biome })),
    ...combatList(project, 'variants').flatMap((v) => {
      const f = variantFighter(project, v)
      const base = combatList(project, 'enemies').find((e) => e.id === v.base)
      return f ? [{ f, kind: 'variant', biome: base?.biome }] : []
    }),
    ...combatList(project, 'bosses').map((b) => ({ f: fighterOf(b), kind: 'boss', biome: b.biome })),
  ].filter((x) => !biome || x.biome === biome)
  const c = { levelId: levelId || undefined, night }
  if (!items.length) return null
  const open = cell ? cell.split('|') : null
  const detailLoadout = open && items.find((l) => l.id === open[0])
  const detailFoe = open && foes.find((x) => x.f.id === open[1])
  return (
    <div className="stack npc-preview">
      <div className="row">
        <span className="muted">Difficulty</span>
        <select aria-label="Difficulty" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
          {levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        {useNight && (
          <label className="row"><input type="checkbox" checked={night} onChange={(e) => setNight(e.target.checked)} /> Night</label>
        )}
        <span className="muted">Biome</span>
        <select aria-label="Biome" value={biome} onChange={(e) => setBiome(e.target.value)}>
          <option value="">All</option>
          {biomes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="muted">
          Enemy HP ×{fmt(enemyHpMult(project, c))}, damage ×{fmt(enemyDamageMult(project, c))}
        </span>
      </div>
      <p className="muted">Each cell: time for the loadout to kill the enemy / time for the enemy to kill the loadout (seconds). Green = the player wins comfortably, red = the player loses. Click a cell for the breakdown.</p>
      {foes.length === 0 ? (
        <p className="empty">Add enemies or bosses with HP and damage.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid sandbox">
            <thead>
              <tr>
                <th>Loadout</th>
                {foes.map((x) => <th key={x.f.id} title={x.kind}>{x.f.name}{x.kind !== 'enemy' ? <span className="muted"> ({x.kind})</span> : null}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className={l.id === selected ? 'selected' : ''}>
                  <th onClick={() => onSelect(l.id)}>{l.name || '(unnamed)'}</th>
                  {foes.map((x) => {
                    const kill = timeToKill(project, l, x.f, c)
                    const die = timeToDie(project, l, x.f, c)
                    const cls = !kill ? 'none' : !die || die.seconds > kill.seconds * 2 ? 'win' : die.seconds < kill.seconds ? 'lose' : 'close'
                    const key = `${l.id}|${x.f.id}`
                    return (
                      <td key={x.f.id} className={`num sb-${cls}${cell === key ? ' on' : ''}`} onClick={() => setCell(cell === key ? null : key)} data-testid={`sb-${l.id}-${x.f.id}`}>
                        {kill ? fmt(kill.seconds) : '–'} / {die ? fmt(die.seconds) : '∞'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detailLoadout && detailFoe && (() => {
        const kill = timeToKill(project, detailLoadout, detailFoe.f, c)
        const die = timeToDie(project, detailLoadout, detailFoe.f, c)
        return (
          <div className="panel">
            <strong>{detailLoadout.name} vs {detailFoe.f.name}</strong>
            <p>
              {kill
                ? `Best attack: ${kill.source}, ${fmt(kill.perHit)} per hit after armor and resistance, ${kill.hits} hits, ${fmt(kill.dps)} DPS → ${fmt(kill.seconds)} s.`
                : 'The loadout has no attack that deals damage here (no weapon damage, or no ability with a numeric effect formula).'}
            </p>
            <p>
              {die
                ? `${detailFoe.f.name}: ${fmt(die.perHit)} per hit after the loadout’s armor, ${die.hits} hits, ${fmt(die.dps)} DPS → ${fmt(die.seconds)} s.`
                : `${detailFoe.f.name} deals no damage.`}
            </p>
          </div>
        )
      })()}
    </div>
  )
}

/** Enemy threat (DPS × HP) ordered by biome stage; enemies weaker than an earlier stage's median are marked. */
export function ThreatCurveView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const ramp = threatRamp(project)
  const dips = new Set(ramp.dips.map((d) => d.enemy.id))
  const data = ramp.rows.filter((r) => r.threat !== null).map((r) => ({ id: r.enemy.id, name: r.enemy.name || '(unnamed)', threat: Math.round(r.threat!), stage: r.stage, stageLabel: r.stageLabel }))
  if (!data.length) return <p className="empty">Give enemies HP and damage to compare their threat.</p>
  return (
    <div className="stack npc-preview">
      <p className="muted">
        Threat = damage × attacks per second × HP. Bars are ordered by the biome’s role (World): Starter → Final. Outlined bars are weaker than the median of an earlier stage.
      </p>
      <div style={{ height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data} onClick={(e) => { const id = (e as { activePayload?: { payload: { id: string } }[] })?.activePayload?.[0]?.payload.id; if (id) onSelect(id) }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(v, _n, p) => [v, `Threat (${(p as { payload: { stageLabel: string } }).payload.stageLabel})`]} />
            <Bar dataKey="threat" name="Threat">
              {data.map((d) => (
                <Cell key={d.id} fill={STAGE_COLORS[d.stage ?? 5]} stroke={dips.has(d.id) ? '#e5586b' : d.id === selected ? '#fff' : undefined} strokeWidth={dips.has(d.id) || d.id === selected ? 3 : 0} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        {[...ramp.medians].map(([s, m]) => (
          <span key={s} className="cv-legend" style={{ borderColor: STAGE_COLORS[s] }}>{['Starter', 'Early', 'Mid', 'Late', 'Final'][s]}: median {fmt(m)}</span>
        ))}
      </div>
      {ramp.dips.length > 0 && <p className="error-text">Weaker than an earlier stage: {ramp.dips.map((d) => d.enemy.name).join(', ')}</p>}
    </div>
  )
}

/** Enemies and bosses × damage types: resistance %, with the types the player can deal. */
export function WeaknessMatrixView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const types = damageTypes(project)
  const player = playerDamageTypes(project)
  const immune = new Set(immuneFighters(project).map((e) => e.id))
  const rows = [...combatList(project, 'enemies'), ...combatList(project, 'bosses')]
  if (!rows.length) return null
  const color = (r: number) => (r < 0 ? `rgba(76,195,138,${Math.min(0.6, -r / 100 + 0.15)})` : r > 0 ? `rgba(229,88,107,${Math.min(0.6, r / 150 + 0.1)})` : undefined)
  return (
    <div className="stack npc-preview">
      <p className="muted">Resistance in %: green = weak (takes extra damage), red = resistant, 100 = immune. Outlined columns are damage types the player cannot deal yet.</p>
      <div className="table-wrap">
        <table className="grid matrix">
          <thead>
            <tr>
              <th />
              {types.map((t) => <th key={t.id} className={player.has(t.id) ? '' : 'no-answer'}>{t.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const f = fighterOf(e)
              return (
                <tr key={e.id} className={(e.id === selected ? 'selected ' : '') + (immune.has(e.id) ? 'immune' : '')} onClick={() => onSelect(e.id)}>
                  <th>{e.name || '(unnamed)'}{immune.has(e.id) && <span className="pill warning"> immune to the player</span>}</th>
                  {types.map((t) => {
                    const r = resistanceOf(f, t.id)
                    return <td key={t.id} className={'num' + (player.has(t.id) ? '' : ' no-answer')} style={{ background: color(r) }}>{r || ''}</td>
                  })}
                </tr>
              )
            })}
            <tr>
              <th className="muted">Player can deal</th>
              {types.map((t) => <td key={t.id} className={'num' + (player.has(t.id) ? '' : ' no-answer')}>{player.has(t.id) ? '✓' : ''}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** One HP bar per boss, 100 % → 0 %, cut into phases; gaps hatched, overlaps red. */
export function PhaseBarsView({ sec, selected, onSelect }: ViewProps) {
  const project = useProject()
  const bosses = combatList(project, 'bosses')
  const onPhases = sec.id === 'phases'
  if (!bosses.length) return <p className="empty">Add a boss first.</p>
  const pos = (hp: number) => `${100 - Math.max(0, Math.min(100, hp))}%`
  const width = (from: number, to: number) => `${Math.max(0, from - to)}%`
  return (
    <div className="stack npc-preview">
      <p className="muted">Left is full HP, right is defeated. Hatched = no phase covers that HP; red = phases overlap. Click a phase to edit it.</p>
      {bosses.map((b) => {
        const cov = phaseCoverage(project, b.id)
        return (
          <div key={b.id} className={'phase-row' + (!onPhases && b.id === selected ? ' selected' : '')}>
            <button className="link-btn" onClick={() => !onPhases && onSelect(b.id)}>{b.name || '(unnamed)'}</button>
            <div className="phase-track" role="img" aria-label={`${b.name} phases`}>
              {cov.gaps.map(([a, z], i) => <div key={`g${i}`} className="phase-gap" style={{ left: pos(a), width: width(a, z) }} title={`Gap ${a}–${z}%`} data-testid="phase-gap" />)}
              {cov.overlaps.map(([a, z], i) => <div key={`o${i}`} className="phase-overlap" style={{ left: pos(a), width: width(a, z) }} title={`Overlap ${z}–${a}%`} />)}
              {cov.phases.map((p, i) => (
                <button
                  key={p.id}
                  className={'phase-seg' + (onPhases && p.id === selected ? ' selected' : '')}
                  style={{ left: pos(p.hpFrom), width: width(p.hpFrom, p.hpTo), background: STAGE_COLORS[i % STAGE_COLORS.length] }}
                  title={`${p.name}: ${p.hpFrom}–${p.hpTo}%${p.mechanics ? ` · ${p.mechanics}` : ''}`}
                  onClick={() => (onPhases ? onSelect(p.id) : onSelect(b.id))}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <span className="muted">
              {countOf(cov.phases.length, 'phase')}{isNum(b.hp) ? ` · ${b.hp} HP` : ''}
              {cov.unset.length ? ` · ${cov.unset.length} without HP range` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
