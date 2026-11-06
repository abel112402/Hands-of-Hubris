import { useState } from 'react'
import type { Entity } from '../../../core/model/types'
import { bindOptions, kindDef, layoutOf, layoutSvg, reorder, screenReadiness, TEXT_SIZES, type BindSource, type WireElement } from '../../../core/ui'
import type { Editor } from './WireframeView'

const KIND_ICON: Record<string, string> = { HUD: '◎', 'Fullscreen menu': '▣', Window: '▢', Popup: '▫', Overlay: '◌' }
const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
const nameOfEl = (e: WireElement) => e.text?.trim() || kindDef(e.kind).label

// ---------- Screens ----------

/** Every screen with a live thumbnail, its kind, readiness and warning count. */
export function ScreenRail({ ed, screens, onPick, onAdd, onRename }: { ed: Editor; screens: Entity[]; onPick: (id: string) => void; onAdd: () => void; onRename: (id: string, name: string) => void }) {
  const ready = new Map(screenReadiness(ed.project).map((r) => [r.screen.id, r]))
  const [renaming, setRenaming] = useState<string | null>(null)
  return (
    <div className="wf-rail-section">
      <div className="wf-rail-head"><strong>Screens</strong><span className="spacer" /><button className="small" onClick={onAdd}>+ New</button></div>
      <ul className="wf-screens">
        {screens.map((s) => {
          const r = ready.get(s.id)
          return (
            <li key={s.id} className={s.id === ed.screenId ? 'on' : ''}>
              <button className="wf-screen" onClick={() => onPick(s.id)} onDoubleClick={() => setRenaming(s.id)} aria-current={s.id === ed.screenId}>
                <img alt="" src={svgSrc(layoutSvg(ed.project, s))} />
                <span className="wf-screen-name">
                  <span className="muted" title={s.kind ?? 'No kind'}>{KIND_ICON[s.kind] ?? '·'}</span>
                  {renaming === s.id ? (
                    <input
                      aria-label="Screen name"
                      autoFocus
                      defaultValue={s.name}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') setRenaming(null)
                        e.stopPropagation()
                      }}
                      onBlur={(e) => {
                        if (e.target.value.trim()) onRename(s.id, e.target.value.trim())
                        setRenaming(null)
                      }}
                    />
                  ) : (
                    <span>{s.name || '(unnamed)'}</span>
                  )}
                  {r?.ready && <span className="ok" title="Purpose, wireframe, states and flow are done">✓</span>}
                  {!!r?.issues && <span className="warn" title={`${r.issues} issue(s)`}>⚑{r.issues}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------- Layers ----------

/** Elements in z-order, top first: select, hide, lock and move up / down. */
export function LayersPanel({ ed }: { ed: Editor }) {
  const rows = [...ed.elements].reverse()
  const toggle = (id: string, key: 'hidden' | 'locked') =>
    ed.write((els) => {
      const e = els.find((x) => x.id === id)!
      if (e[key]) delete e[key]
      else e[key] = true
    }, ed.gestureKey())
  return (
    <div className="wf-rail-section wf-layers">
      <div className="wf-rail-head">
        <strong>Layers</strong>
        <span className="spacer" />
        <button className="icon" title="Bring forward" aria-label="Bring forward" disabled={!ed.sel.length} onClick={() => ed.write((els) => reorder(els, ed.sel, 'forward'), ed.gestureKey())}>↑</button>
        <button className="icon" title="Send backward" aria-label="Send backward" disabled={!ed.sel.length} onClick={() => ed.write((els) => reorder(els, ed.sel, 'backward'), ed.gestureKey())}>↓</button>
      </div>
      {rows.length === 0 && <p className="muted small">No elements yet.</p>}
      <ul role="listbox" aria-label="Layers" aria-multiselectable="true">
        {rows.map((e) => (
          <li key={e.id} className={(ed.sel.includes(e.id) ? 'on' : '') + (e.hidden ? ' off' : '')} role="option" aria-selected={ed.sel.includes(e.id)}>
            <button
              className="wf-layer"
              onClick={(ev) => ed.setSel(ev.shiftKey ? (ed.sel.includes(e.id) ? ed.sel.filter((x) => x !== e.id) : [...ed.sel, e.id]) : [e.id])}
            >
              <span className="wf-layer-icon">{kindDef(e.kind).icon}</span>
              <span className="wf-layer-name">{nameOfEl(e)}</span>
              {e.bind && <span className="muted" title="Bound to data">⛓</span>}
              {e.action && <span className="muted" title="Has an action">→</span>}
            </button>
            <button className={'icon' + (e.hidden ? ' dim' : '')} aria-label={e.hidden ? `Show ${nameOfEl(e)}` : `Hide ${nameOfEl(e)}`} title={e.hidden ? 'Show' : 'Hide'} onClick={() => toggle(e.id, 'hidden')}>{e.hidden ? '◌' : '👁'}</button>
            <button className={'icon' + (e.locked ? '' : ' dim')} aria-label={e.locked ? `Unlock ${nameOfEl(e)}` : `Lock ${nameOfEl(e)}`} title={e.locked ? 'Unlock' : 'Lock'} onClick={() => toggle(e.id, 'locked')}>{e.locked ? '🔒' : '🔓'}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Properties ----------

/** A number input that accepts arithmetic on the current value (+10, -8, *2, /2) and commits on Enter or blur. */
function NumberField({ label, value, onCommit, min }: { label: string; value: number; onCommit: (v: number) => void; min?: number }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const t = text.trim()
    const op = /^([+\-*/])\s*(-?\d+(\.\d+)?)$/.exec(t)
    let v = op ? { '+': value + Number(op[2]), '-': value - Number(op[2]), '*': value * Number(op[2]), '/': value / Number(op[2]) }[op[1] as '+'] : Number(t)
    if (Number.isFinite(v)) {
      v = Math.round(v)
      if (min !== undefined) v = Math.max(min, v)
      if (v !== value) onCommit(v)
    }
    setText(null)
  }
  return (
    <label className="wf-num">
      <span className="muted">{label}</span>
      <input
        aria-label={label}
        value={text ?? String(value)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setText(null)
          e.stopPropagation()
        }}
      />
    </label>
  )
}

const BIND_LABEL: Record<BindSource, string> = { survivalStat: 'Survival stat', currency: 'Currency', resource: 'Resource', item: 'Item', quest: 'Quest', clock: 'Day clock', hotbar: 'Items hotbar', inventory: 'Items inventory' }

/** Properties of the selection: position & size, element settings, data binding, action, states, note. */
export function PropertiesPanel({ ed, screens, screen }: { ed: Editor; screens: Entity[]; screen: Entity }) {
  const sel = ed.elements.filter((e) => ed.sel.includes(e.id))
  if (!sel.length)
    return (
      <div className="wf-props">
        <p className="muted small">Select an element to edit it. Click a palette item to add one, or drag it onto the screen.</p>
        <p className="muted small">Shortcuts: arrows move (Shift: grid step) · Ctrl+D duplicate · Ctrl+C / V copy, paste · Del delete · Ctrl+] / [ order · Ctrl+L lock · Alt disables snapping · Space-drag pans · Ctrl+wheel zooms.</p>
      </div>
    )
  const set = (fn: (e: WireElement) => void, key: string) =>
    ed.write((els) => {
      for (const e of els) if (ed.sel.includes(e.id)) fn(e)
    }, key)
  const states: string[] = Array.isArray(screen.states) ? screen.states : []
  if (sel.length > 1)
    return (
      <div className="wf-props">
        <strong>{sel.length} elements</strong>
        <p className="muted small">Use the bar above the selection to align and distribute.</p>
        {states.length > 0 && <StatesField states={states} value={sel[0].states ?? []} onChange={(v) => set((e) => (v.length ? (e.states = v) : delete e.states), ed.gestureKey())} />}
        <div className="row">
          <button className="small" onClick={() => set((e) => (e.locked = true), ed.gestureKey())}>Lock</button>
          <button className="small danger" onClick={() => ed.write((els) => els.filter((e) => !ed.sel.includes(e.id) || e.locked), ed.gestureKey())}>Delete</button>
        </div>
      </div>
    )
  const el = sel[0]
  const d = kindDef(el.kind)
  const fieldKey = (f: string) => `wf-p-${el.id}-${f}`
  const prop = (k: string, v: string | number | boolean) => set((e) => (e.props = { ...(e.props ?? {}), [k]: v }), fieldKey(k))
  const opts = el.bind ? bindOptions(ed.project, el.bind.source) : []
  return (
    <div className="wf-props">
      <div className="wf-props-head">
        <strong>{d.icon} {d.label}</strong>
        <span className="spacer" />
        <button className="small danger" disabled={el.locked} onClick={() => ed.write((els) => els.filter((e) => e.id !== el.id), ed.gestureKey())}>Delete</button>
      </div>
      <fieldset>
        <legend>Position & size</legend>
        <div className="wf-num-grid">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <NumberField key={`${el.id}-${k}-${el[k]}`} label={k.toUpperCase()} value={el[k]} min={k === 'w' || k === 'h' ? 1 : undefined} onCommit={(v) => set((e) => (e[k] = v), ed.gestureKey())} />
          ))}
        </div>
        <p className="muted small">Type +10, -8, *2 or /2 to change the current value.</p>
      </fieldset>
      <fieldset>
        <legend>Element</legend>
        {(d.text !== undefined || el.kind === 'panel') && (
          <label className="field">
            <span>{el.kind === 'panel' ? 'Title' : 'Text'}</span>
            <input aria-label="Text" value={el.text ?? ''} onChange={(e) => set((x) => (x.text = e.target.value), fieldKey('text'))} />
          </label>
        )}
        {d.textSize && (
          <label className="field">
            <span>Text size</span>
            <select aria-label="Text size" value={String(el.props?.textSize ?? d.textSize)} onChange={(e) => prop('textSize', e.target.value)}>
              {Object.entries(TEXT_SIZES).map(([k, px]) => <option key={k} value={k}>{k} · {px} px</option>)}
            </select>
          </label>
        )}
        {el.kind === 'button' && (
          <label className="field">
            <span>Style</span>
            <select aria-label="Button style" value={String(el.props?.variant ?? 'Primary')} onChange={(e) => prop('variant', e.target.value)}>
              {['Primary', 'Secondary', 'Ghost'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        )}
        {(['rows', 'cols', 'tabs', 'slots'] as const)
          .filter((k) => d.props && k in d.props)
          .map((k) => (
            <NumberField key={`${el.id}-${k}-${el.props?.[k]}`} label={{ rows: 'Rows', cols: 'Columns', tabs: 'Tabs', slots: 'Slots' }[k]} value={Number(el.props?.[k] ?? d.props![k])} min={1} onCommit={(v) => prop(k, v)} />
          ))}
      </fieldset>
      {d.bind && (
        <fieldset>
          <legend>Data</legend>
          <label className="field">
            <span>Shows</span>
            <select
              aria-label="Data source"
              value={el.bind?.source ?? ''}
              onChange={(e) => set((x) => (e.target.value ? (x.bind = { source: e.target.value as BindSource }) : delete x.bind), ed.gestureKey())}
            >
              <option value="">— not bound —</option>
              {d.bind.map((b) => <option key={b} value={b}>{BIND_LABEL[b]}</option>)}
            </select>
          </label>
          {el.bind && opts.length > 0 && (
            <label className="field">
              <span>Entry</span>
              <select aria-label="Data entry" value={el.bind.id ?? ''} onChange={(e) => set((x) => (x.bind = { ...x.bind!, id: e.target.value || undefined }), ed.gestureKey())}>
                <option value="">— pick —</option>
                {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          )}
          {el.bind && !opts.length && !['clock', 'hotbar', 'inventory', 'quest'].includes(el.bind.source) && <p className="muted small">Nothing to pick yet: add entries in the matching document.</p>}
        </fieldset>
      )}
      {d.interactive && (
        <fieldset>
          <legend>Action</legend>
          <label className="field">
            <span>On click</span>
            <select
              aria-label="Action"
              value={el.action?.kind ?? ''}
              onChange={(e) => set((x) => (e.target.value ? (x.action = { kind: e.target.value as 'opens' }) : delete x.action), ed.gestureKey())}
            >
              <option value="">Nothing</option>
              <option value="opens">Opens screen</option>
              <option value="back">Back</option>
              <option value="closes">Closes</option>
            </select>
          </label>
          {el.action?.kind === 'opens' && (
            <label className="field">
              <span>Screen</span>
              <select aria-label="Target screen" value={el.action.screen ?? ''} onChange={(e) => set((x) => (x.action = { kind: 'opens', screen: e.target.value || undefined }), ed.gestureKey())}>
                <option value="">— pick —</option>
                {screens.filter((s) => s.id !== screen.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
        </fieldset>
      )}
      {states.length > 0 && <StatesField states={states} value={el.states ?? []} onChange={(v) => set((e) => (v.length ? (e.states = v) : delete e.states), ed.gestureKey())} />}
      <fieldset>
        <legend>Note</legend>
        <textarea aria-label="Note" rows={3} placeholder="Annotation for the spec: behaviour, edge cases…" value={el.note ?? ''} onChange={(e) => set((x) => (e.target.value ? (x.note = e.target.value) : delete x.note), fieldKey('note'))} />
      </fieldset>
    </div>
  )
}

function StatesField({ states, value, onChange }: { states: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend>Visible in states</legend>
      {states.map((s) => (
        <label key={s} className="wf-check-row">
          <input type="checkbox" checked={value.includes(s)} onChange={(e) => onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s))} /> {s}
        </label>
      ))}
      <p className="muted small">None ticked: shown in every state.</p>
    </fieldset>
  )
}

// ---------- Checks ----------

/** This screen's issues; clicking one selects the element. */
export function ChecksPanel({ ed }: { ed: Editor }) {
  const all = [...ed.issues.values()].flat()
  return (
    <div className="wf-checks">
      <strong>Checks ({all.length})</strong>
      {all.length === 0 ? (
        <p className="muted small">No problems on this screen.</p>
      ) : (
        <ul>
          {all.map((i, n) => (
            <li key={n} className={i.level}>
              <button className="link-btn" onClick={() => ed.setSel([i.elementId])}>{i.message}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Number of elements per screen, for the "copy from screen" picker. */
export const screensWithLayouts = (screens: Entity[]) => screens.filter((s) => layoutOf(s).length > 0)
