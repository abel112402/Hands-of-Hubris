import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CanvasItem, CollectionSection, Entity, FieldDef, GraphData, Project, SectionDef } from '../../core/model/types'
import { getModule } from '../../core/modules/registry'
import { resolveSource, entityLabel } from '../../core/references/refs'
import { tryEvaluate } from '../../core/formula'
import { compassPhases } from '../../core/compass'
import { bookIndex, bookStats, bookVisual, briefFigure, briefLead, briefNumbers, filledSections, tableColumns, TABLE_FROM, type BookIndex } from '../../core/book'
import { displayValue } from '../FieldInput'
import { useProject } from '../hooks'
import { useWalkthrough } from '../workspace/useWalkthrough'
import { CollectionViewBody, type ViewProps } from '../editors/CollectionEditor'
import { ModuleIcon } from '../ModuleIcon'
import { Icon } from '../Icon'
import { Segmented } from '../motion'

type Mode = 'brief' | 'data'

const entryLink = (docId: string, sectionId: string, id?: string) => `/doc/${docId}?s=${sectionId}${id ? `&e=${id}` : ''}`
const anchor = (docId: string, sectionId?: string) => `book-${docId.replace(/\./g, '-')}${sectionId ? `-${sectionId}` : ''}`
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const noop = () => {}

const filled = (e: Record<string, any>, f: FieldDef) => {
  const v = e[f.key]
  return !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (f.type === 'map' && !Object.keys(v ?? {}).length))
}
/** Fields worth printing: filled, and not carried-over notes. */
const shownFields = (fields: FieldDef[], e: Record<string, any>) => fields.filter((f) => f.key !== 'name' && f.key !== 'legacyNotes' && filled(e, f))

/** Printing always uses the light theme, so the document reads on paper whatever the screen theme is. */
function usePrintInLight() {
  useEffect(() => {
    const root = document.documentElement
    let before: string | undefined
    const on = () => {
      before = root.dataset.theme
      root.dataset.theme = 'light'
    }
    const off = () => {
      if (before === undefined) delete root.dataset.theme
      else root.dataset.theme = before
    }
    window.addEventListener('beforeprint', on)
    window.addEventListener('afterprint', off)
    return () => {
      window.removeEventListener('beforeprint', on)
      window.removeEventListener('afterprint', off)
    }
  }, [])
}

/** A field value; references become links to the entry they point at. */
function Value({ project, docId, f, e, index }: { project: Project; docId: string; f: FieldDef; e: Entity; index: BookIndex }) {
  if (f.type === 'ref' || f.type === 'multiref') {
    const ids: string[] = f.type === 'ref' ? [e[f.key]] : e[f.key]
    const labels = new Map(resolveSource(project, docId, f.source).map((i) => [i.id, i.label]))
    return (
      <>
        {ids.map((id, i) => {
          const at = index.where.get(id)
          const label = labels.get(id) ?? at?.label ?? '⚠ missing'
          return <span key={id + i}>{i > 0 && ', '}{at ? <Link to={entryLink(at.docId, at.sectionId, id)}>{label}</Link> : label}</span>
        })}
      </>
    )
  }
  if (f.type === 'checklist' && Array.isArray(e[f.key]))
    return <ul className="book-check">{(e[f.key] as { id: string; text: string; done: boolean }[]).map((c) => <li key={c.id}>{c.done ? '☑' : '☐'} {c.text}</li>)}</ul>
  if (f.type === 'color') return <span><span className="book-swatch" style={{ background: e[f.key] }} /> {e[f.key]}</span>
  return <>{displayValue(project, docId, f, e)}</>
}

function Fields({ project, docId, fields, e, index }: { project: Project; docId: string; fields: FieldDef[]; e: Entity; index: BookIndex }) {
  const shown = shownFields(fields, e)
  if (!shown.length) return null
  return (
    <dl className="book-fields">
      {shown.map((f) => (
        <div key={f.key} className={f.type === 'longtext' || f.type === 'checklist' ? 'wide' : ''}>
          <dt>{f.label}</dt>
          <dd><Value project={project} docId={docId} f={f} e={e} index={index} /></dd>
        </div>
      ))}
    </dl>
  )
}

