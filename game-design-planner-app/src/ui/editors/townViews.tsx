import { useMemo } from 'react'
import type { Entity } from '../../core/model/types'
import { estimateTown, resourceLabels, TOWN_DOC } from '../../core/town'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const qty = (n: number) => (Math.round(n * 100) / 100).toString()
const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const map = (value: unknown): Record<string, number> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, number>) : {}

type BuildingLink = { id: string; name: string; rate: number }

export function TownResourceFlowView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const labels = resourceLabels(project)
  const estimate = useMemo(() => estimateTown(project), [project])
  const lanes = useMemo(() => {
    const byId = new Map(estimate.resources.map((r) => [r.id, r]))
    const resources = new Set(byId.keys())
    const buildings = items as Entity[]
    for (const building of buildings) {
      Object.keys(map(building.inputs)).forEach((id) => resources.add(id))
      Object.keys(map(building.outputs)).forEach((id) => resources.add(id))
      Object.keys(map(building.wasteOutputs)).forEach((id) => resources.add(id))
    }
    return [...resources]
      .map((id) => {
        const producers: BuildingLink[] = []
        const consumers: BuildingLink[] = []
        for (const building of buildings) {
          const copies = Math.max(0, number(building.count, 1))
          const cycleValue = number(building.cycle, 1)
          const cycle = cycleValue > 0 ? cycleValue : 1
          const output = number(map(building.outputs)[id]) + number(map(building.wasteOutputs)[id])
          const input = number(map(building.inputs)[id])
          if (output > 0) producers.push({ id: building.id, name: String(building.name ?? building.id), rate: output * copies / cycle })
          if (input > 0) consumers.push({ id: building.id, name: String(building.name ?? building.id), rate: input * copies / cycle })
        }
        return { id, label: labels[id] ?? byId.get(id)?.label ?? id, producers, consumers, estimate: byId.get(id) }
      })
      .filter((lane) => lane.producers.length || lane.consumers.length)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [estimate.resources, items, labels])

  if (!lanes.length) return <p className="empty">Add building inputs or outputs to draw resource supply and demand.</p>

  return (
    <div className="town-flow">
      <p className="muted">Each lane compares production and consumption per {estimate.timeUnit}. Select a building to edit its rates. This is a planning estimate, not a gameplay simulation.</p>
      <div className="town-flow-head" aria-hidden="true">
        <span>Producers</span><span>Resource · balance</span><span>Consumers</span>
      </div>
      {lanes.map((lane) => {
        const produced = lane.producers.reduce((sum, producer) => sum + producer.rate, 0)
        const consumed = lane.consumers.reduce((sum, consumer) => sum + consumer.rate, 0)
        const scale = Math.max(1, produced, consumed)
        const net = produced - consumed
        return (
          <div className="town-flow-lane" key={lane.id} data-testid={`town-resource-${lane.id}`}>
            <div className="town-flow-buildings">
              {lane.producers.length ? lane.producers.map((building) => (
                <button key={building.id} className={'town-flow-building' + (building.id === selected ? ' selected' : '')} onClick={() => onSelect(building.id)}>
                  {building.name}<span>{qty(building.rate)}/{estimate.timeUnit}</span>
                </button>
              )) : <span className="muted">No producer</span>}
            </div>
            <div className="town-flow-resource">
              <strong>{lane.label}</strong>
              <div className="town-flow-bars" aria-label={`${lane.label}: ${qty(produced)} produced, ${qty(consumed)} consumed per ${estimate.timeUnit}`}>
                <span className="town-flow-produced" style={{ width: `${Math.min(100, produced / scale * 100)}%` }} />
                <span className="town-flow-consumed" style={{ width: `${Math.min(100, consumed / scale * 100)}%` }} />
              </div>
              <small className={net < 0 ? 'warn' : 'ok'}>+{qty(produced)} / −{qty(consumed)} · net {net > 0 ? '+' : ''}{qty(net)}</small>
            </div>
            <div className="town-flow-buildings">
              {lane.consumers.length ? lane.consumers.map((building) => (
                <button key={building.id} className={'town-flow-building' + (building.id === selected ? ' selected' : '')} onClick={() => onSelect(building.id)}>
                  {building.name}<span>{qty(building.rate)}/{estimate.timeUnit}</span>
                </button>
              )) : <span className="muted">No consumer</span>}
            </div>
          </div>
        )
      })}
      <div className="town-flow-legend"><span><i className="produced" />Production</span><span><i className="consumed" />Consumption</span></div>
    </div>
  )
}

type Point = { x: number; y: number }

