import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  analyzeDifficulty,
  CATEGORIES,
  cellsOf,
  customPressure,
  customRange,
  customValues,
  DIFFICULTY_DOC,
  EASIER,
  HARDER,
  levelPressure,
  levelsOf,
  levelSteps,
  MIN_STEP,
  numeric,
  paramsOf,
  snap,
  stepOf,
  type Level,
  type PressureProfile,
} from '../../core/difficulty'
import { difficultyImpact, paramUsage, unusedParams } from '../../core/difficultyImpact'
import type { Entity } from '../../core/model/types'
import { useStore } from '../../core/store/store'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

/** One colour per difficulty level (catalog order) and per parameter category; the only hard-coded colours. */
export const LEVEL_COLORS = ['#53c28b', '#4f9cf9', '#f97b4f', '#d86be0', '#f2c94c', '#5ad1d1', '#e5707e']
export const CATEGORY_COLORS: Record<string, string> = { Combat: '#f97b4f', Survival: '#53c28b', Economy: '#f2c94c', NPC: '#4f9cf9', Other: '#8b93a5' }

const pct = (n: number) => Math.round(n * 100)
const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100).toString()
const unitText = (p: Entity, v: number) => (p.unit === '×' ? `×${fmt(v)}` : p.unit === '%' ? `${fmt(v)}%` : fmt(v))

/** Writes one value cell (`param|level`). Repeated writes to the same cell within a second are one undo step. */
function setCell(paramId: string, levelId: string, value: number | undefined) {
  const key = `${paramId}|${levelId}`
  useStore.getState().mutate((p) => {
    const d = p.documents[DIFFICULTY_DOC]?.data
    if (!d) return
    const values = (d.values ??= { cells: {} })
    values.cells ??= {}
    if (value === undefined) delete values.cells[key]
    else values.cells[key] = value
  }, `difficulty.cell.${key}`)
}

// ---------- Tuning board ----------

/**
 * One track per parameter, with a marker per difficulty level. The track always runs easy → hard from left to right
 * ("higher = easier" parameters are drawn flipped), so the same visual order means the same thing on every row.
 */
