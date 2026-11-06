import { useState } from 'react'
import type { Entity } from '../../core/model/types'
import { controlConflicts, flowAnalysis, layoutSvg, navEdges, screenReadiness, screensOf, uiList } from '../../core/ui'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
const nameOf = (e?: Entity) => (e ? String(e.name ?? '') || '(unnamed)' : '—')

// ---------- Screen map ----------

const CARD_W = 180
const CARD_H = 140
const COL = 230
const ROW = 170

/** Screens laid out by clicks from the entry screen; solid arrows are buttons in wireframes, dashed ones only in the flow graph. */
export function ScreenMapView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const screens = screensOf(project)
  const flow = flowAnalysis(project)
  const edges = navEdges(project).filter((e) => e.to && (e.kind === 'opens' || e.kind === 'navigates'))
  const cols = new Map<number, Entity[]>()
  for (const s of screens) {
    const d = flow.depth.get(s.id) ?? -1
    cols.set(d, [...(cols.get(d) ?? []), s])
  }
  const order = [...cols.keys()].sort((a, b) => (a < 0 ? 1 : b < 0 ? -1 : a - b))
  const pos = new Map<string, { x: number; y: number }>()
  order.forEach((d, ci) => cols.get(d)!.forEach((s, ri) => pos.set(s.id, { x: 16 + ci * COL, y: 40 + ri * ROW })))
  const width = 32 + order.length * COL
  const height = 60 + Math.max(1, ...[...cols.values()].map((l) => l.length)) * ROW
  const dead = new Set(flow.deadEnds.map((s) => s.id))
  const lost = new Set(flow.unreachable.map((s) => s.id))
  const seen = new Set<string>()
  const lines = edges.filter((e) => {
    const k = `${e.from}>${e.to}`
    if (seen.has(k)) return false
    seen.add(k)
    return pos.has(e.from) && pos.has(e.to)
  })
  const byButton = new Set(edges.filter((e) => e.source === 'wireframe').map((e) => `${e.from}>${e.to}`))
  return (
    <div className="stack npc-preview">
      <p className="muted">
        Columns are clicks from the entry screen ({nameOf(flow.entry)}). Solid arrows come from buttons in the wireframes, dashed ones only from the Screen flow graph. Click a screen, then open the Wireframe tab to edit it.
      </p>
      <div className="table-wrap">
        <div className="sm-canvas" style={{ width, height }}>
          <svg className="sm-lines" width={width} height={height} aria-hidden="true">
            <defs>
              <marker id="sm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="qf-arrowhead" />
              </marker>
            </defs>
            {lines.map((e, i) => {
              const a = pos.get(e.from)!
              const b = pos.get(e.to)!
              const fwd = b.x > a.x
              const x1 = fwd ? a.x + CARD_W : a.x + CARD_W / 2
              const y1 = fwd ? a.y + CARD_H / 2 : a.y + CARD_H
              const x2 = fwd ? b.x : b.x + CARD_W / 2
              const y2 = fwd ? b.y + CARD_H / 2 : b.y + CARD_H
              const d = fwd ? `M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1},${y1 + 40} ${x2},${y2 + 40} ${x2},${y2}`
              return <path key={i} d={d} className={'sm-edge' + (byButton.has(`${e.from}>${e.to}`) ? '' : ' graph-only')} markerEnd="url(#sm-arrow)" />
            })}
          </svg>
          {order.map((d, ci) => (
            <span key={d} className="sm-col" style={{ left: 16 + ci * COL }}>{d < 0 ? 'Unreachable' : d === 0 ? 'Entry' : `${d} click${d > 1 ? 's' : ''}`}</span>
          ))}
          {screens.map((s) => {
            const p = pos.get(s.id)!
            return (
              <button
                key={s.id}
                className={'sm-card' + (s.id === selected ? ' on' : '') + (lost.has(s.id) ? ' lost' : '') + (dead.has(s.id) ? ' dead' : '')}
                style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H }}
                onClick={() => onSelect(s.id)}
                data-testid={lost.has(s.id) ? 'sm-unreachable' : dead.has(s.id) ? 'sm-dead' : undefined}
                title={lost.has(s.id) ? 'Nothing leads here' : dead.has(s.id) ? 'No way back from here' : undefined}
              >
                <img alt="" src={svgSrc(layoutSvg(project, s))} />
                <span>{nameOf(s)}</span>
                {dead.has(s.id) && <span className="sm-flag">no way back</span>}
              </button>
            )
          })}
        </div>
      </div>
      {flow.missingInGraph.length > 0 && <p className="muted">Buttons the flow graph does not show yet: {flow.missingInGraph.map((e) => `${nameOf(screens.find((s) => s.id === e.from))} → ${nameOf(screens.find((s) => s.id === e.to))}`).join(', ')}. Use “Add arrows from wireframes” in Screen flow.</p>}
      {flow.noButton.length > 0 && <p className="muted">Flow arrows without a button: {flow.noButton.map((e) => `${nameOf(screens.find((s) => s.id === e.from))} → ${nameOf(screens.find((s) => s.id === e.to))}`).join(', ')}.</p>}
    </div>
  )
}

// ---------- Readiness ----------

const Mark = ({ ok }: { ok: boolean }) => <td className={'num ' + (ok ? 'long' : 'short')}>{ok ? '✓' : '–'}</td>