export function TownNetworkView({ sec, items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const data = project.documents[TOWN_DOC]?.data ?? {}
  const bases = (Array.isArray(data.bases) ? data.bases : []) as Entity[]
  const routes = (Array.isArray(data.routes) ? data.routes : []) as Entity[]
  const labels = resourceLabels(project)
  const estimate = useMemo(() => estimateTown(project), [project])
  const points = new Map<string, Point>()
  const columns = Math.max(1, Math.min(4, bases.length))
  bases.forEach((base, i) => points.set(base.id, { x: 90 + (i % columns) * 210, y: 58 + Math.floor(i / columns) * 140 }))
  const width = Math.max(420, columns * 210 + 60)
  const height = Math.max(150, Math.ceil(bases.length / columns) * 140 + 30)
  const routeLoads = new Map(estimate.routes.map((route) => [route.id, route]))
  const visibleRouteIds = new Set(items.map((item) => item.id))
  const interactiveBases = new Set(items.map((item) => item.id))
  const shownRoutes = sec.id === 'routes'
    ? routes.filter((route) => visibleRouteIds.has(route.id))
    : routes
  const hasUnmappedRoutes = shownRoutes.some((route) => !points.has(String(route.fromBase ?? '')) || !points.has(String(route.toBase ?? '')))

  if (!bases.length && !routes.length) return <p className="empty">Add bases and routes to see the logistics network.</p>

  return (
    <div className="town-network">
      <p className="muted">Lines show planned shipments between bases. Capacity compares requested cargo with trips per {estimate.timeUnit}; it is a planning estimate, not a travel simulation.</p>
      {bases.length > 0 && (
        <div className="town-network-canvas">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Town bases and logistics routes">
            <defs>
              <marker id="town-route-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L7,3 z" className="town-route-arrow" />
              </marker>
            </defs>
            {shownRoutes.map((route, i) => {
              const from = points.get(String(route.fromBase ?? ''))
              const to = points.get(String(route.toBase ?? ''))
              if (!from || !to) return null
              const load = routeLoads.get(route.id)
              const curve = ((i % 3) - 1) * 18
              const mx = (from.x + to.x) / 2
              const my = (from.y + to.y) / 2 + curve
              const path = from.x === to.x && from.y === to.y
                ? `M ${from.x + 30} ${from.y - 20} C ${from.x + 115} ${from.y - 95} ${from.x + 115} ${from.y + 95} ${from.x + 45} ${from.y + 28}`
                : `M ${from.x + 62} ${from.y + 26} Q ${mx} ${my} ${to.x + 4} ${to.y + 26}`
              return (
                <g key={route.id} className={load?.overloaded ? 'town-route overloaded' : 'town-route'}>
                  <path d={path} markerEnd="url(#town-route-arrow)" />
                  <text x={mx} y={my - 5} textAnchor="middle">{String(route.name ?? route.id)}</text>
                </g>
              )
            })}
            {bases.map((base) => {
              const point = points.get(base.id)!
              return (
                <g
                  key={base.id}
                  transform={`translate(${point.x},${point.y})`}
                  className={'town-base-node' + (base.id === selected ? ' selected' : '') + (interactiveBases.has(base.id) ? ' clickable' : '')}
                  onClick={() => interactiveBases.has(base.id) && onSelect(base.id)}
                  role={interactiveBases.has(base.id) ? 'button' : undefined}
                  tabIndex={interactiveBases.has(base.id) ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (interactiveBases.has(base.id) && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault()
                      onSelect(base.id)
                    }
                  }}
                  aria-label={String(base.name ?? base.id)}
                >
                  <rect width="126" height="52" rx="8" />
                  <text x="63" y="23" textAnchor="middle">{String(base.name ?? base.id)}</text>
                  <text x="63" y="40" textAnchor="middle" className="town-base-type">{String(base.type ?? 'Base')}</text>
                </g>
              )
            })}
          </svg>
        </div>
      )}
      <div className="town-network-routes">
        {shownRoutes.map((route) => {
          const from = bases.find((base) => base.id === route.fromBase)
          const to = bases.find((base) => base.id === route.toBase)
          const load = routeLoads.get(route.id)
          const cargo = (Array.isArray(route.cargo) ? route.cargo : []).map((id) => labels[id] ?? id).join(', ')
          const routeCard = (
            <>
              <strong>{String(route.name ?? route.id)}</strong>
              <span>{from?.name ?? 'Missing base'} → {to?.name ?? 'Missing base'}</span>
              <small>{cargo || 'No cargo'} · {qty(load?.demand ?? 0)} requested / {qty(load?.throughput ?? 0)} capacity per {estimate.timeUnit}</small>
            </>
          )
          return sec.id === 'routes'
            ? <button key={route.id} className={'town-network-route' + (route.id === selected ? ' selected' : '') + (load?.overloaded ? ' overloaded' : '')} onClick={() => onSelect(route.id)}>{routeCard}</button>
            : <div key={route.id} className={'town-network-route' + (load?.overloaded ? ' overloaded' : '')}>{routeCard}</div>
        })}
      </div>
      {hasUnmappedRoutes && <p className="warn">Some routes have missing or unresolved endpoints; select them below to repair their base references.</p>}
    </div>
  )
}
