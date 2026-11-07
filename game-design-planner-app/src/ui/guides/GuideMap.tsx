import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collectHints, makeContext } from '../../core/hints/engine'
import { isSectionEmpty } from '../../core/hints/util'
import type { GuideMap as MapDef } from '../../core/guides/types'
import { getModule, getSection } from '../../core/modules/registry'
import type { Project } from '../../core/model/types'
import { useProject } from '../hooks'

const W = 140
const H = 44

export type NodeState = 'empty' | 'started' | 'done' | 'external'

/** Empty: no data. Started: data but open hints. Done: data and no hints for the section. */
export function mapStates(project: Project, docId: string, map: MapDef): Record<string, { state: NodeState; hints: number }> {
  const mod = getModule(docId)
  const hints = collectHints(makeContext(project, { docId }))
  const out: Record<string, { state: NodeState; hints: number }> = {}
  for (const n of map.nodes) {
    if (!n.section || !mod) {
      out[n.id] = { state: 'external', hints: 0 }
      continue
    }
    const sec = getSection(mod, project.registry, n.section)
    const count = hints.filter((h) => h.target.docId === docId && h.target.sectionId === n.section).length
    const empty = !sec || isSectionEmpty(sec, project.documents[docId]?.data[n.section])
    out[n.id] = { state: empty ? 'empty' : count ? 'started' : 'done', hints: count }
  }
  return out
}

/** Point where the segment from a box's centre towards (tx, ty) leaves the box. */
function exit(x: number, y: number, tx: number, ty: number) {
  const cx = x + W / 2
  const cy = y + H / 2
  const dx = tx - cx
  const dy = ty - cy
  const s = Math.min(dx ? W / 2 / Math.abs(dx) : Infinity, dy ? H / 2 / Math.abs(dy) : Infinity)
  return { x: cx + dx * s, y: cy + dy * s }
}

/** Clickable diagram of how the module's sections and neighbouring modules feed each other, coloured by progress. */
export function GuideMap({ docId, map, current, onNavigate }: { docId: string; map: MapDef; current?: string; onNavigate?: () => void }) {
  const project = useProject()
  const nav = useNavigate()
  const states = useMemo(() => mapStates(project, docId, map), [project, docId, map])
  const byId = new Map(map.nodes.map((n) => [n.id, n]))
  const go = (n: MapDef['nodes'][number]) => {
    onNavigate?.()
    nav(n.section ? `/doc/${docId}?s=${n.section}` : `/doc/${n.doc}`)
  }
  // Tight bounding box of the nodes (plus room for badges), so the layout is centred whatever the stored canvas size.
  const PAD = 16
  const minX = Math.min(...map.nodes.map((n) => n.x)) - PAD
  const minY = Math.min(...map.nodes.map((n) => n.y)) - PAD
  const boxW = Math.max(...map.nodes.map((n) => n.x + W)) + PAD - minX
  const boxH = Math.max(...map.nodes.map((n) => n.y + H)) + PAD - minY
  // Roughly constant on-screen scale: small maps are enlarged (up to 1.6x), big ones stay at 1x; max-width:100% shrinks to fit.
  const scale = Math.min(1.6, Math.max(1, 560 / boxW))
  return (
    <div className="guide-map">
      <svg
        viewBox={`${minX} ${minY} ${boxW} ${boxH}`}
        style={{ width: Math.round(boxW * scale) }}
        role="group"
        aria-label="System map"
      >
        <defs>
          <marker id="gm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="gm-arrowhead" />
          </marker>
        </defs>
        {map.edges.map((e) => {
          const a = byId.get(e.from)
          const b = byId.get(e.to)
          if (!a || !b) return null
          const p1 = exit(a.x, a.y, b.x + W / 2, b.y + H / 2)
          const p2 = exit(b.x, b.y, a.x + W / 2, a.y + H / 2)
          return (
            <g key={`${e.from}-${e.to}`}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="gm-edge" markerEnd="url(#gm-arrow)" />
              <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 4} textAnchor="middle" className="gm-edge-label">{e.label}</text>
            </g>
          )
        })}
        {map.nodes.map((n) => {
          const s = states[n.id]
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              className={`gm-node gm-${s.state}${n.section && n.section === current ? ' current' : ''}`}
              role="link"
              tabIndex={0}
              aria-label={`${n.label}${n.doc ? ' (other document)' : `, ${s.state}`}`}
              onClick={() => go(n)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && go(n)}
            >
              <rect width={W} height={H} rx={n.doc ? 22 : 6} />
              <text x={W / 2} y={H / 2 + 4} textAnchor="middle">{n.label}</text>
              {s.hints > 0 && s.state !== 'empty' && (
                <g transform={`translate(${W - 8},-6)`}>
                  <circle r={9} className="gm-badge" />
                  <text y={4} textAnchor="middle" className="gm-badge-text">{s.hints}</text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
      <div className="legend">
        <span className="cv-legend gm-key gm-empty">Empty</span>
        <span className="cv-legend gm-key gm-started">Has open tips</span>
        <span className="cv-legend gm-key gm-done">No open tips</span>
        <span className="cv-legend gm-key gm-external">Other document</span>
      </div>
    </div>
  )
}
