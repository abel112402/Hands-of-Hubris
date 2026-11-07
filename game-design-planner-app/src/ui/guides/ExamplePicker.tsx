import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import type { Entity, Project } from '../../core/model/types'
import { VISION_DOC } from '../../core/vision'
import { ROADMAP_DOC, roadmapList } from '../../core/roadmap'
import { formatMinutes, loopGraph, loopList, loopPacing } from '../../core/coreLoop'
import { comparedLevels, depletion, levelTable, playerList, treeAnalysis } from '../../core/player'
import { useStore } from '../../core/store/store'
import { itemList, lootOdds, multiplier, rawCost } from '../../core/items'
import { combatList, damageFormula, damagePerHit, phaseCoverage, threat } from '../../core/combat'
import { biomeWeather, dayCoverage, eventCalendar, seasonYear, timeList } from '../../core/timeWeather'
import { ClockDial } from '../editors/timeWeatherViews'
import { moneyFlow, priceOf, reputationLevels, tradeList, wanderingOdds } from '../../core/trade'
import { actPacing, endingReachability, storyList } from '../../core/story'
import { QuestFlowCanvas } from '../editors/storyViews'
import { controlConflicts, flowAnalysis, layoutIssues, layoutOf, layoutSvg, screensOf, uiList } from '../../core/ui'
import { TreeCanvas } from '../editors/playerViews'
import { questionList } from '../../core/openQuestions'
import { useProject } from '../hooks'
import { useGuideUi } from './guideStore'

const fmt = (n: number) => (Math.round(n * 10) / 10).toString()

/** The project as it would be after the example, without touching the real one. */
export function previewProject(project: Project, ex: GuideExample, param?: string): Project {
  const copy: Project = JSON.parse(JSON.stringify(project))
  ex.apply(copy, param)
  return copy
}

export function applyExample(ex: GuideExample, param?: string) {
  useStore.getState().mutate((p) => ex.apply(p, param))
}

