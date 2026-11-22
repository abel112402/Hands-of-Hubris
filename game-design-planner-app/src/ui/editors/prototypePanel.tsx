import { Link } from 'react-router-dom'
import { CAPABILITIES, PROTOTYPE_DOC, PROTOTYPE_SECTION, prototypeReport, type FixPlace, type SupportLevel } from '../../core/engine/capabilities'
import type { EngineId } from '../../core/engine/adapter'
import type { EngineIssue } from '../../core/engine/ir'
import { getModule, getSections } from '../../core/modules/registry'
import type { Project } from '../../core/model/types'
import { useStore } from '../../core/store/store'
import { countOf } from '../../core/text'
import { PROTOTYPE_DIMENSIONS, PROTOTYPE_PERSPECTIVES, PROTOTYPE_PIPELINES, PROTOTYPE_PLATFORMS, type PrototypeSystem } from '../../modules/technical'

/**
 * Engine export › Playable prototype (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 6): the profile and the
 * systems to make playable, what each one will really be in the engine (works / template / a frame you finish in code /
 * not supported), what it needs, and a link to where each missing piece is filled. Edits go through useStore.mutate,
 * so every change is one undo step. The same data is in Technical Architecture › Playable prototype.
 */
const LEVEL: Record<SupportLevel, { icon: string; text: string; tone: 'ok' | 'warn' | 'bad' }> = {
  executable: { icon: '✓', text: 'Works from the plan', tone: 'ok' },
  template: { icon: '✓', text: 'Working module, set up by the plan', tone: 'ok' },
  frame: { icon: '◌', text: 'Frame only: you write the behaviour', tone: 'warn' },
  unsupported: { icon: '✗', text: 'Not supported yet', tone: 'bad' },
}
const PROFILE = [
  { key: 'dimension', label: 'Dimension', options: PROTOTYPE_DIMENSIONS },
  { key: 'perspective', label: 'Camera / perspective', options: PROTOTYPE_PERSPECTIVES },
  { key: 'renderPipeline', label: 'Render pipeline', options: PROTOTYPE_PIPELINES },
  { key: 'platform', label: 'Target platform', options: PROTOTYPE_PLATFORMS },
] as const

const setPrototype = (key: string, value: string | boolean | undefined, label: string) =>
  useStore.getState().mutate(
    (p) => {
      const doc = p.documents[PROTOTYPE_DOC]
      if (!doc) return
      const cur = doc.data[PROTOTYPE_SECTION]
      const form: Record<string, unknown> = cur && typeof cur === 'object' && !Array.isArray(cur) ? (cur as Record<string, unknown>) : {}
      if (value === undefined || value === '' || value === false) delete form[key]
      else form[key] = value
      doc.data[PROTOTYPE_SECTION] = form
    },
    undefined,
    label,
  )

/** “Items & Crafting › Items”, and the address that opens it (on the entry, when there is one). */
export function placeOf(p: Project, where: FixPlace): { label: string; to: string } {
  const mod = getModule(where.doc)
  const sec = mod ? getSections(mod, p.registry).find((s) => s.id === where.section) : undefined
  const label = [mod?.title ?? where.doc, sec?.title ?? where.section].join(' › ')
  return { label, to: `/doc/${where.doc}?s=${where.section}${where.id ? `&e=${encodeURIComponent(where.id)}` : ''}` }
}

function FixLink({ project, where }: { project: Project; where?: FixPlace }) {
  if (!where) return null
  const { label, to } = placeOf(project, where)
  return (
    <>
      {' '}
      <Link to={to} className="muted">
        Fix in {label}
        {where.field ? ` (${where.field})` : ''} →
      </Link>
    </>
  )
}