/** The handoff checklist: purpose, wireframe, states, flow and open issues per screen. */
export function ScreenReadinessView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const rows = screenReadiness(project)
  const hasMvp = rows.some((r) => r.screen.priority === 'MVP')
  const [mvpOnly, setMvpOnly] = useState(true)
  const shown = rows.filter((r) => !hasMvp || !mvpOnly || r.screen.priority === 'MVP')
  return (
    <div className="stack npc-preview">
      <div className="row">
        {hasMvp && (
          <label className="row">
            <input type="checkbox" checked={mvpOnly} onChange={(e) => setMvpOnly(e.target.checked)} /> MVP screens only
          </label>
        )}
        <span className="muted">{rows.filter((r) => r.ready).length} of {rows.length} ready</span>
      </div>
      <table className="grid">
        <thead>
          <tr><th>Screen</th><th>Kind</th><th>Priority</th><th>Purpose</th><th>Wireframe</th><th>States</th><th>In flow</th><th>Issues</th></tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.screen.id} className={'clickable' + (r.screen.id === selected ? ' selected' : '')} onClick={() => onSelect(r.screen.id)}>
              <td>{r.ready ? '✓ ' : ''}{nameOf(r.screen)}</td>
              <td className="muted">{r.screen.kind ?? '—'}</td>
              <td className="muted">{r.screen.priority ?? '—'}</td>
              <Mark ok={r.purpose} />
              <Mark ok={r.wireframe} />
              <Mark ok={r.states} />
              <Mark ok={r.inFlow} />
              <td className={'num' + (r.issues ? ' short' : '')}>{r.issues || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Binding map ----------

const KEY_ROWS = [
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['Ctrl', 'Alt', 'Space', 'Enter'],
]
const MOUSE = ['LMB', 'RMB', 'MMB', 'Wheel up', 'Wheel down']
const PAD = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'LS', 'RS', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Start', 'Select']
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** Keyboard, mouse and gamepad with the actions bound to each input in a context; conflicting inputs are red. */
export function BindingMapView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const screens = screensOf(project)
  const [ctx, setCtx] = useState('gameplay')
  const [focus, setFocus] = useState<{ field: string; value: string } | null>(null)
  const controls = uiList(project, 'controls')
  const inCtx = (c: Entity) => (Array.isArray(c.contexts) && c.contexts.length ? c.contexts : ['gameplay']).includes(ctx)
  const active = items.filter(inCtx)
  const conflicts = controlConflicts(project).filter((c) => inCtx(c.a) && inCtx(c.b))
  const bad = new Set(conflicts.map((c) => `${c.field}:${norm(c.value)}`))
  const actionsOn = (field: string, value: string) => active.filter((c) => norm(c[field]) === norm(value))
  const Key = ({ field, value, wide }: { field: string; value: string; wide?: boolean }) => {
    const acts = actionsOn(field, value)
    return (
      <button
        className={'bm-key' + (wide ? ' wide' : '') + (acts.length ? ' used' : '') + (bad.has(`${field}:${norm(value)}`) ? ' conflict' : '') + (focus?.field === field && focus.value === value ? ' on' : '')}
        aria-label={`${value}${acts.length ? `: ${acts.map((a) => a.name).join(', ')}` : ''}`}
        data-testid={bad.has(`${field}:${norm(value)}`) ? 'bm-conflict' : undefined}
        onClick={() => setFocus({ field, value })}
      >
        <b>{value}</b>
        {acts.length > 0 && <small>{acts.map((a) => a.name).join(' / ')}</small>}
      </button>
    )
  }
  const focused = focus ? actionsOn(focus.field, focus.value) : []
  const unknown = active.filter((c) => c.key && !KEY_ROWS.flat().some((k) => norm(k) === norm(c.key)))
  return (
    <div className="stack npc-preview">
      <label className="row">
        <span className="muted">Context</span>
        <select aria-label="Context" value={ctx} onChange={(e) => setCtx(e.target.value)}>
          <option value="gameplay">Gameplay</option>
          {screens.map((s) => <option key={s.id} value={s.id}>{nameOf(s)}</option>)}
        </select>
        <span className="muted">{active.length} action(s){conflicts.length ? ` · ${conflicts.length} conflict(s)` : ''}</span>
      </label>
      <div className="bm-keyboard" role="group" aria-label="Keyboard">
        {KEY_ROWS.map((row, i) => (
          <div key={i} className="bm-row">
            {row.map((k) => <Key key={k} field="key" value={k} wide={k.length > 2} />)}
          </div>
        ))}
      </div>
      <div className="bm-row" role="group" aria-label="Mouse">{MOUSE.map((k) => <Key key={k} field="mouse" value={k} wide />)}</div>
      <div className="bm-row bm-pad" role="group" aria-label="Gamepad">{PAD.map((k) => <Key key={k} field="gamepad" value={k} wide={k.length > 2} />)}</div>
      {unknown.length > 0 && <p className="muted">Other keys: {unknown.map((c) => `${c.key} → ${c.name}`).join(', ')}</p>}
      {focus && (
        <div className="stack">
          <strong>{focus.value}</strong>
          {focused.length === 0 ? (
            <span className="muted">Nothing bound here in this context.</span>
          ) : (
            <div className="chips">
              {focused.map((c) => <button key={c.id} className={'chip' + (c.id === selected ? ' on' : '')} onClick={() => onSelect(c.id)}>{c.name}</button>)}
            </div>
          )}
        </div>
      )}
      {conflicts.length > 0 && <p className="error-text">Conflicts: {conflicts.map((c) => `${c.value}: ${c.a.name} + ${c.b.name}`).join('; ')}</p>}
      {controls.length === 0 && <p className="empty">Add actions with their keys to see the map.</p>}
    </div>
  )
}
