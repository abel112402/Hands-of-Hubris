import { useState, type KeyboardEvent } from 'react'
import { ARCH_DOC, archList, nameOf } from '../../core/architecture'
import { CLASS_KINDS, classIssues, classModel, mergeImported, parseMermaid, toMermaid, type ClassEdgeKind, type ClassNode } from '../../core/classes'
import { schemaFields } from '../../core/dataDriven'
import { makeId } from '../../core/model/project'
import type { Entity } from '../../core/model/types'
import { downloadText } from '../../core/persistence/file'
import { useStore } from '../../core/store/store'
import { countOf } from '../../core/text'
import { useProject } from '../hooks'
import { engineStatusOf } from '../../core/engine/report'
import { engineStatusText } from '../EngineBadge'
import { ARCH_COLORS } from './architectureViews'
import type { ViewProps } from './CollectionEditor'

const BW = 240
const HEAD = 38
const ROW = 17
const GX = 60
const GY = 70
const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}
const VIS = { public: '+', private: '-', protected: '#' } as const
const EDGE_LABEL: Record<ClassEdgeKind, string> = { inherits: 'inherits', implements: 'implements', requires: 'requires', uses: 'uses', data: 'uses data' }
const MARK = { error: '✗', warning: '⚠', info: 'ℹ' } as const

type Box = { id: string; title: string; stereo: string; lines: { text: string; sep?: boolean }[]; ent: Entity; data: boolean; module?: string; status?: ReturnType<typeof engineStatusText> }

