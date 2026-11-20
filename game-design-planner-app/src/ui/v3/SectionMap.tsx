import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { GuideMap as MapDef } from '../../core/guides/types'
import { getModule } from '../../core/modules/registry'
import { mapStates, type NodeState } from '../guides/GuideMap'
import { useProject } from '../hooks'
import { ModuleIcon } from '../ModuleIcon'
import { Ring } from './PhaseCompass'

/** The guide maps lay nodes out as 140×44 boxes; a landmark sits on the box's centre. */
const BOX_W = 140
const BOX_H = 44
/** Room around the landmarks: a ring's radius plus its two-line name below, and the "You are here" tag above. */
// Half a name's 100px width, kept at the map's smallest scale (0.8, its min-width on phones).
const PAD_X = 68
const PAD_TOP = 68
const PAD_BOTTOM = 76
/** Where an edge stops short of a landmark's centre, so its arrow lands on the ring (map units). */
const RING_GAP = 30
/** Leaving a landmark downwards, an edge starts under its name instead. */
const NAME_GAP = 58
/** The guides' rows are spaced for flat boxes; landmarks with a name below need more height between rows. */
const Y_STRETCH = 1.5
const FILL: Record<NodeState, number> = { empty: 0, started: 50, done: 100, external: 0 }
const pct = (v: number, of: number) => `${(v / of) * 100}%`

/**
 * A planner's section map in the Atlas's look (v3): landmarks with progress rings on the map paper, thin links
 * with what flows along them, the current section marked "You are here", and other planners as faded landmarks.
 * Uses the guide's node layout and `mapStates`, so it agrees with the classic map and the section strip.
 */
export function SectionMap({ docId, map, current }: { docId: string; map: MapDef; current?: string }) {
  const { t } = useTranslation()
  const project = useProject()
  const states = useMemo(() => mapStates(project, docId, map), [project, docId, map])
  // Landmark centres, and a tight frame around them so the map fills its space whatever the stored canvas size.
  const pts = map.nodes.map((n) => ({ ...n, cx: n.x + BOX_W / 2, cy: (n.y + BOX_H / 2) * Y_STRETCH }))
  const at = new Map(pts.map((p) => [p.id, p]))
  const minX = Math.min(...pts.map((p) => p.cx)) - PAD_X
  const minY = Math.min(...pts.map((p) => p.cy)) - PAD_TOP
  const w = Math.max(...pts.map((p) => p.cx)) + PAD_X - minX
  const h = Math.max(...pts.map((p) => p.cy)) + PAD_BOTTOM - minY
  const x = (v: number) => pct(v - minX, w)
  const y = (v: number) => pct(v - minY, h)
  const stateName = (s: NodeState) => (s === 'external' ? t('v3.section.mapOther') : t(`v3.section.state.${s}`))

  return (
    <div className="secmap3">
      <div className="atlas3-map secmap3-map bp-grid" style={{ aspectRatio: `${w} / ${h}`, minWidth: Math.round(w * 0.8) }} role="group" aria-label={t('map.title')}>
        <svg className="atlas3-svg" viewBox={`${minX} ${minY} ${w} ${h}`} aria-hidden="true">
          <defs>
            <marker id="secmap3-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="secmap3-arrowhead" />
            </marker>
          </defs>
          {map.edges.map((e) => {
            const a = at.get(e.from)
            const b = at.get(e.to)
            if (!a || !b) return null
            const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1
            const ux = (b.cx - a.cx) / len
            const uy = (b.cy - a.cy) / len
            // Each end clears the ring, or the name too where the edge leaves a landmark downwards.
            const gapA = uy > 0.5 ? NAME_GAP : RING_GAP
            const gapB = -uy > 0.5 ? NAME_GAP : RING_GAP
            const x1 = a.cx + ux * gapA
            const y1 = a.cy + uy * gapA
            const x2 = b.cx - ux * gapB
            const y2 = b.cy - uy * gapB
            const lit = e.from === current || e.to === current
            // A steep edge's label sits beside it, a flat one's above it.
            const steep = Math.abs(uy) > 0.8
            return (
              <g key={`${e.from}-${e.to}`} className={'secmap3-edge' + (lit ? ' lit' : '')}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#secmap3-arrow)" />
                <text x={(x1 + x2) / 2 + (steep ? 7 : 0)} y={(y1 + y2) / 2 + (steep ? 4 : -5)} textAnchor={steep ? 'start' : 'middle'}>{e.label}</text>
              </g>
            )
          })}
        </svg>
        {pts.map((n) => {
          const s = states[n.id]
          const here = !!n.section && n.section === current
          const to = n.section ? `/doc/${docId}?s=${n.section}` : `/doc/${n.doc}`
          return (
            <Link
              key={n.id}
              to={to}
              className={`atlas3-lm secmap3-lm ${s.state}` + (s.state === 'external' ? ' fogged' : '') + (here ? ' here' : '')}
              style={{ left: x(n.cx), top: y(n.cy) }}
              aria-label={[n.label, stateName(s.state), s.hints > 0 && t('v3.section.hints', { count: s.hints }), here && t('v3.atlas.here')].filter(Boolean).join(', ')}
              aria-current={here ? 'location' : undefined}
            >
              <span className="atlas3-ring">
                <Ring value={FILL[s.state]} />
                {n.doc ? <ModuleIcon id={n.doc} /> : <span className={'glyph3 ' + s.state} aria-hidden="true" />}
                {s.hints > 0 && s.state !== 'empty' && <span className="badge secmap3-badge" aria-hidden="true">{s.hints}</span>}
              </span>
              <span className="atlas3-name">{n.doc ? getModule(n.doc)?.title ?? n.label : n.label}</span>
              {here && <span className="atlas3-here">{t('v3.atlas.here')}</span>}
            </Link>
          )
        })}
      </div>
      <div className="secmap3-legend" aria-hidden="true">
        {(['empty', 'started', 'done'] as const).map((s) => <span key={s}><span className={'glyph3 ' + s} />{stateName(s)}</span>)}
        <span><span className="secmap3-key-other" />{t('v3.section.mapOther')}</span>
        <span><i className="secmap3-key-link" />{t('v3.section.mapFeeds')}</span>
      </div>
    </div>
  )
}