export function TuningBoardView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const levels = levelsOf(project)
  const cells = cellsOf(project)
  const { reversals } = analyzeDifficulty(project)
  const usage = paramUsage(project)
  const reversed = new Set(reversals.map((r) => `${r.param.id}|${r.to.id}`))
  const drag = useRef<{ paramId: string; levelId: string; track: HTMLElement } | null>(null)

  if (!levels.length) return <p className="empty">Add difficulty levels in Definitions › Difficulty levels to tune them here.</p>
  if (!items.length) return <p className="empty">Add parameters to tune them here.</p>

  /** Track position (0 easy … 1 hard) of a value, and back. */
  const toPos = (p: Entity, v: number) => {
    const t = (v - p.min) / (p.max - p.min)
    return p.direction === EASIER ? 1 - t : t
  }
  const fromPos = (p: Entity, pos: number) => {
    const t = Math.max(0, Math.min(1, pos))
    return p.min + (p.direction === EASIER ? 1 - t : t) * (p.max - p.min)
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>, p: Entity, level: Level) => {
    const track = e.currentTarget.parentElement
    if (!track) return
    try {
      // Keeps the drag going when the pointer leaves the marker; throws for a pointer that is no longer active.
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch {
      /* dragging still works while the pointer stays over the marker */
    }
    drag.current = { paramId: p.id, levelId: level.id, track }
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>, p: Entity) => {
    const d = drag.current
    if (!d || d.paramId !== p.id) return
    const r = d.track.getBoundingClientRect()
    if (r.width <= 0) return
    setCell(p.id, d.levelId, snap(fromPos(p, (e.clientX - r.left) / r.width), stepOf(p)))
  }
  const onKey = (e: KeyboardEvent<HTMLElement>, p: Entity, level: Level, value: number) => {
    const step = stepOf(p) * (e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown' ? 10 : 1)
    // Right / up always moves toward the harder end of the track.
    const harder = p.direction === EASIER ? -1 : 1
    let next: number | undefined
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') next = value + harder * step
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') next = value - harder * step
    else if (e.key === 'Home') next = p.direction === EASIER ? p.max : p.min
    else if (e.key === 'End') next = p.direction === EASIER ? p.min : p.max
    if (next === undefined) return
    e.preventDefault()
    setCell(p.id, level.id, snap(Math.max(p.min, Math.min(p.max, next)), stepOf(p)))
  }

  const groups = [...CATEGORIES, ''].map((c) => ({ category: c || 'Uncategorized', params: items.filter((p) => (c ? p.category === c : !CATEGORIES.includes(p.category))) })).filter((g) => g.params.length)

  return (
    <div className="stack tuning-board">
      <div className="tb-legend">
        {levels.map((l, i) => (
          <span key={l.id} className="tb-chip">
            <span className="tb-dot" style={{ background: LEVEL_COLORS[i % LEVEL_COLORS.length] }} />
            {l.label}
          </span>
        ))}
        <span className="tb-chip">
          <span className="tb-base-key" /> baseline
        </span>
        <span className="muted">Left is easier, right is harder on every track. Drag a marker, or focus it and use the arrow keys (Shift for bigger steps).</span>
      </div>
      {groups.map((g) => (
        <section key={g.category} className="tb-group">
          <h4 style={{ borderColor: CATEGORY_COLORS[g.category] ?? 'var(--line)' }}>{g.category}</h4>
          {g.params.map((p) => {
            const ranged = numeric(p.min) && numeric(p.max) && p.max !== p.min
            const missing = levels.filter((l) => !numeric(cells[`${p.id}|${l.id}`]))
            const uses = usage.get(p.id) ?? []
            return (
              <div key={p.id} className={'tb-row' + (p.id === selected ? ' selected' : '')}>
                <div className="tb-head">
                  <button className="link" onClick={() => onSelect(p.id)}>{p.name || '(unnamed)'}</button>
                  <span className="muted">
                    {p.direction === HARDER ? 'higher = harder' : p.direction === EASIER ? 'higher = easier' : 'neutral'}
                    {p.exception ? ' · exception' : ''}
                    {uses.length ? ` · read by ${uses.map((u) => u.label).join(', ')}` : ' · not read by any system yet'}
                  </span>
                </div>
                {!ranged ? (
                  <p className="muted">Set Range min and max to tune this parameter here.</p>
                ) : (
                  <>
                    <div className="tb-scale">
                      <span>{unitText(p, p.direction === EASIER ? p.max : p.min)}</span>
                      <span>{unitText(p, p.direction === EASIER ? p.min : p.max)}</span>
                    </div>
                    <div className={'tb-track' + (p.direction === HARDER || p.direction === EASIER ? ' graded' : '')}>
                      {numeric(p.baseline) && <span className="tb-base" style={{ left: `${Math.max(0, Math.min(1, toPos(p, p.baseline))) * 100}%` }} title={`Baseline ${unitText(p, p.baseline)}`} />}
                      {levels.map((l, i) => {
                        const v = cells[`${p.id}|${l.id}`]
                        if (!numeric(v)) return null
                        const out = v < p.min || v > p.max
                        const bad = reversed.has(`${p.id}|${l.id}`)
                        return (
                          <span
                            key={l.id}
                            role="slider"
                            tabIndex={0}
                            aria-label={`${p.name}, ${l.label}`}
                            aria-valuemin={p.min}
                            aria-valuemax={p.max}
                            aria-valuenow={v}
                            aria-valuetext={unitText(p, v)}
                            title={`${l.label}: ${unitText(p, v)}${out ? ' (outside the range)' : ''}${bad ? ' (easier than the level before)' : ''}`}
                            className={'tb-marker' + (out ? ' out' : '') + (bad ? ' bad' : '')}
                            style={{ left: `${Math.max(0, Math.min(1, toPos(p, v))) * 100}%`, background: LEVEL_COLORS[i % LEVEL_COLORS.length], zIndex: 2 + i }}
                            onPointerDown={(e) => onPointerDown(e, p, l)}
                            onPointerMove={(e) => onPointerMove(e, p)}
                            onPointerUp={() => (drag.current = null)}
                            onPointerCancel={() => (drag.current = null)}
                            onKeyDown={(e) => onKey(e, p, l, v)}
                          >
                            {l.label.slice(0, 1)}
                          </span>
                        )
                      })}
                    </div>
                    <div className="tb-values">
                      {levels.map((l, i) => {
                        const v = cells[`${p.id}|${l.id}`]
                        return numeric(v) ? (
                          <span key={l.id} className={reversed.has(`${p.id}|${l.id}`) || v < p.min || v > p.max ? 'warn-text' : ''}>
                            <span className="tb-dot" style={{ background: LEVEL_COLORS[i % LEVEL_COLORS.length] }} />
                            {l.label} {unitText(p, v)}
                          </span>
                        ) : null
                      })}
                      {missing.map((l) => (
                        <button
                          key={l.id}
                          className="small"
                          title="Place this level at the baseline (or the middle of the range) to start tuning"
                          onClick={() => setCell(p.id, l.id, snap(numeric(p.baseline) ? p.baseline : (p.min + p.max) / 2, stepOf(p)))}
                        >
                          + {l.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

// ---------- Pressure overview ----------

function StackedBar({ profile, label }: { profile: PressureProfile; label: string }) {
  if (profile.overall === null) return <span className="muted">no values</span>
  return (
    <div className="pr-bar" role="img" aria-label={`${label}: pressure ${pct(profile.overall)} of 100`}>
      {profile.categories.map((c) => (
        <span
          key={c.category}
          className="pr-seg"
          style={{ width: `${c.share * 100}%`, background: CATEGORY_COLORS[c.category] ?? CATEGORY_COLORS.Other }}
          title={`${c.category}: ${c.count} parameter(s), average pressure ${pct(c.mean)}`}
        />
      ))}
    </div>
  )
}

function CategoryLegend({ profiles }: { profiles: PressureProfile[] }) {
  const used = CATEGORIES.filter((c) => profiles.some((p) => p.categories.some((x) => x.category === c)))
  return (
    <div className="tb-legend">
      {used.map((c) => (
        <span key={c} className="tb-chip">
          <span className="tb-dot square" style={{ background: CATEGORY_COLORS[c] }} />
          {c}
        </span>
      ))}
    </div>
  )
}

/**
 * Overall pressure per level as a bar split by category, the step to the previous level, and a heat map of where
 * each level's pressure comes from.
 */
export function PressureOverviewView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const rows = levelPressure(project)
  const steps = new Map(levelSteps(project).map((s) => [s.to.id, s]))
  if (!rows.length) return <p className="empty">Add difficulty levels in Definitions › Difficulty levels.</p>
  if (rows.every((r) => r.overall === null)) return <p className="empty">Give parameters a range, a direction and values per level to see their pressure.</p>
  const presetOf = (l: Level) => items.find((p) => p.level === l.id)
  const cats = CATEGORIES.filter((c) => rows.some((r) => r.categories.some((x) => x.category === c)))
  return (
    <div className="stack pressure-overview">
      <p className="muted">
        Pressure is where each value sits in its parameter’s range (0 = easiest end, 100 = hardest end), averaged over the parameters with a range and
        direction. The bar shows how much each category adds. A planning summary of the numbers, not a measure of how hard the game feels.
      </p>
      <CategoryLegend profiles={rows} />
      <div className="pr-rows">
        {rows.map((r) => {
          const preset = presetOf(r.level)
          const step = steps.get(r.level.id)
          return (
            <div
              key={r.level.id}
              className={'pr-row clickable' + (preset && preset.id === selected ? ' selected' : '')}
              onClick={() => preset && onSelect(preset.id)}
              title={preset ? 'Open this preset' : 'No preset describes this level yet'}
            >
              <span className="pr-name">
                {r.level.label}
                {preset && preset.name !== r.level.label ? <span className="muted"> · {preset.name}</span> : null}
              </span>
              <StackedBar profile={r} label={r.level.label} />
              <span className="pr-score">{r.overall === null ? '–' : pct(r.overall)}</span>
              <span className={'pr-step' + (step && (step.inverted || step.tooClose) ? ' warn-text' : ' muted')}>
                {step ? (step.inverted ? `${pct(step.delta)} · easier than ${step.from.label}` : step.tooClose ? `+${pct(step.delta)} · hard to tell from ${step.from.label}` : `+${pct(step.delta)}`) : ''}
              </span>
            </div>
          )
        })}
      </div>
      <h4>Where the pressure comes from</h4>
      <div className="table-wrap">
        <table className="grid pr-heat">
          <thead>
            <tr>
              <th>Category</th>
              {rows.map((r) => (
                <th key={r.level.id}>{r.level.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c}>
                <th>{c}</th>
                {rows.map((r) => {
                  const x = r.categories.find((y) => y.category === c)
                  return (
                    <td key={r.level.id} className="num" style={x ? { background: `color-mix(in srgb, ${CATEGORY_COLORS[c]} ${Math.round(15 + x.mean * 70)}%, transparent)` } : undefined}>
                      {x ? pct(x.mean) : '–'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Steps under {pct(MIN_STEP)} points between neighbouring levels are flagged: players may not notice the difference.</p>
    </div>
  )
}

// ---------- Impact ----------

/** What each level does in other modules, with a bar per cell relative to the row's largest value. */
export function DifficultyImpactView() {
  const project = useProject()
  const levels = levelsOf(project)
  const rows = difficultyImpact(project)
  const usage = paramUsage(project)
  const unused = unusedParams(project)
  if (!levels.length) return <p className="empty">Add difficulty levels in Definitions › Difficulty levels.</p>
  return (
    <div className="stack difficulty-impact">
      <p className="muted">
        Numbers from the modules that read a difficulty parameter: Player survival stats, the Combat damage model and Trade prices. Planning estimates
        from the data entered, not a simulation.
      </p>
      {rows.length === 0 ? (
        <p className="empty">No system reads a difficulty parameter yet. Link one from a Player survival stat, the Combat damage model, or Trade › Margins.</p>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>System</th>
                <th>Effect</th>
                {levels.map((l, i) => (
                  <th key={l.id}>
                    <span className="tb-dot" style={{ background: LEVEL_COLORS[i % LEVEL_COLORS.length] }} />
                    {l.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => {
                const max = Math.max(...Object.values(r.values).filter(numeric), 0)
                return (
                  <tr key={k}>
                    <td className="muted">{r.group}</td>
                    <td>
                      {r.label}
                      {r.param && <div className="muted small-text">via {r.param.name}</div>}
                    </td>
                    {levels.map((l, i) => {
                      const v = r.values[l.id]
                      return (
                        <td key={l.id} className="num">
                          {numeric(v) ? (
                            <>
                              <div className="im-bar">
                                <span style={{ width: `${max > 0 ? (100 * v) / max : 0}%`, background: LEVEL_COLORS[i % LEVEL_COLORS.length] }} />
                              </div>
                              {r.kind === 'mult' ? `×${fmt(v)}` : `${fmt(v)} ${r.unit}(s)`}
                            </>
                          ) : (
                            '–'
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <h4>Which system reads each parameter</h4>
      <ul className="im-usage">
        {paramsOf(project).map((p) => {
          const uses = usage.get(p.id) ?? []
          return (
            <li key={p.id} className={uses.length ? '' : 'muted'}>
              <strong>{p.name}</strong>: {uses.length ? uses.map((u) => u.label).join(', ') : 'nothing yet'}
            </li>
          )
        })}
      </ul>
      {unused.length > 0 && rows.length > 0 && <p className="muted">Parameters nothing reads only change the numbers in this document until a system uses them.</p>}
    </div>
  )
}

// ---------- Custom-setting simulator ----------

/**
 * Try the player-adjustable settings on top of a preset and compare the result with the fixed presets.
 * Nothing here is saved.
 */
export function CustomSimulatorView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const levels = levelsOf(project)
  const [base, setBase] = useState<string>('')
  const [mults, setMults] = useState<Record<string, number>>({})
  const params = paramsOf(project)
  if (!levels.length) return <p className="empty">Add difficulty levels in Definitions › Difficulty levels.</p>
  const baseId = levels.some((l) => l.id === base) ? base : levels[Math.floor((levels.length - 1) / 2)].id
  const presets = levelPressure(project)
  const custom = customPressure(project, baseId, mults)
  const before = customValues(project, baseId, {})
  const after = customValues(project, baseId, mults)
  const changed = params.filter((p) => numeric(before[p.id]) && numeric(after[p.id]) && before[p.id] !== after[p.id])
  const placement = (() => {
    if (custom.overall === null) return ''
    const ordered = presets.filter((r) => r.overall !== null)
    const below = [...ordered].reverse().find((r) => r.overall! <= custom.overall!)
    const above = ordered.find((r) => r.overall! > custom.overall!)
    if (!below) return `easier than ${ordered[0]?.level.label ?? 'every preset'}`
    if (!above) return below.overall === custom.overall ? `as hard as ${below.level.label}` : `harder than ${below.level.label}`
    return `between ${below.level.label} and ${above.level.label}`
  })()
  return (
    <div className="stack custom-sim">
      <p className="muted">Try the player-adjustable settings on top of a preset. Each setting multiplies the preset’s value of the parameters it changes, kept inside their range. Nothing here is saved.</p>
      <label className="row">
        <span>Start from</span>
        <select value={baseId} onChange={(e) => setBase(e.target.value)} aria-label="Start from preset">
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <button className="small" onClick={() => setMults({})}>
          Reset sliders
        </button>
      </label>
      {items.length === 0 ? (
        <p className="empty">Add a custom setting and link the parameters it changes to try it here.</p>
      ) : (
        <div className="cs-sliders">
          {items.map((s) => {
            const [lo, hi] = customRange(s)
            const linked = params.filter((p) => Array.isArray(s.params) && s.params.includes(p.id))
            const m = mults[s.id] ?? 1
            return (
              <div key={s.id} className={'cs-row' + (s.id === selected ? ' selected' : '')}>
                <button className="link" onClick={() => onSelect(s.id)}>
                  {s.name || s.pressure || '(unnamed)'}
                </button>
                {linked.length ? (
                  <>
                    <input
                      type="range"
                      min={lo}
                      max={hi}
                      step={0.05}
                      value={Math.max(lo, Math.min(hi, m))}
                      aria-label={`${s.name || s.pressure || 'Setting'} multiplier`}
                      onChange={(e) => setMults({ ...mults, [s.id]: Number(e.target.value) })}
                    />
                    <span className="num">×{fmt(m)}</span>
                    <span className="muted">{linked.map((p) => p.name).join(', ')}</span>
                  </>
                ) : (
                  <span className="muted">Link the parameters this setting changes.</span>
                )}
              </div>
            )
          })}
        </div>
      )}
      <CategoryLegend profiles={[...presets, custom]} />
      <div className="pr-rows">
        {presets.map((r) => (
          <div key={r.level.id} className="pr-row">
            <span className="pr-name">{r.level.label}</span>
            <StackedBar profile={r} label={r.level.label} />
            <span className="pr-score">{r.overall === null ? '–' : pct(r.overall)}</span>
            <span />
          </div>
        ))}
        <div className="pr-row custom">
          <span className="pr-name">Custom</span>
          <StackedBar profile={custom} label="Custom" />
          <span className="pr-score">{custom.overall === null ? '–' : pct(custom.overall)}</span>
          <span className="pr-step muted">{placement}</span>
        </div>
      </div>
      {changed.length > 0 && (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Preset</th>
                <th>Custom</th>
              </tr>
            </thead>
            <tbody>
              {changed.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="num">{unitText(p, before[p.id])}</td>
                  <td className="num">
                    {unitText(p, after[p.id])}
                    {(after[p.id] === p.min || after[p.id] === p.max) && <span className="muted"> (range limit)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