function UsedIn({ id, index, max = 8 }: { id: string; index: BookIndex; max?: number }) {
  const used = index.usedBy.get(id) ?? []
  if (!used.length) return null
  return (
    <>
      {used.slice(0, max).map((u, i) => <span key={u.entityId}>{i > 0 && ', '}<Link to={entryLink(u.docId, u.sectionId, u.entityId)}>{u.label}</Link></span>)}
      {used.length > max && ` +${used.length - max}`}
    </>
  )
}

function EntryCard({ project, docId, sec, e, index }: { project: Project; docId: string; sec: CollectionSection; e: Entity; index: BookIndex }) {
  const color = typeof e.color === 'string' ? e.color : undefined
  return (
    <article className="book-entry" style={color ? { borderTopColor: color } : undefined}>
      <h4><Link to={entryLink(docId, sec.id, e.id)}>{entityLabel(e) || '(unnamed)'}</Link></h4>
      <Fields project={project} docId={docId} fields={sec.fields} e={e} index={index} />
      {index.usedBy.has(e.id) && <p className="book-used muted">Used in: <UsedIn id={e.id} index={index} /></p>}
    </article>
  )
}

/** Long lists as one table: the section's key columns, then every other filled field, so nothing is dropped. */
function EntryTable({ project, docId, sec, items, index }: { project: Project; docId: string; sec: CollectionSection; items: Entity[]; index: BookIndex }) {
  const { main, rest } = tableColumns(sec, items)
  const usedAny = items.some((e) => index.usedBy.has(e.id))
  return (
    <div className="book-scroll">
      <table className="grid book-table">
        <thead>
          <tr><th>{sec.singular[0].toUpperCase() + sec.singular.slice(1)}</th>{main.map((f) => <th key={f.key}>{f.label}</th>)}{rest.length > 0 && <th>More</th>}{usedAny && <th>Used in</th>}</tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              <th scope="row"><Link to={entryLink(docId, sec.id, e.id)}>{entityLabel(e) || '(unnamed)'}</Link></th>
              {main.map((f) => <td key={f.key}>{filled(e, f) && <Value project={project} docId={docId} f={f} e={e} index={index} />}</td>)}
              {rest.length > 0 && (
                <td className="book-more">
                  {rest.filter((f) => filled(e, f)).map((f) => <div key={f.key}><span className="muted">{f.label}:</span> <Value project={project} docId={docId} f={f} e={e} index={index} /></div>)}
                </td>
              )}
              {usedAny && <td className="book-more"><UsedIn id={e.id} index={index} max={4} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A view from the editor, shown as a figure: no controls, no checks (see .book-figure in styles.css). */
function Figure({ project, docId, sec }: { project: Project; docId: string; sec: SectionDef }) {
  const data = project.documents[docId].data[sec.id]
  if (sec.kind === 'graph') return <StaticGraph data={data} />
  if (sec.kind === 'canvas') return <StaticCanvas items={data.items} />
  if (sec.kind !== 'collection') return null
  const visual = bookVisual(sec)
  if (!visual) return null
  const props: ViewProps = { docId, sec, items: data ?? [], onSelect: noop, patch: noop }
  return (
    <div className="book-figure-body" inert>
      <CollectionViewBody view={visual} props={props} onAdd={noop} />
    </div>
  )
}

/** Diagram colours inline (with fallbacks), so diagrams stay readable without the stylesheet, e.g. in a saved page. */
const SVG = {
  node: { fill: 'var(--surface-1, #fff)', stroke: 'var(--line-strong, #a9b0bd)', strokeWidth: 1.5 },
  kind: { fill: 'var(--muted, #5a6275)', fontSize: 10, textTransform: 'uppercase' as const },
  label: { fill: 'var(--text, #1b1f27)', fontSize: 13, fontWeight: 600 },
  edge: { fill: 'var(--muted, #5a6275)', fontSize: 10 },
}

/** Graph drawn from its saved positions: printable and needs no interaction. */
function StaticGraph({ data }: { data: GraphData }) {
  const W = 150, H = 44
  const xs = data.nodes.map((n) => n.x), ys = data.nodes.map((n) => n.y)
  const minX = Math.min(...xs) - 20, minY = Math.min(...ys) - 20
  const w = Math.max(...xs) - minX + W + 20, h = Math.max(...ys) - minY + H + 20
  const at = new Map(data.nodes.map((n) => [n.id, n]))
  return (
    <svg className="book-graph" viewBox={`${minX} ${minY} ${w} ${h}`} style={{ maxWidth: w }} role="img" aria-label="Diagram">
      <defs><marker id="book-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted, #5a6275)" /></marker></defs>
      {data.edges.map((e) => {
        const a = at.get(e.source), b = at.get(e.target)
        if (!a || !b) return null
        const x1 = a.x + W / 2, y1 = a.y + H / 2, x2 = b.x + W / 2, y2 = b.y + H / 2
        // Stop the arrow at the target box's edge.
        const dx = x2 - x1, dy = y2 - y1
        const t = Math.max(0, 1 - Math.min(Math.abs(dx) > 0 ? W / 2 / Math.abs(dx) : 1, Math.abs(dy) > 0 ? H / 2 / Math.abs(dy) : 1))
        const label = e.label ?? e.kind
        return (
          <g key={e.id}>
            <line x1={x1} y1={y1} x2={x1 + dx * t} y2={y1 + dy * t} stroke="var(--muted, #5a6275)" strokeWidth={1.5} markerEnd="url(#book-arrow)" />
            {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle" className="book-graph-edge" style={SVG.edge}>{label}</text>}
          </g>
        )
      })}
      {data.nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width={W} height={H} rx={8} className="book-graph-node" style={SVG.node} />
          <text x={n.x + 10} y={n.y + 16} className="book-graph-kind" style={SVG.kind}>{n.kind}</text>
          <text x={n.x + 10} y={n.y + 34} className="book-graph-label" style={SVG.label}>{n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}</text>
        </g>
      ))}
    </svg>
  )
}

function StaticCanvas({ items }: { items: CanvasItem[] }) {
  const maxX = Math.max(...items.map((i) => i.x + i.w)) + 20, maxY = Math.max(...items.map((i) => i.y + i.h)) + 20
  return (
    <svg className="book-graph" viewBox={`0 0 ${maxX} ${maxY}`} style={{ maxWidth: maxX }} role="img" aria-label="Sketch">
      {items.map((i) => (
        <g key={i.id}>
          <rect x={i.x} y={i.y} width={i.w} height={i.h} rx={6} className="book-graph-node" style={SVG.node} />
          <text x={i.x + 8} y={i.y + 18} className="book-graph-label" style={SVG.label}>{i.label}</text>
          <text x={i.x + 8} y={i.y + 34} className="book-graph-kind" style={SVG.kind}>{i.kind}</text>
        </g>
      ))}
    </svg>
  )
}

/** One section in full (appendix): its figure, then all of its data. */
function SectionBody({ project, docId, sec, index }: { project: Project; docId: string; sec: SectionDef; index: BookIndex }) {
  const data = project.documents[docId].data[sec.id]
  switch (sec.kind) {
    case 'form':
      return <Fields project={project} docId={docId} fields={sec.fields} e={{ id: sec.id, ...data }} index={index} />
    case 'collection': {
      const items = (data ?? []) as Entity[]
      return (
        <>
          {bookVisual(sec) && <div className="book-figure"><Figure project={project} docId={docId} sec={sec} /></div>}
          {items.length >= TABLE_FROM
            ? <EntryTable project={project} docId={docId} sec={sec} items={items} index={index} />
            : <div className="book-entries">{items.map((e) => <EntryCard key={e.id} project={project} docId={docId} sec={sec} e={e} index={index} />)}</div>}
        </>
      )
    }
    case 'graph':
    case 'canvas':
      return <div className="book-figure"><Figure project={project} docId={docId} sec={sec} /></div>
    case 'matrix': {
      const rows = resolveSource(project, docId, sec.rows), cols = resolveSource(project, docId, sec.cols)
      const cells = (data?.cells ?? {}) as Record<string, string | number>
      return (
        <div className="book-scroll">
          <table className="grid book-table">
            <thead><tr><th />{cols.map((c) => <th key={c.id}>{c.label}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><th scope="row">{r.label}</th>{cols.map((c) => <td key={c.id} className="num">{cells[`${r.id}|${c.id}`] ?? ''}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    }
    case 'checklist':
      return (
        <div className="book-entries">
          {data.groups.map((g: { id: string; title: string; items: { id: string; text: string; done: boolean }[] }) => (
            <article key={g.id} className="book-entry"><h4>{g.title}</h4><ul className="book-check">{g.items.map((i) => <li key={i.id}>{i.done ? '☑' : '☐'} {i.text}</li>)}</ul></article>
          ))}
        </div>
      )
    case 'formulas':
      return (
        <table className="grid book-table">
          <thead><tr><th>Formula</th><th>Expression</th><th>Example inputs</th><th>Result</th></tr></thead>
          <tbody>
            {data.items.map((f: { id: string; name: string; expr: string; vars: Record<string, number> }) => {
              const r = tryEvaluate(f.expr, f.vars)
              return <tr key={f.id}><td>{f.name}</td><td><code>{f.expr}</code></td><td>{Object.entries(f.vars ?? {}).map(([k, v]) => `${k} = ${v}`).join(', ')}</td><td className="num">{r.ok ? Math.round(r.value * 100) / 100 : '⚠'}</td></tr>
            })}
          </tbody>
        </table>
      )
    case 'richtext':
      return <p className="book-text">{String(data)}</p>
  }
}

function ChapterHead({ docId }: { docId: string }) {
  const mod = getModule(docId)!
  return (
    <>
      <h2><ModuleIcon id={docId} /> <Link to={`/doc/${docId}`}>{mod.title}</Link></h2>
      {mod.summary && <p className="book-chapter-sub muted">{mod.summary}</p>}
    </>
  )
}

/** The presentable part: the planner's key decisions, its numbers and one figure. */
function BriefChapter({ project, docId, figureNo }: { project: Project; docId: string; figureNo: number }) {
  const lead = briefLead(project, docId)
  const numbers = briefNumbers(project, docId)
  const fig = briefFigure(project, docId)
  return (
    <section className="book-chapter" id={anchor(docId)}>
      <ChapterHead docId={docId} />
      {lead.map((l) => <p key={l.label} className="book-lead"><strong>{l.label}.</strong> {l.text}</p>)}
      {numbers.length > 0 && (
        <div className="book-numbers">{numbers.map((n) => <div key={n.label}><span className="num">{n.value}</span><span className="muted">{n.label}</span></div>)}</div>
      )}
      {fig && (
        <figure className="book-figure">
          <Figure project={project} docId={docId} sec={fig} />
          <figcaption>Figure {figureNo}. {fig.title}</figcaption>
        </figure>
      )}
    </section>
  )
}

/** The appendix: every filled section with all of its data. */
function DataChapter({ project, docId, index }: { project: Project; docId: string; index: BookIndex }) {
  return (
    <section className="book-chapter" id={anchor(docId)}>
      <ChapterHead docId={docId} />
      {filledSections(project, docId).map((sec) => (
        <section key={sec.id} className="book-section" id={anchor(docId, sec.id)}>
          <h3><Link to={entryLink(docId, sec.id)}>{sec.title}</Link></h3>
          <SectionBody project={project} docId={docId} sec={sec} index={index} />
        </section>
      ))}
    </section>
  )
}

/** Text of a form field, for the cover. */
const formText = (project: Project, doc: string, sec: string, key: string): string => String(project.documents[doc]?.data[sec]?.[key] ?? '').trim()

function Cover({ project, mode }: { project: Project; mode: Mode }) {
  const pitch = formText(project, 'overview.vision', 'pitch', 'pitch')
  const fantasy = formText(project, 'overview.vision', 'pitch', 'playerFantasy')
  const pillars = (project.documents['overview.vision']?.data.pillars ?? []) as Entity[]
  const stats = bookStats(project)
  return (
    <header className="book-cover">
      <p className="book-kicker">{mode === 'brief' ? 'Game design brief' : 'Game design data · appendix'}</p>
      <h1>{project.meta.name}</h1>
      {pitch && <p className="book-pitch">{pitch}</p>}
      {fantasy && <p className="book-lead">{fantasy}</p>}
      {pillars.length > 0 && (
        <div className="book-pillars">
          {pillars.map((p) => <div key={p.id}><strong>{entityLabel(p)}</strong>{p.rationale && <span className="muted"> — {p.rationale}</span>}</div>)}
        </div>
      )}
      {stats.length > 0 && (
        <div className="book-numbers">
          {stats.map((s) => <div key={s.label}><span className="num">{s.value}</span><span className="muted">{s.label}</span></div>)}
        </div>
      )}
    </header>
  )
}

export function ProjectBook() {
  const project = useProject()
  const { walk } = useWalkthrough()
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('m') === 'data' ? 'data' : 'brief'
  const setMode = (m: Mode) => {
    const n = new URLSearchParams(params)
    if (m === 'data') n.set('m', 'data')
    else n.delete('m')
    setParams(n, { replace: true })
  }
  usePrintInLight()
  const index = useMemo(() => bookIndex(project), [project])
  const phases = useMemo(() => compassPhases(project, walk), [project, walk])
  const chapters = phases.map((ph) => ({ ...ph, planners: ph.planners.filter((p) => filledSections(project, p.id).length > 0) })).filter((ph) => ph.planners.length)
  // Brief figures are numbered through the whole document.
  let figure = 0
  return (
    <div className={`book book-${mode}`}>
      <div className="book-tools">
        <Segmented role="group" aria-label="Book contents">
          <button type="button" aria-pressed={mode === 'brief'} onClick={() => setMode('brief')}>Brief</button>
          <button type="button" aria-pressed={mode === 'data'} onClick={() => setMode('data')}>Full data</button>
        </Segmented>
        <span className="muted book-tools-note">{mode === 'brief' ? 'Key decisions and one figure per planner.' : 'Every filled section with all of its entries.'}</span>
        <span className="bar3-spacer" />
        <button type="button" onClick={() => window.print()}><Icon name="download" /> Print / save as PDF</button>
      </div>
      <Cover project={project} mode={mode} />
      {!chapters.length ? (
        <p className="empty">Nothing to show yet: the book collects the planners you have filled in.</p>
      ) : (
        <>
          <nav className="book-toc" aria-label="Contents">
            {chapters.map((ph) => (
              <div key={ph.phase} className="book-toc-row">
                <strong>{t(`walkthrough.phases.${ph.phase}`)}</strong>
                <ul>{ph.planners.map((p) => <li key={p.id}><button type="button" className="link" onClick={() => jump(anchor(p.id))}>{p.title}</button></li>)}</ul>
              </div>
            ))}
          </nav>
          {chapters.map((ph) => (
            <div key={ph.phase} className="book-part">
              <h2 className="book-part-title">{t(`walkthrough.phases.${ph.phase}`)}</h2>
              {ph.planners.map((p) => {
                if (mode === 'data') return <DataChapter key={p.id} project={project} docId={p.id} index={index} />
                if (briefFigure(project, p.id)) figure++
                return <BriefChapter key={p.id} project={project} docId={p.id} figureNo={figure} />
              })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