/** Classes as UML boxes, bases above the classes that inherit them, with inherit, implement, require and use lines; data schemas they use in a row below. */
export function ClassDiagramView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [focus, setFocus] = useState<string | null>(null)
  const { nodes, edges } = classModel(project)
  const issues = classIssues(project)
  const shown = new Set(items.map((i) => i.id))
  const visible = nodes.filter((n) => shown.has(n.cls.id))
  const modules = archList(project, 'modules')
  const modColor = new Map(modules.map((m, i) => [m.id, ARCH_COLORS[i % ARCH_COLORS.length]]))

  // Rows by inheritance depth; data schemas in the last row.
  const byId = new Map(nodes.map((n) => [n.cls.id, n]))
  const depth = (n: ClassNode, seen = new Set<string>()): number => {
    const b = byId.get(n.cls.base)
    if (!b || seen.has(n.cls.id)) return 0
    seen.add(n.cls.id)
    return depth(b, seen) + 1
  }
  const boxOf = (n: ClassNode): Box => ({
    id: n.cls.id,
    title: nameOf(n.cls),
    stereo: `«${CLASS_KINDS.find((k) => k.id === n.kind)!.label}»`,
    ent: n.cls,
    data: false,
    module: n.cls.module,
    status: (() => {
      const st = engineStatusOf(project, n.cls.id)
      return st ? engineStatusText(st) : undefined
    })(),
    lines: [
      ...n.fields.map((f) => ({ text: n.kind === 'enum' ? f.name : `${VIS[f.visibility]} ${f.isStatic ? 'static ' : ''}${f.name}${f.type ? `: ${f.type.raw}` : ''}` })),
      ...n.methods.map((m, i) => ({ text: `${VIS[m.visibility]} ${m.isStatic ? 'static ' : ''}${m.name}(${m.params.map((x) => x.name).join(', ')})${m.returns ? `: ${m.returns.raw}` : ''}`, sep: i === 0 && n.fields.length > 0 })),
    ],
  })
  const rows: Box[][] = []
  for (const n of [...visible].sort((a, b) => String(a.cls.module ?? '').localeCompare(String(b.cls.module ?? '')))) (rows[depth(n)] ??= []).push(boxOf(n))
  const dataEdges = edges.filter((e) => e.kind === 'data' && shown.has(e.from.id))
  const schemas = [...new Map(dataEdges.map((e) => [e.to.id, e.to])).values()]
  const dense = rows.filter(Boolean)
  if (schemas.length) dense.push(schemas.map((s) => ({ id: s.id, title: nameOf(s), stereo: '«Data schema»', ent: s, data: true, lines: schemaFields(project, s).map((f) => ({ text: `${f.name}: ${f.type}` })) })))

  const height = (b: Box) => HEAD + Math.max(1, b.lines.length) * ROW + 10 + (b.lines.some((l) => l.sep) ? 6 : 0) + (b.status ? ROW : 0)
  const rowH = dense.map((r) => Math.max(...r.map(height)))
  const cols = Math.max(1, ...dense.map((r) => r.length))
  const W = 40 + cols * BW + (cols - 1) * GX
  const pos = new Map<string, { x: number; y: number; h: number }>()
  dense.forEach((r, ri) => {
    const offset = ((cols - r.length) * (BW + GX)) / 2
    const y = 20 + rowH.slice(0, ri).reduce((a, b) => a + b + GY, 0)
    r.forEach((b, i) => pos.set(b.id, { x: 20 + offset + i * (BW + GX), y, h: height(b) }))
  })
  const H = 40 + rowH.reduce((a, b) => a + b + GY, 0) - GY
  const active = focus ?? selected ?? null
  const linked = (id: string) => !active || id === active || edges.some((e) => (e.from.id === active && e.to.id === id) || (e.to.id === active && e.from.id === id))
  const drawn = edges.filter((e) => pos.has(e.from.id) && pos.has(e.to.id))

  return (
    <div className="stack dd-view class-view">
      <p className="muted">
        Bases sit above the classes that inherit them. Solid line with an open triangle = inherits, dashed = implements, dotted = requires a component, arrow = uses (a field, parameter or return type), thin dashed = uses a data schema. Click a box to edit it; hover to see only its links.
      </p>
      {visible.length === 0 ? (
        <p className="empty">No classes yet. Add one, or import a Mermaid class diagram below.</p>
      ) : (
        <div className="npc-scroll">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} className="arch-svg class-svg" role="img" aria-label="Class diagram">
            <defs>
              <marker id="cd-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
                <path d="M1,1 L11,6 L1,11 Z" className="cd-tri" />
              </marker>
              <marker id="cd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                <path d="M1,1 L9,5 L1,9" className="cd-open" />
              </marker>
            </defs>
            {drawn.map((e, i) => {
              const a = pos.get(e.from.id)!
              const b = pos.get(e.to.id)!
              const below = b.y > a.y + 1
              const above = b.y + 1 < a.y
              const x1 = a.x + BW / 2 + (i % 3 - 1) * 12
              const x2 = b.x + BW / 2 + (i % 3 - 1) * 12
              const [y1, y2] = above ? [a.y, b.y + b.h] : below ? [a.y + a.h, b.y] : [a.y + a.h / 2, b.y + b.h / 2]
              const [sx, ex] = !above && !below ? (b.x > a.x ? [a.x + BW, b.x] : [a.x, b.x + BW]) : [x1, x2]
              const dim = active && e.from.id !== active && e.to.id !== active
              const tri = e.kind === 'inherits' || e.kind === 'implements'
              return (
                <g key={i} className={'cd-edge ' + e.kind + (dim ? ' dim' : '')}>
                  <title>{`${nameOf(e.from)} ${EDGE_LABEL[e.kind]} ${nameOf(e.to)}${e.label && !tri ? ` (${e.label})` : ''}`}</title>
                  <line x1={sx} y1={y1} x2={ex} y2={y2} markerEnd={`url(#${tri ? 'cd-tri' : 'cd-arrow'})`} strokeWidth={e.list ? 3 : 1.6} />
                </g>
              )
            })}
            {dense.flat().map((b) => {
              const p = pos.get(b.id)!
              const color = b.data ? 'var(--c-grey)' : modColor.get(b.module ?? '') ?? 'var(--c-slate)'
              const sepAt = b.lines.findIndex((l) => l.sep)
              return (
                <g
                  key={b.id}
                  transform={`translate(${p.x},${p.y})`}
                  className={'cd-box' + (b.data ? ' data' : '') + (b.id === selected ? ' selected' : '') + (linked(b.id) ? '' : ' dim')}
                  role={b.data ? undefined : 'button'}
                  tabIndex={b.data ? undefined : 0}
                  aria-label={`${b.data ? 'Data schema' : 'Class'} ${b.title}`}
                  onClick={b.data ? undefined : () => onSelect(b.id)}
                  onKeyDown={b.data ? undefined : keyActivate(() => onSelect(b.id))}
                  onMouseEnter={() => setFocus(b.id)}
                  onMouseLeave={() => setFocus(null)}
                >
                  <rect width={BW} height={p.h} rx={6} className="cd-box-bg" />
                  <rect width={BW} height={HEAD} rx={6} fill={color} className="cd-box-head" />
                  <text x={BW / 2} y={14} textAnchor="middle" className="cd-stereo">{b.stereo}</text>
                  <text x={BW / 2} y={30} textAnchor="middle" className="cd-title">{short(b.title, 26)}</text>
                  {!b.lines.length && <text x={10} y={HEAD + 14} className="cd-line muted-line">no members yet</text>}
                  {b.lines.map((l, i) => (
                    <text key={i} x={10} y={HEAD + 14 + i * ROW + (sepAt >= 0 && i >= sepAt ? 6 : 0)} className="cd-line">{short(l.text, 34)}</text>
                  ))}
                  {b.status && (
                    <text x={10} y={p.h - 8} className={'cd-status ' + b.status.tone}>
                      <title>{b.status.long}</title>
                      {`${b.status.icon} ${b.status.short}`}
                    </text>
                  )}
                  {sepAt >= 0 && <line x1={0} x2={BW} y1={HEAD + 2 + sepAt * ROW + 3} y2={HEAD + 2 + sepAt * ROW + 3} className="cd-sep" />}
                </g>
              )
            })}
          </svg>
        </div>
      )}
      {issues.length > 0 && (
        <section aria-label="Class checks" className="engine-checks">
          <strong>{countOf(issues.filter((i) => i.level !== 'info').length, 'problem')} · {countOf(issues.filter((i) => i.level === 'info').length, 'note')}</strong>
          <ul>
            {issues.map((i, k) => (
              <li key={k} className={'engine-issue ' + i.level}>
                <span aria-hidden="true">{MARK[i.level]} </span>
                <button className="link" onClick={() => onSelect(i.cls.id)}>{i.message}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <MermaidPanel />
    </div>
  )
}

/** Mermaid classDiagram out (copy or download) and in (paste, then merge by class name in one undo step). */
function MermaidPanel() {
  const project = useProject()
  const [text, setText] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const out = toMermaid(project)
  const doImport = () => {
    const { classes, problems } = parseMermaid(text)
    if (!classes.length) {
      setResult(problems[0] ?? 'No classes found.')
      return
    }
    let counts = { added: 0, updated: 0 }
    useStore.getState().mutate(
      (p) => {
        const doc = (p.documents[ARCH_DOC] ??= { moduleVersion: 2, data: {} })
        if (!Array.isArray(doc.data.classes)) doc.data.classes = []
        counts = mergeImported(doc.data.classes, classes, makeId)
      },
      undefined,
      'Import classes from Mermaid',
    )
    setResult(`${countOf(counts.added, 'class', 'classes')} added, ${counts.updated} updated${problems.length ? `; ${countOf(problems.length, 'line')} skipped` : ''}.`)
  }
  return (
    <details className="engine-map">
      <summary>Mermaid class diagram (export / import)</summary>
      <div className="class-mermaid">
        <label className="stack-sm">
          <span>This diagram as Mermaid</span>
          <textarea readOnly value={out} rows={8} className="dd-json" aria-label="Mermaid export" />
        </label>
        <div className="row">
          <button onClick={() => downloadText(`${project.meta.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'project'}-classes.mmd`, out, 'text/plain')}>Download .mmd</button>
        </div>
        <label className="stack-sm">
          <span>Paste a Mermaid classDiagram to add its classes (existing ones only get empty fields filled)</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="dd-json" aria-label="Mermaid to import" placeholder={'classDiagram\n  class Health {\n    <<Component>>\n    -max: float\n    +Damage(amount: float)\n  }'} />
        </label>
        <div className="row" style={{ alignItems: 'center' }}>
          <button onClick={doImport} disabled={!text.trim()}>Import classes</button>
          {result && <span role="status" className="muted">{result}</span>}
        </div>
      </div>
    </details>
  )
}
