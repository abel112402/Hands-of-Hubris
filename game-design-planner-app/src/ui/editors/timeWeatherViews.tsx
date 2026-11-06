import { useState } from 'react'
import type { Entity, Project } from '../../core/model/types'
import { biomeWeather, conditions, dayCoverage, eventCalendar, realMinutes, seasonYear, timeList, yearLength } from '../../core/timeWeather'
import { useProject } from '../hooks'
import type { ViewProps } from './CollectionEditor'

const PALETTE = ['#4f9cf9', '#f2c94c', '#f97b4f', '#5ad1d1', '#d86be0', '#53c28b', '#e5707e']
const fmt = (n: number) => (Math.round(n * 100) / 100).toString()
const hh = (h: number) => {
  const m = Math.round(h * 60)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
const colorOf = (e: Entity, i: number) => (typeof e.color === 'string' && e.color ? e.color : PALETTE[i % PALETTE.length])

// ---------- Day clock ----------

const R_OUT = 130
const R_IN = 80
const C = 150

const pt = (h: number, r: number) => {
  const a = (h / 24) * 2 * Math.PI - Math.PI / 2
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

/** Ring segment from hour `from` to hour `to`, clockwise, wrapping across midnight. */
function ring(from: number, to: number, rOut = R_OUT, rIn = R_IN) {
  let span = (to - from + 24) % 24
  if (span === 0) span = 24
  if (span >= 24) span = 23.999
  const end = from + span
  const large = span > 12 ? 1 : 0
  const [x1, y1] = pt(from, rOut)
  const [x2, y2] = pt(end, rOut)
  const [x3, y3] = pt(end, rIn)
  const [x4, y4] = pt(from, rIn)
  return `M${x1},${y1} A${rOut},${rOut} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${rIn},${rIn} 0 ${large} 0 ${x4},${y4} Z`
}

/** The dial itself, for any project (the example picker draws it on a preview copy). */
export function ClockDial({ project, selected, onSelect }: { project: Project; selected?: string; onSelect?: (id: string) => void }) {
  const cov = dayCoverage(project)
  const day = realMinutes(project, 24)
  return (
      <div className="clock-wrap">
        <svg viewBox="0 0 300 300" className="day-clock" role="img" aria-label="Day clock">
          <defs>
            <pattern id="clock-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="3" height="6" className="clock-hatch" />
            </pattern>
          </defs>
          <circle cx={C} cy={C} r={(R_OUT + R_IN) / 2} className="clock-track" strokeWidth={R_OUT - R_IN} fill="none" />
          {cov.arcs.map((a, i) => (
            <path key={a.phase.id} d={ring(a.from, a.to)} fill={colorOf(a.phase, i)} className={'clock-arc' + (a.phase.id === selected ? ' selected' : '')} onClick={() => onSelect?.(a.phase.id)}>
              <title>{`${a.phase.name}: ${hh(a.from)}–${hh(a.to)}`}</title>
            </path>
          ))}
          {cov.gaps.map(([f, t], i) => <path key={`g${i}`} d={ring(f, t)} fill="url(#clock-hatch)" data-testid="clock-gap"><title>{`No phase ${hh(f)}–${hh(t)}`}</title></path>)}
          {cov.overlaps.map(([f, t], i) => <path key={`o${i}`} d={ring(f, t, R_IN - 2, R_IN - 12)} className="clock-overlap"><title>{`Overlap ${hh(f)}–${hh(t)}`}</title></path>)}
          {[0, 6, 12, 18].map((h) => {
            const [x, y] = pt(h, R_OUT + 12)
            return <text key={h} x={x} y={y + 4} textAnchor="middle" className="clock-tick">{String(h).padStart(2, '0')}</text>
          })}
          {cov.arcs.map((a) => {
            const span = (a.to - a.from + 24) % 24 || 24
            const [x, y] = pt(a.from + span / 2, (R_OUT + R_IN) / 2)
            return span >= 2 ? <text key={`l${a.phase.id}`} x={x} y={y + 4} textAnchor="middle" className="clock-label">{String(a.phase.name ?? '').slice(0, 10)}</text> : null
          })}
          <text x={C} y={C - 4} textAnchor="middle" className="clock-center">{day ? `${fmt(day)} min` : '—'}</text>
          <text x={C} y={C + 14} textAnchor="middle" className="clock-tick">{day ? 'per in-game day' : 'set day length'}</text>
        </svg>
      </div>
  )
}

/** 24-hour dial: phases as arcs (midnight at the top), gaps hatched, overlaps marked, real minutes per phase. */
export function DayClockView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const cov = dayCoverage(project)
  return (
    <div className="stack npc-preview">
      <ClockDial project={project} selected={selected} onSelect={onSelect} />
      {(cov.gaps.length > 0 || cov.overlaps.length > 0) && (
        <p className="error-text">
          {cov.gaps.map(([f, t]) => `no phase ${hh(f)}–${hh(t)}`).concat(cov.overlaps.map(([f, t]) => `overlap ${hh(f)}–${hh(t)}`)).join(' · ')}
        </p>
      )}
      <table className="grid">
        <thead>
          <tr><th>Phase</th><th>From – to</th><th>Real minutes</th><th>Visibility</th><th>Monster strength</th></tr>
        </thead>
        <tbody>
          {cov.arcs.map((a) => {
            const span = (a.to - a.from + 24) % 24 || 24
            const real = realMinutes(project, span)
            return (
              <tr key={a.phase.id} className={a.phase.id === selected ? 'selected' : ''} onClick={() => onSelect(a.phase.id)}>
                <td>{a.phase.name}</td>
                <td>{hh(a.from)} – {hh(a.to)}</td>
                <td className="num">{real === null ? '–' : fmt(real)}</td>
                <td className="num">{a.phase.visibility ?? '–'}{typeof a.phase.visibility === 'number' ? '%' : ''}</td>
                <td className="num">{typeof a.phase.monsterStrength === 'number' ? `×${a.phase.monsterStrength}` : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {cov.unset.length > 0 && <p className="muted">Not on the clock (no start or duration): {cov.unset.map((p) => p.name).join(', ')}</p>}
    </div>
  )
}

// ---------- Weather by biome ----------

/** One bar per biome: its weather mix and the clear remainder; biomes over 100 % are flagged. */
export function BiomeWeatherView({ items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const rows = biomeWeather(project)
  const colors = new Map(items.map((w, i) => [w.id, colorOf(w, i)]))
  if (!rows.length) return <p className="empty">Add biomes in World & Biomes to see their weather.</p>
  return (
    <div className="stack npc-preview">
      <p className="muted">Share of time per weather in each biome; the grey rest is clear weather.</p>
      {rows.map((r) => {
        const scale = r.total > 100 ? 100 / r.total : 1
        return (
          <div key={r.biome.id} className="phase-row">
            <span>{r.biome.name}</span>
            <div className="phase-track">
              {(() => {
                let at = 0
                return r.weathers.map((w) => {
                  const width = w.frequency * scale
                  const el = (
                    <button
                      key={w.weather.id}
                      className={'phase-seg' + (w.weather.id === selected ? ' selected' : '')}
                      style={{ left: `${at}%`, width: `${width}%`, background: colors.get(w.weather.id) }}
                      title={`${w.weather.name}: ${w.frequency}%`}
                      onClick={() => onSelect(w.weather.id)}
                    >
                      {width > 8 ? w.weather.name : ''}
                    </button>
                  )
                  at += width
                  return el
                })
              })()}
            </div>
            <span className={r.over ? 'pill warning' : 'muted'}>{r.over ? `${fmt(r.total)}% – over 100` : `${fmt(r.clear)}% clear`}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Year strip ----------

/** A year (or several) with season bands and event occurrences; overlapping events are outlined. */
export function YearStripView({ selected, onSelect }: ViewProps) {
  const project = useProject()
  const [years, setYears] = useState(1)
  const year = yearLength(project)
  const total = year * years
  const seasons = seasonYear(project)
  const cal = eventCalendar(project, years)
  const events = timeList(project, 'events')
  const coinciding = new Set(cal.coincidences.flatMap((c) => [`${c.a.event.id}@${c.a.day}`, `${c.b.event.id}@${c.b.day}`]))
  const pos = (d: number) => `${(Math.min(d, total) / total) * 100}%`
  return (
    <div className="stack npc-preview">
      <div className="row">
        <span className="muted">Years</span>
        <select aria-label="Years" value={years} onChange={(e) => setYears(Number(e.target.value))}>
          {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="muted">{year} days per year{seasons.total && seasons.total !== year ? ` · seasons add up to ${seasons.total}` : ''}</span>
      </div>
      <div className="year-strip">
        <div className="year-seasons">
          {Array.from({ length: years }).flatMap((_, y) =>
            seasons.ranges.map((r, i) => (
              <div key={`${y}-${r.season.id}`} className="year-season" style={{ left: pos(y * year + r.from), width: `${(r.season.days / total) * 100}%`, background: colorOf(r.season, i) }} title={`${r.season.name}: day ${r.from}–${r.to}`}>
                {r.season.days / total > 0.08 ? r.season.name : ''}
              </div>
            )),
          )}
        </div>
        {events.map((e, i) => (
          <div key={e.id} className="year-lane">
            <button className={'link-btn' + (e.id === selected ? ' on' : '')} onClick={() => onSelect(e.id)}>{e.name}</button>
            <div className="year-track">
              {cal.occurrences.filter((o) => o.event.id === e.id).map((o) => (
                <span
                  key={o.day}
                  className={'year-mark' + (o.example ? ' example' : '') + (coinciding.has(`${e.id}@${o.day}`) ? ' coincide' : '')}
                  style={{ left: pos(o.day), width: `max(3px, ${((o.until - o.day) / total) * 100}%)`, background: colorOf(e, i) }}
                  title={`${e.name}: day ${fmt(o.day)}${o.example ? ' (example of a random event)' : ''}`}
                  data-testid={coinciding.has(`${e.id}@${o.day}`) ? 'coincide' : undefined}
                />
              ))}
            </div>
            <span className="muted">
              {cal.expected.get(e.id) === null ? 'not scheduled' : `${fmt(cal.expected.get(e.id) ?? 0)}×${e.schedule === 'Random chance' ? ' expected' : ''}`}
            </span>
          </div>
        ))}
      </div>
      {cal.coincidences.length > 0 && (
        <p className="muted">
          Coinciding: {cal.coincidences.slice(0, 5).map((c) => `day ${fmt(c.day)} ${c.a.event.name} + ${c.b.event.name}`).join(' · ')}
          {cal.coincidences.length > 5 ? ` +${cal.coincidences.length - 5}` : ''}
        </p>
      )}
    </div>
  )
}

// ---------- Conditions simulator ----------

/** Interactive: pick a phase, weather, event and season and see the combined effect and the Combat variants that appear. */
export function ConditionsView() {
  const project = useProject()
  const [sel, setSel] = useState<{ phase?: string; weather?: string; event?: string; season?: string }>({})
  const res = conditions(project, sel)
  const picker = (key: keyof typeof sel, section: string, title: string) => (
    <label className="row">
      <span className="muted">{title}</span>
      <select aria-label={title} value={sel[key] ?? ''} onChange={(e) => setSel({ ...sel, [key]: e.target.value || undefined })}>
        <option value="">—</option>
        {timeList(project, section).map((x) => <option key={x.id} value={x.id}>{x.name || '(unnamed)'}</option>)}
      </select>
    </label>
  )
  return (
    <div className="stack npc-preview">
      <div className="row">
        {picker('phase', 'dayPhases', 'Time of day')}
        {picker('weather', 'weather', 'Weather')}
        {picker('event', 'events', 'Event')}
        {picker('season', 'seasons', 'Season')}
      </div>
      <p className="muted">Visibility takes the lowest value; every multiplier multiplies. Each factor lists where it comes from.</p>
      <table className="grid">
        <thead>
          <tr><th>Effect</th><th>Combined</th><th>From</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Visibility</td>
            <td className="num" data-testid="cond-visibility">{fmt(res.visibility)}%</td>
            <td className="muted">{res.visibilitySource ?? 'default'}</td>
          </tr>
          {res.factors.map((f) => (
            <tr key={f.key} className={f.sources.length ? '' : 'muted'}>
              <td>{f.label}</td>
              <td className={'num' + (f.value > 1 ? ' short' : '')} data-testid={`cond-${f.key}`}>×{fmt(f.value)}</td>
              <td className="muted">{f.sources.map((s) => `${s.name} ×${fmt(s.value)}`).join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Combat variants appearing:</strong>{' '}
        {res.variants.length ? res.variants.map((v) => v.name || '(unnamed)').join(', ') : <span className="muted">none linked to these conditions</span>}
      </p>
    </div>
  )
}
