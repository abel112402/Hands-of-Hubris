import { countOf } from '../../core/text'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { useStore } from '../../core/store/store'
import {
  addBorders,
  atlasModel,
  biomeCoverage,
  biomeThreat,
  biomesInOrder,
  COVERAGE_COLUMNS,
  dossier,
  MAP_H,
  MAP_W,
  nameOf,
  placeUnplaced,
  roleIndex,
  ROLE_ORDER,
  touchingWithoutBorder,
  unlockPath,
  type CoverageRow,
  type UnlockLink,
  type UnlockVia,
} from '../../core/world'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

/** Role tier colours (Starter → Final, then "no role"); the same ramp as Combat's threat curve. */
export const ROLE_COLORS = ['#53c28b', '#4f9cf9', '#f2c94c', '#f97b4f', '#e5707e', '#8b93a5']
const VIA_COLORS: Record<UnlockVia, string> = { boss: '#e5707e', quest: '#4f9cf9', faction: '#d86be0', graph: '#8b93a5' }
const VIA_LABEL: Record<UnlockVia, string> = { boss: 'Boss', quest: 'Quest', faction: 'Faction', graph: 'Graph arrow' }
const MARKER_GLYPH: Record<string, string> = { Capital: '★', Outpost: '⚑', Landmark: '◆', Note: '✎' }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n * 10) / 10))
const roleColor = (b: Entity) => ROLE_COLORS[roleIndex(b) ?? 5]
export const biomeColor = (b: Entity | undefined) => (b && typeof b.color === 'string' && b.color ? b.color : b ? roleColor(b) : '#8b93a5')
const catalogLabel = (p: Project, cat: string, id: string) => p.registry.catalogs[cat]?.items.find((i) => i.id === id)?.label ?? id
/** Linear ramp red (0) → amber → green (1). */
const ramp = (t: number) => {
  const k = Math.max(0, Math.min(1, t))
  const [a, b] = k < 0.5 ? [[229, 112, 126], [242, 201, 76]] : [[242, 201, 76], [83, 194, 139]]
  const u = k < 0.5 ? k * 2 : (k - 0.5) * 2
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * u)).join(',')})`
}

function mutate(fn: (p: Project) => void) {
  useStore.getState().mutate(fn)
}

const EmptyNote = ({ children }: { children: ReactNode }) => <p className="empty muted">{children}</p>

// ---------- Dossier ----------

function Tile({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className={'wd-tile' + (warn ? ' warn' : '')}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function Chips({ items, empty, onPick }: { items: { id: string; label: string; title?: string }[]; empty: string; onPick?: (id: string) => void }) {
  if (!items.length) return <span className="muted wd-none">{empty}</span>
  return (
    <div className="chips">
      {items.map((x) =>
        onPick ? (
          <button key={x.id} className="chip" title={x.title} onClick={() => onPick(x.id)}>{x.label}</button>
        ) : (
          <span key={x.id} className="chip" title={x.title}>{x.label}</span>
        ),
      )}
    </div>
  )
}

function GateLine({ l, project, other }: { l: UnlockLink; project: Project; other: 'from' | 'to' }) {
  const id = other === 'from' ? l.from : l.to
  const b = id ? project.documents['design.world']?.data.biomes?.find((x: Entity) => x.id === id) : undefined
  return (
    <li className={l.inside || l.backward ? 'bad' : undefined}>
      <span className="wd-via" style={{ background: VIA_COLORS[l.via] }}>{VIA_LABEL[l.via]}</span> {l.gate}
      {other === 'from' && (l.from ? <span className="muted"> · met in {nameOf(b)}</span> : <span className="muted"> · not tied to a biome</span>)}
      {other === 'to' && <span className="muted"> → {nameOf(b)}</span>}
      {l.inside && ' · ⚠ met inside the biome it opens'}
      {l.backward && ' · ⚠ met in a later-role biome'}
    </li>
  )
}

/** The whole map at thumbnail size with one biome's zone and markers highlighted. */
function MiniMap({ project, biomeId }: { project: Project; biomeId: string }) {
  const m = atlasModel(project)
  if (!m.zones.length) return <EmptyNote>No map yet. Draw biome zones in Map sketch.</EmptyNote>
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="wd-minimap" role="img" aria-label="Where this biome lies on the map">
      {m.zones.map(({ item, biome }) => (
        <rect key={item.id} x={item.x} y={item.y} width={item.w} height={item.h} rx={10} fill={biomeColor(biome)} opacity={biome?.id === biomeId ? 0.85 : 0.18} stroke={biome?.id === biomeId ? 'var(--text)' : 'none'} strokeWidth={6} />
      ))}
      {m.markers.filter((x) => x.biomeId === biomeId).map(({ item }) => (
        <text key={item.id} x={item.x + item.w / 2} y={item.y + item.h / 2} textAnchor="middle" dominantBaseline="middle" className="wd-mini-glyph">{MARKER_GLYPH[item.kind] ?? '•'}</text>
      ))}
    </svg>
  )
}

export function BiomeDossierView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const list = biomesInOrder(project).filter((b) => items.some((x) => x.id === b.id))
  const cov = new Map(biomeCoverage(project).map((r) => [r.biome.id, r.score]))
  const current = list.find((b) => b.id === selected) ?? list[0]
  if (!current) return null
  const d = dossier(project, current.id)!
  const c = d.content
  const t = d.threat
  const missing = d.coverage ? COVERAGE_COLUMNS.filter((col) => d.coverage!.cells[col.key] === 0).map((col) => col.label) : []
  const lv = isNum(current.levelMin) ? `Lv ${current.levelMin}${isNum(current.levelMax) && current.levelMax !== current.levelMin ? `–${current.levelMax}` : ''}` : 'No level range'
  return (
    <div className="wd">
      <div className="wd-body">
      <nav className="wd-list" aria-label="Biomes">
        {list.map((b) => (
          <button key={b.id} className={'wd-pick' + (b.id === current.id ? ' active' : '')} onClick={() => onSelect(b.id)}>
            <i className="wd-swatch" style={{ background: biomeColor(b) }} />
            <span>{nameOf(b)}</span>
            <small className="muted">{b.role ?? '—'}</small>
            <span className="wd-score" title={`${Math.round((cov.get(b.id) ?? 0) * 100)}% covered`}><i style={{ width: `${(cov.get(b.id) ?? 0) * 100}%`, background: ramp(cov.get(b.id) ?? 0) }} /></span>
          </button>
        ))}
      </nav>
      <article className="wd-sheet" style={{ borderTopColor: biomeColor(current) }} aria-label={`Dossier: ${nameOf(current)}`}>
        <header className="wd-head">
          <i className="wd-swatch big" style={{ background: biomeColor(current) }} />
          <div>
            <h3>{nameOf(current)}</h3>
            <div className="chips">
              <span className="chip" style={{ borderColor: roleColor(current) }}>{current.role ?? 'No role'}</span>
              <span className="chip">{lv}</span>
              <span className={'chip' + (d.wave === null ? ' wd-locked' : '')}>{d.wave === null ? '🔒 never opens' : d.wave === 0 ? 'Open from the start' : `Opens in wave ${d.wave}`}</span>
              {current.optional && <span className="chip">Optional</span>}
            </div>
          </div>
          <span className="spacer" />
          <div className="wd-cov" title="Share of Coverage columns filled">
            <strong style={{ color: ramp(d.coverage?.score ?? 0) }}>{Math.round((d.coverage?.score ?? 0) * 100)}%</strong>
            <span className="muted">covered</span>
          </div>
        </header>
        {current.atmosphere && <p className="wd-atmo">{String(current.atmosphere)}</p>}
        <div className="wd-tiles">
          <Tile label="enemies" value={c.enemies.length} warn={!c.enemies.length} />
          <Tile label="bosses" value={c.bosses.length} />
          <Tile label="outposts" value={c.outposts.length} />
          <Tile label="resources" value={Array.isArray(current.resources) ? current.resources.length : 0} warn={!current.resources?.length} />
          <Tile label="weather" value={c.weather.length} />
          <Tile label="median threat" value={fmt(t?.median)} warn={!!t?.flag} />
        </div>
        <div className="wd-grid">
          <section>
            <h4>How the player gets in</h4>
            {current.role === 'Starter' ? (
              <p className="muted">Starter biome: open from the beginning.</p>
            ) : d.gates.length ? (
              <ul className="wd-gates">{d.gates.map((l, i) => <GateLine key={i} l={l} project={project} other="from" />)}</ul>
            ) : (
              <p className="muted">{current.entryType && current.entryType !== 'None' ? `Entry type ${current.entryType}, but no quest, faction or boss is linked.` : 'No entry condition. Set one under Entry in the inspector.'}</p>
            )}
            <h4>What beating it opens</h4>
            {d.opens.length ? <ul className="wd-gates">{d.opens.map((l, i) => <GateLine key={i} l={l} project={project} other="to" />)}</ul> : <p className="muted">Nothing is gated on this biome.</p>}
            <h4>Borders</h4>
            <Chips items={d.neighbors.map((n) => ({ id: n.id, label: nameOf(n) }))} empty="No borders recorded." onPick={onSelect} />
          </section>
          <section>
            <h4>On the map</h4>
            <MiniMap project={project} biomeId={current.id} />
            {d.markers.length > 0 && <Chips items={d.markers.map((m) => ({ id: m.id, label: `${MARKER_GLYPH[m.kind] ?? '•'} ${m.label}`, title: m.kind }))} empty="" />}
            {!d.zone && <p className="muted">Not placed on the map yet.</p>}
          </section>
        </div>
        <div className="wd-grid">
          <section>
            <h4>Resources</h4>
            <Chips items={(current.resources ?? []).map((id: string) => ({ id, label: catalogLabel(project, 'resources', id) }))} empty="None listed." />
            <h4>Enemies and bosses</h4>
            <Chips items={[...c.enemies.map((e) => ({ id: e.id, label: nameOf(e) })), ...c.bosses.map((e) => ({ id: e.id, label: `👑 ${nameOf(e)}` }))]} empty="None from Combat." />
            <h4>Outposts</h4>
            <Chips items={c.outposts.map((o) => ({ id: o.id, label: `⚑ ${nameOf(o)}`, title: o.method }))} empty="None to capture." />
          </section>
          <section>
            <h4>Weather</h4>
            <Chips items={c.weather.map((w) => ({ id: w.id, label: `${nameOf(w)}${isNum(w.frequency) ? ` ${w.frequency}%` : ''}` }))} empty="No weather from Time & Weather." />
            <h4>Story</h4>
            <Chips items={[...c.acts.map((a) => ({ id: a.id, label: `Act: ${nameOf(a)}` })), ...c.quests.map((q) => ({ id: q.id, label: nameOf(q) }))]} empty="No acts or quests set here." />
            <h4>Hazards</h4>
            {current.hazards ? <p className="wd-text">{String(current.hazards)}</p> : <span className="muted wd-none">None described.</span>}
            {Array.isArray(current.pois) && current.pois.length > 0 && (
              <>
                <h4>Points of interest</h4>
                <Chips items={current.pois.map((p: string, i: number) => ({ id: String(i), label: p }))} empty="" />
              </>
            )}
          </section>
        </div>
        {missing.length > 0 && <p className="wd-missing">Still missing: {missing.join(', ')}.</p>}
      </article>
      </div>
    </div>
  )
}

// ---------- Atlas ----------

/** Static atlas for any project (the example picker draws it on a preview copy). */
export function AtlasPreview({ project }: { project: Project }) {
  const m = atlasModel(project)
  const path = unlockPath(project)
  const center = new Map(m.zones.filter((z) => z.biome).map((z) => [z.biome!.id, [z.item.x + z.item.w / 2, z.item.y + z.item.h / 2] as const]))
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="wa-map" role="img" aria-label="Atlas preview">
      {m.zones.map(({ item, biome }) => <rect key={item.id} x={item.x} y={item.y} width={item.w} height={item.h} rx={14} fill={biomeColor(biome)} opacity={0.6} />)}
      {path.links.filter((l) => l.from && l.from !== l.to).map((l, i) => {
        const p = center.get(l.from!)
        const q = center.get(l.to)
        return p && q ? <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={VIA_COLORS[l.via]} strokeWidth={4} /> : null
      })}
      {m.zones.map(({ item, biome }) => <text key={`t${item.id}`} x={item.x + 12} y={item.y + 26} className="wa-label">{biome ? `${nameOf(biome)} · ${biome.role ?? ''}` : item.label}</text>)}
    </svg>
  )
}

type ColorBy = 'biome' | 'role' | 'threat' | 'coverage'

export function WorldAtlasView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const [colorBy, setColorBy] = useState<ColorBy>('biome')
  const [layers, setLayers] = useState({ borders: true, unlocks: true, markers: true, labels: true })
  const [hover, setHover] = useState<string | null>(null)
  const m = atlasModel(project)
  const path = unlockPath(project)
  const touching = touchingWithoutBorder(project)
  /** Median enemy threat, or the strongest boss where a biome has no enemy stats. */
  const threat = new Map(biomeThreat(project).map((r) => [r.biome.id, r.median ?? r.boss]))
  const cov = new Map(biomeCoverage(project).map((r) => [r.biome.id, r.score]))
  const logT = [...threat.values()].filter((x): x is number => isNum(x) && x > 0).map(Math.log)
  const [lo, hi] = logT.length ? [Math.min(...logT), Math.max(...logT)] : [0, 1]
  const fill = (b: Entity | undefined) => {
    if (!b) return 'var(--panel2)'
    if (colorBy === 'role') return roleColor(b)
    if (colorBy === 'coverage') return ramp(cov.get(b.id) ?? 0)
    if (colorBy === 'threat') {
      const t = threat.get(b.id)
      return isNum(t) && t > 0 ? ramp(1 - (hi > lo ? (Math.log(t) - lo) / (hi - lo) : 0.5)) : '#555b68'
    }
    return biomeColor(b)
  }
  const center = new Map(m.zones.filter((z) => z.biome).map((z) => [z.biome!.id, [z.item.x + z.item.w / 2, z.item.y + z.item.h / 2] as const]))
  const active = hover ?? selected
  const toggle = (k: keyof typeof layers) => setLayers((s) => ({ ...s, [k]: !s[k] }))

  return (
    <div className="stack wa">
      <div className="toolbar wa-tools">
        <label>Colour by{' '}
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)} aria-label="Colour by">
            <option value="biome">Biome colour</option>
            <option value="role">Role tier</option>
            <option value="threat">Threat (Combat)</option>
            <option value="coverage">Coverage</option>
          </select>
        </label>
        {(['borders', 'unlocks', 'markers', 'labels'] as const).map((k) => (
          <label key={k} className="muted"><input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} /> {k[0].toUpperCase() + k.slice(1)}</label>
        ))}
        <span className="spacer" />
        {m.unplaced.length > 0 && <button onClick={() => mutate((p) => placeUnplaced(p, makeId))} title="Adds a zone for each biome without one, in role columns">Place {m.unplaced.length} unplaced</button>}
        {touching.length > 0 && <button onClick={() => mutate((p) => addBorders(p, touching))} title={touching.map(([a, b]) => `${nameOf(project.documents['design.world']?.data.biomes.find((x: Entity) => x.id === a))} – ${nameOf(project.documents['design.world']?.data.biomes.find((x: Entity) => x.id === b))}`).join('\n')}>Record {countOf(touching.length, 'touching border')}</button>}
        <Link to="/doc/design.world?s=map">Edit shapes in Map sketch</Link>
      </div>
      {!m.zones.length ? (
        <EmptyNote>No biome zones on the map yet. Use “Place unplaced” for a first layout, then drag the zones in Map sketch.</EmptyNote>
      ) : (
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="wa-map" role="img" aria-label="World atlas">
          <defs>
            <marker id="wa-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="wa-arrowhead" /></marker>
            <pattern id="wa-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="10" fill="rgba(0,0,0,.25)" /></pattern>
          </defs>
          {m.zones.map(({ item, biome }) => (
            <g key={item.id} className={'wa-zone' + (biome && biome.id === active ? ' active' : '')} onClick={() => biome && onSelect(biome.id)} onMouseEnter={() => biome && setHover(biome.id)} onMouseLeave={() => setHover(null)}>
              <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={14} fill={fill(biome)} />
              {biome && !path.wave.has(biome.id) && <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={14} fill="url(#wa-hatch)" pointerEvents="none" />}
              <title>{biome ? `${nameOf(biome)} (${biome.role ?? 'no role'})` : `${item.label} (not linked to a biome)`}</title>
            </g>
          ))}
          {layers.borders && m.borders.map(([a, b]) => {
            const p = center.get(a)
            const q = center.get(b)
            return p && q ? <line key={`${a}|${b}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} className="wa-border" /> : null
          })}
          {layers.unlocks && path.links.filter((l) => l.from && l.from !== l.to).map((l, i) => {
            const p = center.get(l.from!)
            const q = center.get(l.to)
            if (!p || !q) return null
            const dim = active && l.from !== active && l.to !== active
            const mx = (p[0] + q[0]) / 2 + (q[1] - p[1]) * 0.15
            const my = (p[1] + q[1]) / 2 - (q[0] - p[0]) * 0.15
            return (
              <path key={i} d={`M${p[0]},${p[1]} Q${mx},${my} ${q[0]},${q[1]}`} className={'wa-unlock' + (l.backward ? ' bad' : '')} stroke={VIA_COLORS[l.via]} opacity={dim ? 0.15 : 0.95} markerEnd="url(#wa-arrow)">
                <title>{`${VIA_LABEL[l.via]}: ${l.gate}`}</title>
              </path>
            )
          })}
          {layers.markers && m.markers.map(({ item }) => (
            <g key={item.id} className="wa-marker">
              <circle cx={item.x + item.w / 2} cy={item.y + item.h / 2} r={13} />
              <text x={item.x + item.w / 2} y={item.y + item.h / 2 + 1} textAnchor="middle" dominantBaseline="middle">{MARKER_GLYPH[item.kind] ?? '•'}</text>
              {layers.labels && <text x={item.x + item.w / 2} y={item.y + item.h / 2 + 26} textAnchor="middle" className="wa-marker-label">{item.label}</text>}
              <title>{`${item.kind}: ${item.label}`}</title>
            </g>
          ))}
          {layers.labels && m.zones.map(({ item, biome }) => (
            <text key={`l${item.id}`} x={item.x + 12} y={item.y + 24} className="wa-label" pointerEvents="none">{biome ? nameOf(biome) : `${item.label} ⚠`}</text>
          ))}
        </svg>
      )}
      <div className="legend">
        {colorBy === 'role' && ROLE_ORDER.map((r, i) => <span key={r} className="cv-legend" style={{ borderColor: ROLE_COLORS[i] }}>{r}</span>)}
        {colorBy === 'threat' && <span className="muted">Green = lowest median enemy threat (strongest boss where there are no enemies), red = highest, on a log scale. Grey = no combat stats.</span>}
        {colorBy === 'coverage' && <span className="muted">Red = little designed yet, green = every Coverage column filled.</span>}
        {layers.unlocks && (Object.keys(VIA_COLORS) as UnlockVia[]).map((k) => <span key={k} className="cv-legend" style={{ borderColor: VIA_COLORS[k] }}>→ {VIA_LABEL[k]}</span>)}
        {layers.borders && <span className="cv-legend wa-legend-border">Border</span>}
        {path.locked.length > 0 && <span className="cv-legend wa-legend-locked">Hatched: never opens</span>}
      </div>
      {m.unplaced.length > 0 && <p className="muted">Not on the map: {m.unplaced.map(nameOf).join(', ')}.</p>}
    </div>
  )
}