function Preview({ project, ex, param }: { project: Project; ex: GuideExample; param?: string }) {
  const real = useProject()
  if (ex.preview === 'wireframe') {
    // The screens the example changes: their layout differs from the real project's.
    const before = new Map(screensOf(real).map((s) => [s.id, JSON.stringify(s.layout ?? null)]))
    const changed = screensOf(project).filter((s) => layoutOf(s).length && before.get(s.id) !== JSON.stringify(s.layout ?? null))
    const shown = changed.length ? changed : screensOf(project).filter((s) => layoutOf(s).length).slice(0, 1)
    return shown.length ? (
      <div className="stack">
        {shown.slice(0, 2).map((s) => (
          <figure key={s.id} className="wf-preview">
            <img alt={`Wireframe of ${s.name}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(layoutSvg(project, s))}`} />
            <figcaption className="muted">{s.name} · {layoutOf(s).length} elements{layoutIssues(project, s).filter((i) => i.level !== 'info').length ? ` · ${layoutIssues(project, s).filter((i) => i.level !== 'info').length} issue(s)` : ''}</figcaption>
          </figure>
        ))}
      </div>
    ) : (
      <p className="muted">These rules apply to every wireframe; nothing to draw yet.</p>
    )
  }
  if (ex.preview === 'screenMap') {
    const f = flowAnalysis(project)
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Screen</th><th>Clicks from {f.entry?.name ?? 'entry'}</th><th>Way back</th></tr>
        </thead>
        <tbody>
          {screensOf(project).filter((s) => layoutOf(s).length).map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td className="num">{f.depth.get(s.id) ?? 'unreachable'}</td>
              <td>{f.deadEnds.some((d) => d.id === s.id) ? 'none' : s.id === f.entry?.id ? '—' : 'yes'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'bindings') {
    const c = controlConflicts(project)
    return (
      <div>
        <table className="grid npc-preview">
          <thead>
            <tr><th>Action</th><th>Keyboard</th><th>Mouse</th><th>Gamepad</th></tr>
          </thead>
          <tbody>
            {uiList(project, 'controls').slice(0, 14).map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.key}</td><td>{a.mouse}</td><td>{a.gamepad}</td></tr>)}
          </tbody>
        </table>
        <p className="muted">{c.length ? `Conflicts: ${c.map((x) => `${x.value}: ${x.a.name} + ${x.b.name}`).join('; ')}` : 'No conflicts.'}</p>
      </div>
    )
  }
  if (ex.preview === 'xpCurve') {
    const t = levelTable(project)
    return (
      <div>
        <div style={{ height: 170 }}>
          <ResponsiveContainer>
            <LineChart data={t.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334" />
              <XAxis dataKey="level" />
              <YAxis />
              <Tooltip />
              <Line dataKey="total" name="Total XP" stroke="#f2c94c" dot={false} />
              <Line dataKey="next" name="XP to level" stroke="#4f9cf9" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="muted">
          {[5, 10, t.cap].filter((l, i, a) => l <= t.cap && a.indexOf(l) === i).map((l) => {
            const r = t.rows.find((x) => x.level === l)
            return r ? `level ${l}: ${fmt(r.total)} XP${r.hours !== null ? ` (~${fmt(r.hours)} h)` : ''}` : ''
          }).join(' · ')}
        </p>
      </div>
    )
  }
  if (ex.preview === 'skillTree') {
    const castId = param ?? project.registry.catalogs.casts?.items[0]?.id
    const tree = treeAnalysis(project).casts.find((c) => c.cast.id === castId)
    const skills = playerList(project, 'skills').filter((s) => s.cast === castId)
    return tree ? (
      <div>
        <TreeCanvas skills={skills} lanes={[{ id: tree.cast.id, label: tree.cast.label, budget: tree.budget }]} onClick={() => {}} />
        <p className="muted">Tree cost {fmt(tree.totalCost)} vs. {fmt(tree.budget)} points at the level cap.</p>
      </div>
    ) : (
      <p className="empty">Add casts in Definitions first.</p>
    )
  }
  if (ex.preview === 'multiplier') {
    const rarities = project.registry.catalogs.rarities?.items ?? []
    const qualities = project.registry.catalogs.qualities?.items ?? []
    const sample = itemList(project, 'items').find((i) => typeof i.value === 'number')
    return (
      <div>
        <table className="grid npc-preview">
          <thead>
            <tr>
              <th>×</th>
              {qualities.map((q) => <th key={q.id}>{q.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rarities.map((r) => (
              <tr key={r.id}>
                <th>{r.label}</th>
                {qualities.map((q) => <td key={q.id} className="num">{fmt(multiplier(project, r.id, q.id))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {sample && rarities.length > 0 && (
          <p className="muted">
            {sample.name} (base {sample.value}): {rarities.map((r) => `${r.label} ${fmt(sample.value * multiplier(project, r.id, sample.quality ?? qualities[0]?.id))}`).join(' · ')}
          </p>
        )}
      </div>
    )
  }
  if (ex.preview === 'damageFormula') {
    const armors = [0, 50, 100, 200]
    return (
      <div>
        <p className="muted"><code>{damageFormula(project)}</code></p>
        <table className="grid npc-preview">
          <thead>
            <tr><th>A 20-damage hit against armor</th>{armors.map((a) => <th key={a}>{a}</th>)}</tr>
          </thead>
          <tbody>
            {[0, 25, -25].map((res) => (
              <tr key={res}>
                <td>{res === 0 ? 'no resistance' : res > 0 ? `${res}% resistance` : `${-res}% weakness`}</td>
                {armors.map((a) => {
                  const d = damagePerHit(project, 20, { armor: a, resistances: { x: res }, weaknesses: [] }, 'x')
                  return <td key={a} className="num">{d === null ? '⚠' : fmt(d)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (ex.preview === 'enemyRoster') {
    const rows = combatList(project, 'enemies').slice(-4)
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Enemy</th><th>Role</th><th>HP</th><th>Damage</th><th>Per s</th><th>Armor</th><th>Threat</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td><td>{e.role}</td>
              <td className="num">{e.hp}</td><td className="num">{e.damage}</td><td className="num">{e.attackRate}</td><td className="num">{e.armor}</td>
              <td className="num">{fmt(threat(e) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'bossPhases') {
    const bossId = param ?? combatList(project, 'bosses')[0]?.id
    if (!bossId) return <p className="empty">Add a boss first.</p>
    const cov = phaseCoverage(project, bossId)
    return (
      <div className="phase-track" style={{ height: 32 }}>
        {cov.phases.map((ph, i) => (
          <div key={ph.id} className="phase-seg" style={{ left: `${100 - ph.hpFrom}%`, width: `${ph.hpFrom - ph.hpTo}%`, background: ['#53c28b', '#4f9cf9', '#f2c94c', '#f97b4f', '#e5707e'][i % 5] }} title={ph.mechanics}>
            {ph.name}
          </div>
        ))}
        {cov.gaps.map(([a, z], i) => <div key={`g${i}`} className="phase-gap" style={{ left: `${100 - a}%`, width: `${a - z}%` }} />)}
      </div>
    )
  }
  if (ex.preview === 'statusSet') {
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Effect</th><th>Per tick</th><th>Every (s)</th><th>Duration (s)</th><th>Stacks</th><th>Total damage</th></tr>
        </thead>
        <tbody>
          {combatList(project, 'statusEffects').map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td className="num">{s.tickDamage ?? '–'}</td><td className="num">{s.tickInterval ?? '–'}</td><td className="num">{s.duration ?? '–'}</td><td className="num">{s.maxStacks ?? '–'}</td>
              <td className="num">{s.tickDamage && s.tickInterval && s.duration ? fmt((s.tickDamage * s.duration) / s.tickInterval) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'loadouts') {
    const items = itemList(project, 'items')
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Loadout</th><th>Level</th><th>Weapon</th><th>Abilities</th></tr>
        </thead>
        <tbody>
          {combatList(project, 'loadouts').map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td><td className="num">{l.level}</td>
              <td>{items.find((i) => i.id === l.weapon)?.name ?? '— none: add a weapon item with damage —'}</td>
              <td className="num">{(l.abilities ?? []).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'actTimeline') {
    const rows = actPacing(project)
    const total = Math.max(1, ...rows.map((r) => (r.act.start ?? 0) + (r.act.duration ?? 0)))
    return (
      <div className="stack">
        {rows.map((r) => (
          <div key={r.act.id} className="act-bar-row">
            <span className="muted">{r.act.name}</span>
            <div className="act-bar-track">
              <div className="act-bar" style={{ marginLeft: `${(100 * (r.act.start ?? 0)) / total}%`, width: `${(100 * (r.act.duration ?? 0)) / total}%` }}>
                {r.act.duration} d · lv {r.act.levelMin}–{r.act.levelMax}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (ex.preview === 'questions') {
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Question</th><th>Area</th><th>Options</th></tr>
        </thead>
        <tbody>
          {questionList(project).map((q) => <tr key={q.id}><td>{q.name}</td><td>{q.area}</td><td className="muted">{q.options}</td></tr>)}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'visionList') {
    const d = project.documents[VISION_DOC]?.data[ex.section]
    const rows: Entity[] = Array.isArray(d) ? d : []
    const detail = (e: Entity) => String(e.bucket ?? e.decisionTest ?? e.playerBenefit ?? '')
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Name</th><th>{ex.section === 'scope' ? 'Bucket' : ex.section === 'pillars' ? 'Decision test' : 'Player benefit'}</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => <tr key={e.id}><td>{e.name}</td><td className="muted">{detail(e)}</td></tr>)}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'coreLoopList') {
    if (ex.section === 'loopGraph') {
      const g = loopGraph(project)
      const label = (id: string) => g.nodes.find((n) => n.id === id)?.label ?? id
      return (
        <table className="grid npc-preview">
          <thead>
            <tr><th>From</th><th>Edge</th><th>To</th></tr>
          </thead>
          <tbody>
            {g.edges.map((e) => <tr key={e.id}><td>{label(e.source)}</td><td className="muted">{e.kind ?? e.label}</td><td>{label(e.target)}</td></tr>)}
          </tbody>
        </table>
      )
    }
    const byId = new Map(loopList(project).map((l) => [l.id, l]))
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Loop</th><th>Scale</th><th>One cycle</th><th>Builds toward</th></tr>
        </thead>
        <tbody>
          {loopPacing(project).map((r) => (
            <tr key={r.loop.id}>
              <td>{r.loop.name}</td>
              <td className="muted">{r.loop.scale}</td>
              <td className="num">{r.minutes !== undefined ? formatMinutes(r.minutes) : '—'}</td>
              <td className="muted">{((r.loop.leadsTo ?? []) as string[]).map((id) => byId.get(id)?.name ?? '').join(', ')}{r.links[0] ? ` (×${fmt(r.links[0].ratio)})` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'roadmapList') {
    const d = project.documents[ROADMAP_DOC]?.data[ex.section]
    const rows: Entity[] = Array.isArray(d) ? d : []
    const phaseName = (id: unknown) => roadmapList(project, 'phases').find((x) => x.id === id)?.name ?? ''
    const COLS: Record<string, [string, (e: Entity) => string]> = {
      tasks: ['Phase · weeks · effort', (e) => `${phaseName(e.phase)} · wk ${e.start}–${(e.start ?? 0) + (e.duration ?? 0)} · ${e.effort ?? '–'} pw`],
      gates: ['Phase · question', (e) => `${phaseName(e.phase)} · ${e.question ?? ''}`],
      cuts: ['Order', (e) => String(e.order ?? '')],
      dependencies: ['Blocks', (e) => String(e.blocksNote ?? '')],
    }
    const [head, cell] = COLS[ex.section] ?? ['', () => '']
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Name</th><th>{head}</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => <tr key={e.id}><td>{e.name}</td><td className="muted">{cell(e)}</td></tr>)}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'cast') {
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Character</th><th>Role</th><th>Importance</th></tr>
        </thead>
        <tbody>
          {storyList(project, 'characters').slice(-4).map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.role}</td><td>{c.importance}</td></tr>)}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'questFlow') return <QuestFlowCanvas project={project} />
  if (ex.preview === 'endingPaths') {
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Ending</th><th>Needs</th><th>Reachable</th></tr>
        </thead>
        <tbody>
          {endingReachability(project).map((r) => (
            <tr key={r.ending.id}>
              <td>{r.ending.name}</td>
              <td className="muted">{[...r.options.map((o) => `“${o.name}”`), ...r.quests.map((q) => q.name)].join(', ')}</td>
              <td>{r.reachable ? 'yes' : r.reasons[0]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'merchants') {
    const items = itemList(project, 'items')
    const m = tradeList(project, 'merchants').at(-1)
    if (!m) return <p className="empty">No merchant.</p>
    const goods = ((m.goods ?? []) as string[]).map((id) => items.find((i) => i.id === id)?.name ?? id)
    return (
      <table className="grid npc-preview">
        <tbody>
          <tr><th>{m.name}</th><td>{m.type}</td></tr>
          <tr><td>Sells</td><td>{goods.join(', ') || <span className="muted">nothing yet: add items with a value and rarity first</span>}</td></tr>
          <tr><td>Markup / buyback</td><td className="num">×{m.markup} / ×{m.buyback}</td></tr>
          {m.type === 'Wandering' && (() => {
            const o = wanderingOdds(project, m)
            return <tr><td>Visits</td><td>{o ? `${fmt(o.expected(60))} per 60 days, ${fmt(o.atLeastOne(30) * 100)}% within 30 days` : '—'}</td></tr>
          })()}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'priceLadder') {
    const item = itemList(project, 'items').find((i) => typeof i.value === 'number')
    const levels = reputationLevels(project)
    if (!item) return <p className="empty">Give an item a base value to see its prices; the factors are set either way.</p>
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>{item.name}</th><th>×</th><th>Buy</th><th>Sell</th></tr>
        </thead>
        <tbody>
          {levels.map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td className="num">{project.documents['design.trade']?.data.margins?.byReputation?.[l.id] ?? 1}</td>
              <td className="num">{fmt(priceOf(project, item.id, { side: 'buy', levelId: l.id })?.price ?? 0)}</td>
              <td className="num">{fmt(priceOf(project, item.id, { side: 'sell', levelId: l.id })?.price ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'moneyFlow') {
    const flow = moneyFlow(project)
    const rows = flow.byAct ? flow.periods : flow.periods.filter((_, i, a) => i === a.length - 1 || (i + 1) % 10 === 0)
    return (
      <div>
        <table className="grid npc-preview">
          <thead>
            <tr><th>{flow.byAct ? 'Act' : 'Day'}</th><th>In</th><th>Out</th><th>Net / day</th><th>Wallet</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}><td>{p.label}</td><td className="num">{fmt(p.sources)}</td><td className="num">{fmt(p.sinks)}</td><td className="num">{fmt(p.perDay)}</td><td className="num">{fmt(p.wallet)}</td></tr>
            ))}
          </tbody>
        </table>
        {!flow.byAct && <p className="muted">Add Story acts to see the flow per act.</p>}
      </div>
    )
  }
  if (ex.preview === 'dayClock') {
    const cov = dayCoverage(project)
    return (
      <div>
        <ClockDial project={project} />
        <p className="muted">
          {cov.arcs.map((a) => `${a.phase.name} ${fmt(a.phase.duration)} h`).join(' · ')}
          {cov.gaps.length || cov.overlaps.length ? ' · does not cover the day cleanly' : ' · covers all 24 hours'}
        </p>
      </div>
    )
  }
  if (ex.preview === 'seasons') {
    const s = seasonYear(project)
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Season</th><th>Days</th><th>From day</th><th>Modifiers</th></tr>
        </thead>
        <tbody>
          {s.ranges.map((r) => (
            <tr key={r.season.id}>
              <td>{r.season.name}</td><td className="num">{r.season.days}</td><td className="num">{r.from}</td>
              <td className="muted">{Object.entries(r.season.modifiers ?? {}).map(([k, v]) => `${k} ×${v}`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'weatherMix') {
    const rows = biomeWeather(project).filter((b) => b.weathers.length)
    const weathers = timeList(project, 'weather').slice(-3)
    return (
      <div>
        <table className="grid npc-preview">
          <thead>
            <tr><th>Weather</th><th>Share</th><th>Visibility</th></tr>
          </thead>
          <tbody>
            {weathers.map((w) => <tr key={w.id}><td>{w.name}</td><td className="num">{w.frequency}%</td><td className="num">{w.visibility}%</td></tr>)}
          </tbody>
        </table>
        {rows.length > 0 && <p className="muted">{rows.map((r) => `${r.biome.name}: ${fmt(r.clear)}% clear${r.over ? ' (over 100%)' : ''}`).join(' · ')}</p>}
      </div>
    )
  }
  if (ex.preview === 'yearEvents') {
    const cal = eventCalendar(project, 1)
    return (
      <div>
        <table className="grid npc-preview">
          <thead>
            <tr><th>Event</th><th>Per year</th><th>First days</th></tr>
          </thead>
          <tbody>
            {timeList(project, 'events').map((e) => {
              const days = cal.occurrences.filter((o) => o.event.id === e.id)
              return <tr key={e.id}><td>{e.name}</td><td className="num">{fmt(cal.expected.get(e.id) ?? 0)}</td><td className="muted">{days.slice(0, 4).map((o) => o.day).join(', ')}{days.length > 4 ? ' …' : ''}</td></tr>
            })}
          </tbody>
        </table>
        <p className="muted">{cal.coincidences.length ? `${cal.coincidences.length} coincidence(s), e.g. day ${cal.coincidences[0].day}: ${cal.coincidences[0].a.event.name} + ${cal.coincidences[0].b.event.name}` : 'No events coincide.'}</p>
      </div>
    )
  }
  if (ex.preview === 'typeProfiles') {
    return (
      <table className="grid npc-preview">
        <thead>
          <tr><th>Type</th><th>Combat</th><th>Use</th><th>Build</th><th>Tool</th></tr>
        </thead>
        <tbody>
          {itemList(project, 'types').map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              {['combat', 'use', 'build', 'tool'].map((k) => <td key={k} className="num">{t[k] ? '✓' : ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (ex.preview === 'recipes') {
    const items = itemList(project, 'items')
    const res = new Map((project.registry.catalogs.resources?.items ?? []).map((r) => [r.id, r.label]))
    const name = (id: string) => items.find((i) => i.id === id)?.name ?? '?'
    const recipes = itemList(project, 'recipes').slice(-3)
    const top = recipes[recipes.length - 1]
    const cost = top?.result ? rawCost(project, top.result) : null
    return (
      <div>
        <table className="grid npc-preview">
          <thead>
            <tr><th>Recipe</th><th>Makes</th><th>From</th></tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.outputQty ?? 1} × {name(r.result)}</td>
                <td>
                  {[...Object.entries(r.ingredients ?? {}).map(([id, n]) => `${n} ${name(id)}`), ...Object.entries(r.resources ?? {}).map(([id, n]) => `${n} ${res.get(id) ?? id}`)].join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cost && top && (
          <p className="muted">
            Raw cost of one {name(top.result)}: {Object.entries(cost.resources).map(([id, n]) => `${fmt(n)} ${res.get(id) ?? id}`).join(', ') || 'none'} · depth {cost.depth}
          </p>
        )}
      </div>
    )
  }
  if (ex.preview === 'lootOdds') {
    const table = itemList(project, 'loot').at(-1)
    const odds = table ? lootOdds(project, table) : null
    const items = itemList(project, 'items')
    return !odds || odds.rows.length === 0 ? (
      <p className="empty">No items at these rarities yet: add items with a rarity first.</p>
    ) : (
      <table className="grid npc-preview">
        <thead>
          <tr><th>{table!.name}</th><th>Per drop</th><th>Kills for 90%</th></tr>
        </thead>
        <tbody>
          {odds.rows.slice(0, 8).map((r) => (
            <tr key={r.id}>
              <td>{items.find((i) => i.id === r.id)?.name ?? r.id}{r.guaranteed ? ' (always)' : ''}</td>
              <td className="num">{fmt(r.perDrop * 100)}%</td>
              <td className="num">{r.killsFor90 ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const levels = comparedLevels(project)
  return (
    <table className="grid npc-preview">
      <thead>
        <tr>
          <th>Minutes to critical</th>
          {levels.map((l) => <th key={l.id}>{l.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {depletion(project).map((r) => (
          <tr key={r.stat.id}>
            <td>{r.stat.name}</td>
            {levels.map((l) => <td key={l.id} className="num">{r.times[l.id] === null ? '–' : fmt(r.times[l.id]!)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** “Insert example…”: pick an example, see the result on a copy, then insert it as one undo step. */
export function ExamplePicker({ guide }: { guide: ModuleGuide }) {
  const section = useGuideUi((s) => s.picker)
  const close = () => useGuideUi.getState().openPicker(null)
  const project = useProject()
  const options = guide.examples.filter((e) => e.section === section)
  const [chosen, setChosen] = useState<string | null>(null)
  const ex = options.find((e) => e.id === chosen) ?? options[0]
  const paramOptions = ex?.param ? ex.param.options(project) : []
  const [param, setParam] = useState<string | undefined>()
  const value = paramOptions.some((o) => o.id === param) ? param : paramOptions[0]?.id
  const preview = section && ex ? previewProject(project, ex, value) : null

  useEffect(() => {
    if (!section) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && useGuideUi.getState().openPicker(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [section])

  if (!section || !ex || !preview) return null
  return (
    <div className="overlay" onClick={close}>
      <div className="help-popup example-picker" role="dialog" aria-label="Insert example" onClick={(e) => e.stopPropagation()}>
        <div className="inspector-head">
          <h2>Insert example</h2>
          <span className="spacer" />
          <button onClick={close} aria-label="Close">✕</button>
        </div>
        <div className="example-list" role="radiogroup">
          {options.map((o) => (
            <label key={o.id} className={'example-option' + (o.id === ex.id ? ' on' : '')}>
              <input type="radio" name="example" checked={o.id === ex.id} onChange={() => setChosen(o.id)} />
              <strong>{o.title}</strong>
              <span className="muted">{o.description}</span>
            </label>
          ))}
        </div>
        {ex.param && (
          <div className="row">
            <span className="muted">{ex.param.label}</span>
            <select aria-label={ex.param.label} value={value ?? ''} onChange={(e) => setParam(e.target.value)}>
              {paramOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
        )}
        <h3>Preview</h3>
        <Preview project={preview} ex={ex} param={value} />
        <div className="hint-actions">
          <button
            className="primary"
            onClick={() => {
              applyExample(ex, value)
              close()
            }}
          >
            Insert
          </button>
          <button onClick={close}>Cancel</button>
          <span className="muted">One Ctrl+Z undoes the whole insert.</span>
        </div>
      </div>
    </div>
  )
}