function Problems({ project, title, issues, tone }: { project: Project; title: string; issues: EngineIssue[]; tone: 'error' | 'warning' | 'info' }) {
  if (!issues.length) return null
  return (
    <section aria-label={title}>
      <strong>
        {title} ({issues.length})
      </strong>
      <ul style={{ margin: '4px 0 0', paddingLeft: 0, listStyle: 'none' }}>
        {issues.map((i, k) => (
          <li key={k} className={'engine-issue ' + tone}>
            <span aria-hidden="true">{tone === 'error' ? '✗ ' : tone === 'warning' ? '◌ ' : 'ℹ '}</span>
            {i.message.replace(/^Playable prototype: /, '')}
            <FixLink project={project} where={i.where} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PrototypePanel({ project, engine, placeholders }: { project: Project; engine: EngineId; placeholders: number }) {
  const r = prototypeReport(project, engine)
  const chosen = new Set(r.profile.systems)
  const blocking = r.issues.filter((i) => i.level === 'error')
  const frames = r.issues.filter((i) => i.code === 'proto.frameOnly')
  const other = r.issues.filter((i) => i.level === 'warning' && i.code !== 'proto.frameOnly')
  return (
    <section aria-label="Playable prototype" className="engine-map">
      <strong>Playable prototype</strong>
      {!r.wanted ? (
        <p className="muted">
          This plan asks for no playable prototype, so the export is data and code frames only. Choose a profile or a system below to see what the engine
          export can make playable and what is missing. Nothing is guessed from the genre or the controls text.
        </p>
      ) : (
        <p role="status" className={r.playable ? '' : 'engine-note'}>
          <span aria-hidden="true">{r.playable ? '✓ ' : '✗ '}</span>
          <strong>{r.playable ? 'Playable' : 'Not playable yet'}</strong>
          {!r.playable && ` — ${countOf(blocking.length, 'blocking problem')}, ${countOf(r.systems.filter((s) => s.level === 'frame').length, 'system')} only a frame.`}
        </p>
      )}
      <div className="row" style={{ margin: 0, flexWrap: 'wrap' }}>
        {PROFILE.map((f) => (
          <label key={f.key} className="row" style={{ margin: 0, alignItems: 'center' }}>
            {f.label}
            <select aria-label={f.label} value={r.profile[f.key] ?? ''} onChange={(e) => setPrototype(f.key, e.target.value, `Playable prototype: ${f.label.toLowerCase()}`)}>
              <option value="">Not chosen</option>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <table className="engine-map-table" aria-label="Systems">
        <thead>
          <tr>
            <th scope="col">System</th>
            <th scope="col">In the engine</th>
            <th scope="col">Needs</th>
          </tr>
        </thead>
        <tbody>
          {CAPABILITIES.map((c) => {
            const on = chosen.has(c.id)
            const s = r.systems.find((x) => x.id === c.id)
            const level = s?.level ?? (c.support[engine]?.level ?? 'unsupported')
            const missingRequires = s?.missingRequires ?? []
            return (
              <tr key={c.id}>
                <th scope="row">
                  <label className="row" style={{ margin: 0, alignItems: 'center' }}>
                    <input type="checkbox" checked={on} onChange={(e) => setPrototype(c.id, e.target.checked, `${e.target.checked ? 'Choose' : 'Drop'} ${c.label.toLowerCase()}`)} />
                    {c.label}
                  </label>
                </th>
                <td>
                  <span className={`engine-badge ${on ? LEVEL[level].tone : 'muted'}`} title={(c.support[engine] ?? { note: 'Playable prototypes are generated for Unity first.' }).note}>
                    <span aria-hidden="true">{LEVEL[level].icon}</span> {LEVEL[level].text}
                  </span>
                </td>
                <td>
                  {c.requires.length > 0 && (
                    <div>
                      {c.requires.map((req: PrototypeSystem) => CAPABILITIES.find((x) => x.id === req)!.label).join(', ')}
                      {on && missingRequires.length > 0 && (
                        <>
                          {' '}
                          <button className="small" onClick={() => missingRequires.forEach((m) => setPrototype(m, true, `Choose ${CAPABILITIES.find((x) => x.id === m)!.label.toLowerCase()}`))}>
                            Choose {missingRequires.map((m) => CAPABILITIES.find((x) => x.id === m)!.label).join(', ')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {on && s && s.missing.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {s.missing.map((m, k) => (
                        <li key={k}>
                          <span className="sr-only">Missing: </span>
                          {m.what}
                          <FixLink project={project} where={m.where} />
                        </li>
                      ))}
                    </ul>
                  ) : on ? (
                    <span className="muted">Data complete</span>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {r.wanted && (
        <>
          <Problems project={project} title="Blocks playing" issues={blocking} tone="error" />
          <Problems project={project} title="Frames you finish in code" issues={frames} tone="warning" />
          <Problems project={project} title="Also check" issues={other} tone="info" />
          <p className="muted">
            Placeholders: {countOf(placeholders, 'record')} {placeholders === 1 ? 'has' : 'have'} no art in the plan yet; the engine makes stand-ins for them. They do not block playing.
          </p>
        </>
      )}
    </section>
  )
}