// ---------- Unlock path ----------

type Arrange = 'role' | 'wave'
const NODE_W = 160
const NODE_H = 50
const COL_W = 220
const ROW_H = 74

export function UnlockPathView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [arrange, setArrange] = useState<Arrange>('role')
  const [hover, setHover] = useState<string | null>(null)
  const path = unlockPath(project)
  const list = biomesInOrder(project).filter((b) => items.some((x) => x.id === b.id))
  if (!list.length) return null
  const maxWave = Math.max(0, ...path.wave.values())
  const columns: { title: string; biomes: Entity[] }[] =
    arrange === 'role'
      ? [...ROLE_ORDER, 'No role'].map((r, i) => ({ title: r, biomes: list.filter((b) => (roleIndex(b) ?? 5) === i) })).filter((c) => c.biomes.length)
      : [
          ...Array.from({ length: maxWave + 1 }, (_, w) => ({ title: w === 0 ? 'Open at start' : `Wave ${w}`, biomes: list.filter((b) => path.wave.get(b.id) === w) })),
          { title: '🔒 Never opens', biomes: list.filter((b) => !path.wave.has(b.id)) },
        ].filter((c) => c.biomes.length)
  const pos = new Map<string, { x: number; y: number }>()
  columns.forEach((c, ci) => c.biomes.forEach((b, ri) => pos.set(b.id, { x: 20 + ci * COL_W, y: 40 + ri * ROW_H })))
  const width = 20 + columns.length * COL_W
  const height = 50 + Math.max(...columns.map((c) => c.biomes.length)) * ROW_H
  const active = hover ?? selected
  const touches = (l: UnlockLink) => !active || l.from === active || l.to === active
  const drawn = path.links.filter((l) => l.from && l.from !== l.to && pos.has(l.from) && pos.has(l.to))
  const loose = (id: string) => path.links.filter((l) => l.to === id && !l.from)
  const problems = [
    ...path.links.filter((l) => l.inside).map((l) => `${nameOf(list.find((b) => b.id === l.to))}: “${l.gate}” is met inside the biome it opens.`),
    ...path.links.filter((l) => l.backward).map((l) => `${nameOf(list.find((b) => b.id === l.to))}: “${l.gate}” is met in ${nameOf(list.find((b) => b.id === l.from))}, a later-role biome.`),
    ...path.locked.map((b) => `${nameOf(b)} never opens: a gate it needs sits in a biome that is itself locked.`),
  ]

  return (
    <div className="stack up">
      <div className="toolbar">
        <span className="muted">Arrange by</span>
        <div className="tabs">
          <button className={arrange === 'role' ? 'active' : ''} onClick={() => setArrange('role')}>Role</button>
          <button className={arrange === 'wave' ? 'active' : ''} onClick={() => setArrange('wave')}>Unlock order</button>
        </div>
        <span className="muted">Worked out from each biome’s entry condition; hover a biome to trace its gates.</span>
      </div>
      <div className="up-scroll">
        <svg width={width} height={height} className="up-svg" role="img" aria-label="Unlock path">
          <defs>
            {(Object.keys(VIA_COLORS) as UnlockVia[]).map((k) => (
              <marker key={k} id={`up-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={VIA_COLORS[k]} /></marker>
            ))}
          </defs>
          {columns.map((c, ci) => (
            <g key={c.title}>
              <rect x={10 + ci * COL_W} y={8} width={COL_W - 20} height={height - 16} rx={8} className="up-col" />
              <text x={10 + ci * COL_W + (COL_W - 20) / 2} y={26} textAnchor="middle" className="up-col-title">{c.title}</text>
            </g>
          ))}
          {drawn.map((l, i) => {
            const a = pos.get(l.from!)!
            const b = pos.get(l.to)!
            const forward = b.x > a.x
            const x1 = forward ? a.x + NODE_W : a.x + NODE_W / 2
            const y1 = forward ? a.y + NODE_H / 2 : a.y + NODE_H
            const x2 = forward ? b.x : b.x + NODE_W / 2
            const y2 = forward ? b.y + NODE_H / 2 : b.y
            const d = forward ? `M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}` : `M${x1},${y1} C${x1 - 60},${y1 + 40} ${x2 - 60},${y2 - 40} ${x2},${y2}`
            const on = touches(l)
            return (
              <g key={i} opacity={on ? 1 : 0.12}>
                <path d={d} fill="none" stroke={VIA_COLORS[l.via]} strokeWidth={on && active ? 2.5 : 1.6} strokeDasharray={l.via === 'graph' ? '5 4' : l.backward ? '2 3' : undefined} markerEnd={`url(#up-arrow-${l.via})`} className={l.backward ? 'up-bad' : undefined} />
                {on && active && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="up-edge-label">{l.gate}</text>}
                <title>{`${VIA_LABEL[l.via]}: ${l.gate}${l.backward ? ' (met in a later-role biome)' : ''}`}</title>
              </g>
            )
          })}
          {list.map((b) => {
            const p = pos.get(b.id)!
            const locked = !path.wave.has(b.id)
            const bad = locked || path.links.some((l) => l.to === b.id && (l.inside || l.backward))
            const gates = loose(b.id)
            const dim = active && active !== b.id && !path.links.some((l) => (l.from === active && l.to === b.id) || (l.to === active && l.from === b.id))
            return (
              <g
                key={b.id}
                transform={`translate(${p.x},${p.y})`}
                className={'up-node' + (b.id === selected ? ' selected' : '') + (bad ? ' bad' : '')}
                opacity={dim ? 0.35 : 1}
                onClick={() => onSelect(b.id)}
                onMouseEnter={() => setHover(b.id)}
                onMouseLeave={() => setHover(null)}
                role="button"
                aria-label={`Biome ${nameOf(b)}`}
              >
                <rect width={NODE_W} height={NODE_H} rx={8} />
                <rect width={6} height={NODE_H} rx={3} fill={biomeColor(b)} />
                <text x={14} y={20} className="up-name">{nameOf(b).slice(0, 20)}</text>
                <text x={14} y={38} className="up-sub">
                  {locked ? '🔒 locked' : b.role === 'Starter' ? 'Start here' : gates.length ? gates.map((g) => `${g.via === 'faction' ? '⚑' : '?'} ${g.gate}`).join(', ').slice(0, 26) : path.wave.get(b.id) === 0 && b.role !== 'Starter' ? (b.entryType && b.entryType !== 'None' ? `${b.entryType} gate (notes only)` : 'no gate') : ''}
                </text>
                <title>{[nameOf(b), ...path.links.filter((l) => l.to === b.id).map((l) => `${VIA_LABEL[l.via]}: ${l.gate}`)].join('\n')}</title>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="legend">
        {(Object.keys(VIA_COLORS) as UnlockVia[]).map((k) => <span key={k} className="cv-legend" style={{ borderColor: VIA_COLORS[k] }}>{VIA_LABEL[k]}</span>)}
        <span className="muted">⚑ / ? on a node: a faction or quest gate that isn’t tied to a biome.</span>
      </div>
      {problems.length > 0 ? (
        <ul className="up-problems">{problems.map((p, i) => <li key={i} className="error-text">{p}</li>)}</ul>
      ) : (
        <p className="muted">Every biome can be reached in this order.</p>
      )}
    </div>
  )
}

// ---------- Threat ----------

export function BiomeThreatView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const [log, setLog] = useState(false)
  const rows = biomeThreat(project)
  if (!rows.length) return null
  const pos = (n: number | null) => (n === null ? null : log && n <= 0 ? null : Math.round(n))
  const chart = rows.map((r) => ({
    id: r.biome.id,
    name: nameOf(r.biome),
    stage: r.stage,
    median: pos(r.median),
    max: pos(r.max),
    boss: pos(r.boss),
    level: r.levelMin !== null ? [r.levelMin, Math.max(r.levelMax ?? r.levelMin, r.levelMin + 0.2)] : null,
  }))
  const hasThreat = rows.some((r) => r.median !== null || r.boss !== null)
  const hasLevels = rows.some((r) => r.levelMin !== null)
  return (
    <div className="stack npc-preview">
      <p className="muted">
        Threat = damage × attacks per second × HP, taken from Combat enemies set in each biome. Bars are the median enemy, the line is the strongest enemy and dots are the strongest boss.
        The level band (right axis) is the biome’s intended player level. A planning estimate, not a simulation.
      </p>
      <div className="toolbar">
        <label className="muted"><input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> Log scale</label>
      </div>
      {!hasThreat && !hasLevels ? (
        <EmptyNote>Give Combat enemies a biome, HP and damage, or give biomes a level range, to draw the curve.</EmptyNote>
      ) : (
        <div style={{ height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={chart} onClick={(e) => { const id = (e as { activePayload?: { payload: { id: string } }[] })?.activePayload?.[0]?.payload.id; if (id) onSelect(id) }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334" />
              <XAxis dataKey="name" />
              <YAxis yAxisId="t" scale={log ? 'log' : 'auto'} domain={log ? ['auto', 'auto'] : [0, 'auto']} allowDataOverflow />
              {hasLevels && <YAxis yAxisId="lv" orientation="right" allowDecimals={false} label={{ value: 'Level', angle: 90, position: 'insideRight', fill: '#8b93a5' }} />}
              <Tooltip formatter={(v, n) => [Array.isArray(v) ? `${v[0]}–${Math.round(Number(v[1]))}` : v, n]} />
              <Legend />
              {hasLevels && <Bar yAxisId="lv" dataKey="level" name="Level band" fill="rgba(91,156,255,.25)" stroke="#5b9cff" barSize={14} />}
              <Bar yAxisId="t" dataKey="median" name="Median enemy">
                {chart.map((d) => <Cell key={d.id} fill={ROLE_COLORS[d.stage ?? 5]} stroke={d.id === selected ? '#fff' : undefined} strokeWidth={d.id === selected ? 2 : 0} />)}
              </Bar>
              <Line yAxisId="t" dataKey="max" name="Strongest enemy" stroke="#e6e8ee" strokeDasharray="4 3" connectNulls dot={{ r: 3 }} />
              <Line yAxisId="t" dataKey="boss" name="Strongest boss" stroke="none" dot={{ r: 6, fill: '#e5707e' }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>Biome</th><th>Role</th><th>Levels</th><th>Enemies</th><th>Weakest</th><th>Median</th><th>Strongest</th><th>Boss</th><th>Flag</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.biome.id} className={r.biome.id === selected ? 'selected' : undefined} onClick={() => onSelect(r.biome.id)}>
                <td><i className="wd-swatch" style={{ background: biomeColor(r.biome) }} /> {nameOf(r.biome)}</td>
                <td>{r.biome.role ?? '—'}</td>
                <td className="num">{r.levelMin === null ? '–' : r.levelMax !== null && r.levelMax !== r.levelMin ? `${r.levelMin}–${r.levelMax}` : r.levelMin}</td>
                <td className="num">{r.enemies}</td>
                <td className="num">{fmt(r.min)}</td>
                <td className="num">{fmt(r.median)}</td>
                <td className="num">{fmt(r.max)}</td>
                <td className="num">{fmt(r.boss)}</td>
                <td className={r.flag ? 'err' : 'muted'}>{r.flag === 'dip' ? 'Dip: easier than an earlier stage' : r.flag === 'spike' ? 'Spike: much harder than the stage before' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------- Coverage ----------

const COLUMN_HELP: Record<string, string> = {
  resources: 'Resources listed on the biome',
  enemies: 'Combat enemies in this biome (either side of the link)',
  bosses: 'Combat bosses in this biome',
  outposts: 'Outposts whose Biome is this one, or listed as garrisons',
  pois: 'Points of interest',
  weather: 'Time & Weather weathers that list this biome',
  story: 'Story acts set here plus quests located here',
  hazards: 'Hazards described',
  entry: 'An entry condition (or Starter / optional)',
  levels: 'A player level range',
  zone: 'A linked zone on the map sketch',
}

export function BiomeCoverageView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const [gapsOnly, setGapsOnly] = useState(false)
  const all = biomeCoverage(project).filter((r) => items.some((x) => x.id === r.biome.id))
  const rows = gapsOnly ? all.filter((r) => r.score < 1) : all
  if (!all.length) return null
  const max = (k: string) => Math.max(1, ...all.map((r) => r.cells[k as keyof CoverageRow['cells']]))
  const total = all.length ? all.reduce((s, r) => s + r.score, 0) / all.length : 0
  return (
    <div className="stack npc-preview">
      <div className="toolbar">
        <span>World coverage <strong style={{ color: ramp(total) }}>{Math.round(total * 100)}%</strong></span>
        <label className="muted"><input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} /> Only biomes with gaps</label>
        <span className="muted">Darker = more content. Empty cells are gaps; click a row to fill it in.</span>
      </div>
      <div className="table-wrap">
        <table className="grid cov-table">
          <thead>
            <tr>
              <th>Biome</th>
              {COVERAGE_COLUMNS.map((c) => <th key={c.key} title={COLUMN_HELP[c.key]}>{c.label}</th>)}
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.biome.id} className={r.biome.id === selected ? 'selected' : undefined} onClick={() => onSelect(r.biome.id)}>
                <td><i className="wd-swatch" style={{ background: biomeColor(r.biome) }} /> {nameOf(r.biome)} <small className="muted">{r.biome.role}</small></td>
                {COVERAGE_COLUMNS.map((c) => {
                  const n = r.cells[c.key]
                  const yesNo = c.key === 'hazards' || c.key === 'entry' || c.key === 'levels' || c.key === 'zone'
                  return (
                    <td key={c.key} className={'cov-cell' + (n === 0 ? ' gap' : '')} style={n ? { background: `rgba(76,195,138,${0.18 + 0.5 * (yesNo ? 1 : n / max(c.key))})` } : undefined} title={`${COLUMN_HELP[c.key]}: ${n}`}>
                      {n === 0 ? '—' : yesNo ? '✓' : n}
                    </td>
                  )
                })}
                <td className="num"><span className="wd-score wide"><i style={{ width: `${r.score * 100}%`, background: ramp(r.score) }} /></span> {Math.round(r.score * 100)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="muted">Biomes covered</td>
              {COVERAGE_COLUMNS.map((c) => <td key={c.key} className="num muted">{all.filter((r) => r.cells[c.key] > 0).length}/{all.length}</td>)}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
