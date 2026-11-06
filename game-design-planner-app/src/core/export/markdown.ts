import JSZip from 'jszip'
import type {
  ChecklistData,
  Entity,
  FieldDef,
  FormulaData,
  GraphData,
  MatrixData,
  PlannerModule,
  Project,
  SectionDef,
} from '../model/types'
import { getSections, MODULES } from '../modules/registry'
import { entityLabel, resolveSource } from '../references/refs'
import { tryEvaluate } from '../formula'
import { analyze, weekToDate, withBuffer } from '../schedule'
import { needsBalance } from '../npc'
import { comparedLevels, depletion, levelTable, PLAYER_DOC, treeAnalysis } from '../player'
import { coverage, finalValue, itemList, itemSources, lootOdds, rawCost, valueAdded } from '../items'
import { biomeWeather, conditions, dayCoverage, eventCalendar, nightPhase, realMinutes, TIME_DOC, timeList, yearLength } from '../timeWeather'
import { bossGates, COMBAT_DOC, damageFormula, damagePerHit, fighterOf, phaseCoverage, threatRamp, timeToDie, timeToKill } from '../combat'
import { artboardOf, bindLabel, controlConflicts, flowAnalysis, hudScreen, kindDef, layoutIssues, layoutOf, layoutRules, layoutSvg, navEdges, screensOf, UI_DOC, type WireElement } from '../ui'
import { actPacing, actsInOrder, decisionsOf, endingReachability, questDeps, rewardsByAct, STORY_DOC } from '../story'
import { arbitrage, dailyAmount, merchantsOf, moneyFlow, priceOf, reputationLevels, stockCoverage, TRADE_DOC, wanderingOdds } from '../trade'

const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

function valueToText(project: Project, docId: string, fd: FieldDef, val: any): string {
  if (val === undefined || val === null || val === '') return ''
  switch (fd.type) {
    case 'boolean':
      return val ? 'yes' : 'no'
    case 'list':
      return (val as string[]).join(', ')
    case 'ref': {
      return resolveSource(project, docId, fd.source).find((i) => i.id === val)?.label ?? String(val)
    }
    case 'multiref': {
      const items = resolveSource(project, docId, fd.source)
      return (val as string[]).map((id) => items.find((i) => i.id === id)?.label ?? id).join(', ')
    }
    case 'map': {
      const items = resolveSource(project, docId, fd.source)
      return Object.entries(val as Record<string, number>)
        .map(([id, n]) => `${items.find((i) => i.id === id)?.label ?? id}: ${n}`)
        .join(', ')
    }
    case 'checklist':
      return (val as ChecklistData['groups'][number]['items']).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('; ')
    default:
      return String(val)
  }
}

function collectionMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  if (!data.length) return '_No entries yet._\n'
  const shortFields = sec.fields.filter((f) => f.key !== 'name' && !['longtext', 'checklist', 'map', 'list'].includes(f.type))
  const useTable = sec.views.some((v) => v.kind === 'table') && shortFields.length > 0
  const longFields = sec.fields.filter((f) => f.key !== 'name' && (!useTable || !shortFields.includes(f)))
  let out = ''
  if (useTable) {
    out += `| ${['Name', ...shortFields.map((f) => f.label)].join(' | ')} |\n`
    out += `|${'---|'.repeat(shortFields.length + 1)}\n`
    for (const e of data) {
      out += `| ${[entityLabel(e), ...shortFields.map((f) => valueToText(project, docId, f, e[f.key]))].map(esc).join(' | ')} |\n`
    }
    out += '\n'
  }
  for (const e of data) {
    const lines = longFields
      .map((f) => ({ f, t: valueToText(project, docId, f, e[f.key]) }))
      .filter((x) => x.t)
    if (!lines.length) {
      if (!useTable) out += `### ${entityLabel(e)}\n\n`
      continue
    }
    out += `### ${entityLabel(e)}\n`
    for (const { f, t } of lines) out += f.type === 'checklist' ? `* **${f.label}:**\n${(e[f.key] as any[]).map((i) => `  - [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')}\n` : `* **${f.label}:** ${t}\n`
    out += '\n'
  }
  return out
}

function matrixMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'matrix' }>, data: MatrixData): string {
  const rows = resolveSource(project, docId, sec.rows)
  const cols = resolveSource(project, docId, sec.cols)
  if (!rows.length || !cols.length) return '_Matrix is empty._\n'
  const meta = sec.rowMeta
  const entities: Entity[] = !('catalog' in sec.rows) ? project.documents[sec.rows.doc ?? docId]?.data[sec.rows.section] ?? [] : []
  const rowEntity = (id: string) => entities.find((e) => e.id === id)
  const head = ['', ...(meta?.unit ? ['Unit'] : []), ...cols.map((c) => c.label), ...(meta?.notes ? ['Notes'] : [])]
  let out = `| ${head.map(esc).join(' | ')} |\n|${'---|'.repeat(head.length)}\n`
  for (const r of rows) {
    const e = rowEntity(r.id)
    const cells = [
      r.label,
      ...(meta?.unit ? [e?.[meta.unit] ?? ''] : []),
      ...cols.map((c) => data.cells?.[`${r.id}|${c.id}`] ?? ''),
      ...(meta?.notes ? [e?.[meta.notes] ?? ''] : []),
    ]
    out += `| ${cells.map(esc).join(' | ')} |\n`
  }
  return out
}

function graphMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'graph' }>, data: GraphData): string {
  if (!data.nodes.length) return '_Diagram is empty._\n'
  const src = sec.nodeSource ? resolveSource(project, docId, sec.nodeSource) : []
  const label = (n: GraphData['nodes'][number]) => src.find((i) => i.id === n.refId)?.label ?? n.label
  const mermaidId = (id: string) => `n_${id.replace(/[^A-Za-z0-9]/g, '_')}`
  let out = '```mermaid\nflowchart LR\n'
  for (const n of data.nodes) out += `  ${mermaidId(n.id)}["${label(n).replace(/"/g, "'")} (${n.kind})"]\n`
  for (const e of data.edges) out += `  ${mermaidId(e.source)} -->${e.label || e.kind ? `|${(e.label || e.kind)!.replace(/\|/g, '/')}|` : ''} ${mermaidId(e.target)}\n`
  out += '```\n\n'
  const noted = data.nodes.filter((n) => n.notes)
  if (noted.length) out += noted.map((n) => `* **${label(n)}:** ${esc(n.notes)}`).join('\n') + '\n'
  return out
}

/** Planned and buffered end of a scheduled collection, with calendar dates when a project start date is set. */
function scheduleSummaryMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const tl = sec.views.find((v) => v.kind === 'timeline')
  if (!tl || tl.kind !== 'timeline' || !data.length) return ''
  const a = analyze(data, { start: tl.startField, duration: tl.durationField, deps: tl.depsField ?? '', kind: tl.kindField })
  const settings = tl.calendar ? project.documents[docId]?.data[tl.calendar.section] : undefined
  const buffer = settings?.[tl.calendar?.bufferField ?? '']
  const startDate = settings?.[tl.calendar?.startField ?? '']
  const buffered = Math.ceil(withBuffer(a.end, buffer))
  const at = (w: number) => (weekToDate(startDate, w) ? ` (${weekToDate(startDate, w)})` : '')
  let out = `\n_Planned end: week ${a.end}${at(a.end)}`
  if (buffer) out += `; with ${buffer}% buffer: week ${buffered}${at(buffered)}`
  out += '._\n'
  if (a.conflicts.length) out += `\n_${a.conflicts.length} dependency conflict(s): an item starts before its predecessor ends._\n`
  return out
}

/** Needs-vs-supply line per population scenario, for collections with a needs balance view. */
function needsBalanceMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const view = sec.views.find((v) => v.kind === 'needsBalance')
  if (!view || view.kind !== 'needsBalance' || !data.length) return ''
  const r = (n: number) => Math.round(n * 100) / 100
  let out = '\n'
  for (const s of data) {
    const b = needsBalance(project, s, view.populationField)
    const parts = b.rows.map((x) => `${x.label} ${r(x.demand)}/${x.supply === null ? '–' : r(x.supply)}${x.short ? ' (short)' : ''}`)
    out += `_Needs balance for ${entityLabel(s)} (population ${r(b.population)}; needed/supplied): ${parts.join(', ') || 'no needs set'}._\n`
  }
  return out
}

/** Pacing summaries for the Player Character views: time to critical, level table, tree cost and a Mermaid tree. */
function playerSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>): string {
  const kinds = new Set(sec.views.map((v) => v.kind))
  const r = (n: number) => Math.round(n * 10) / 10
  let out = ''
  if (kinds.has('depletion')) {
    const levels = comparedLevels(project)
    const rows = depletion(project).filter((x) => Object.values(x.times).some((t) => t !== null))
    if (rows.length) {
      out += `\n**Time from full to critical** (${rows[0].unit}s unless noted):\n\n| Stat | ${levels.map((l) => esc(l.label)).join(' | ')} |\n|---|${'---|'.repeat(levels.length)}\n`
      for (const x of rows) out += `| ${esc(x.stat.name)}${x.unit !== rows[0].unit ? ` (${x.unit}s)` : ''} | ${levels.map((l) => (x.times[l.id] === null ? '–' : r(x.times[l.id]!))).join(' | ')} |\n`
    }
  }
  if (kinds.has('levelCurve')) {
    const t = levelTable(project)
    if (String(project.documents[PLAYER_DOC]?.data.leveling?.xpFormula ?? '').trim() && !t.error) {
      const step = t.cap > 20 ? 5 : t.cap > 10 ? 2 : 1
      out += `\n**Level table** (cap ${t.cap}):\n\n| Level | XP to reach | Total XP | Hours | Skill points |\n|---|---|---|---|---|\n`
      for (const row of t.rows.filter((x) => x.level % step === 0 || x.level === t.cap))
        out += `| ${row.level} | ${row.next === null ? '–' : r(row.next)} | ${r(row.total)} | ${row.hours === null ? '–' : r(row.hours)} | ${r(row.points)} |\n`
    }
  }
  if (kinds.has('skillTree')) {
    const trees = treeAnalysis(project).casts.filter((c) => c.skills.length)
    if (trees.length) {
      out += `\n**Tree cost per cast:** ${trees.map((c) => `${c.cast.label} ${r(c.totalCost)} of ${r(c.budget)} points at cap${c.affordableAt ? ` (complete at level ${c.affordableAt})` : ''}`).join('; ')}.\n`
      const skills = trees.flatMap((c) => c.skills)
      const id = (s: string) => `s_${s.replace(/[^A-Za-z0-9]/g, '_')}`
      out += '\n```mermaid\nflowchart TB\n'
      for (const c of trees) {
        out += `  subgraph ${id(c.cast.id)}["${c.cast.label.replace(/"/g, "'")}"]\n`
        for (const s of c.skills) out += `    ${id(s.id)}["${String(s.name ?? '').replace(/"/g, "'")}${typeof s.cost === 'number' ? ` (${s.cost})` : ''}"]\n`
        out += '  end\n'
      }
      for (const s of skills) for (const req of (s.requires ?? []) as string[]) if (skills.some((x) => x.id === req)) out += `  ${id(req)} --> ${id(s.id)}\n`
      out += '```\n'
    }
  }
  return out
}

/** Items & Crafting summaries: coverage and item sheets, recipe cost and value, loot odds, and a Mermaid crafting graph. */
function itemsSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const kinds = new Set(sec.views.map((v) => v.kind))
  const r = (n: number) => Math.round(n * 100) / 100
  const cat = (id: string, v: unknown) => project.registry.catalogs[id]?.items.find((i) => i.id === v)?.label ?? ''
  const items = itemList(project, 'items')
  const itemName = (id: string) => entityLabel(items.find((i) => i.id === id)) || id
  let out = ''
  if (kinds.has('itemCoverage') && data.length) {
    const c = coverage(project)
    const used = c.types.filter((t) => c.rarities.some((ra) => c.counts[`${t.id}|${ra.id}`]))
    if (used.length) {
      out += `\n**Coverage** (items per type × rarity):\n\n| Type | ${c.rarities.map((ra) => esc(ra.label)).join(' | ')} |\n|---|${'---|'.repeat(c.rarities.length)}\n`
      for (const t of used) out += `| ${esc(t.label)} | ${c.rarities.map((ra) => c.counts[`${t.id}|${ra.id}`] ?? '').join(' | ')} |\n`
    }
    out += '\n**Item sheets:**\n\n'
    for (const it of data) {
      const fv = finalValue(project, it)
      const src = itemSources(project, it.id).map((s) => `${s.kind}: ${s.label}`)
      const parts = [
        [cat('itemTypes', it.type), cat('rarities', it.rarity), cat('qualities', it.quality)].filter(Boolean).join(' / '),
        typeof it.value === 'number' ? `value ${it.value}${fv !== null && fv !== it.value ? ` (final ${r(fv)})` : ''}` : '',
        typeof it.weight === 'number' ? `weight ${it.weight}` : '',
        typeof it.stack === 'number' ? `stack ${it.stack}` : '',
        src.length ? `obtained from ${src.join(', ')}` : 'not obtainable yet',
      ].filter(Boolean)
      out += `* **${esc(entityLabel(it))}:** ${parts.join(' · ')}\n`
    }
  }
  if (kinds.has('craftTree') && data.length) {
    const res = (id: string) => cat('resources', id) || id
    out += '\n**Crafting cost and value:**\n\n| Recipe | Raw cost | Depth | Value added |\n|---|---|---|---|\n'
    for (const rec of data.filter((x) => x.result)) {
      const cost = rawCost(project, rec.result, typeof rec.outputQty === 'number' ? rec.outputQty : 1)
      const raw = [...Object.entries(cost.resources).map(([id, n]) => `${r(n)} ${res(id)}`), ...Object.entries(cost.items).map(([id, n]) => `${r(n)} ${itemName(id)}`)].join(', ')
      const va = valueAdded(project, rec)
      out += `| ${esc(entityLabel(rec))} | ${esc(raw || '–')} | ${cost.depth}${cost.cycle ? ' (loops)' : ''} | ${va ? `×${va.ratio === Infinity ? '∞' : r(va.ratio)}` : '–'} |\n`
    }
    const id = (s: string) => `i_${s.replace(/[^A-Za-z0-9]/g, '_')}`
    const edges = data.flatMap((rec) => (rec.result ? Object.keys((rec.ingredients ?? {}) as object).map((ing) => `  ${id(ing)}["${itemName(ing).replace(/"/g, "'")}"] --> ${id(rec.result)}["${itemName(rec.result).replace(/"/g, "'")}"]\n`) : []))
    if (edges.length) out += '\n```mermaid\nflowchart LR\n' + [...new Set(edges)].join('') + '```\n'
  }
  if (kinds.has('lootOdds') && data.length) {
    out += '\n**Loot odds** (chance per drop):\n\n'
    for (const t of data) {
      const o = lootOdds(project, t)
      if (!o.rows.length) continue
      out += `* **${esc(entityLabel(t))}** (${o.rolls} roll${o.rolls === 1 ? '' : 's'}): ${o.rows.map((x) => `${itemName(x.id)} ${r(x.perDrop * 100)}%${x.killsFor90 ? ` (90% in ${x.killsFor90})` : ''}`).join(', ')}\n`
    }
  }
  return out
}

/** Combat summaries: enemy sheets and threat ramp, the damage formula with time to kill / die, and boss phases with gates. */
function combatSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const kinds = new Set(sec.views.map((v) => v.kind))
  const r = (n: number) => Math.round(n * 10) / 10
  const cat = (id: string, v: unknown) => project.registry.catalogs[id]?.items.find((i) => i.id === v)?.label ?? ''
  const biome = (id: unknown) => entityLabel(((project.documents['design.world']?.data.biomes ?? []) as Entity[]).find((b) => b.id === id))
  let out = ''
  if (kinds.has('threatCurve') && data.length) {
    const loot = (project.documents['design.items']?.data.loot ?? []) as Entity[]
    out += '\n**Enemy sheets:**\n\n'
    for (const e of data) {
      const f = fighterOf(e)
      const res = Object.entries(f.resistances).filter(([, v]) => typeof v === 'number' && v !== 0).map(([t, v]) => `${cat('damageTypes', t)} ${v}%`)
      const drops = loot.filter((t) => Array.isArray(t.sources) && t.sources.includes(e.id)).map((t) => entityLabel(t))
      const parts = [
        [biome(e.biome), e.role].filter(Boolean).join(', '),
        [f.hp !== null ? `HP ${f.hp}` : '', f.damage !== null ? `damage ${f.damage} × ${f.attackRate}/s` : '', f.armor ? `armor ${f.armor}` : ''].filter(Boolean).join(', '),
        e.pattern || e.behavior ? `behavior: ${[e.pattern, e.behavior].filter(Boolean).join('; ')}` : '',
        res.length ? `resistances: ${res.join(', ')}` : f.weaknesses.length ? `weak to ${f.weaknesses.map((w) => cat('damageTypes', w)).join(', ')}` : '',
        drops.length ? `drops: ${drops.join(', ')}` : 'drops: none',
      ].filter(Boolean)
      out += `* **${esc(entityLabel(e))}:** ${esc(parts.join(' · '))}\n`
    }
    const ramp = threatRamp(project)
    if (ramp.medians.size) out += `\n**Threat ramp** (median per biome stage): ${[...ramp.medians].map(([s, m]) => `${['Starter', 'Early', 'Mid', 'Late', 'Final'][s]} ${Math.round(m)}`).join(' → ')}.\n`
  }
  if (kinds.has('combatSandbox') && data.length) {
    const levels = comparedLevels(project)
    const mid = levels[Math.floor((levels.length - 1) / 2)]
    const foes = [...((project.documents[COMBAT_DOC]?.data.enemies ?? []) as Entity[]), ...((project.documents[COMBAT_DOC]?.data.bosses ?? []) as Entity[])].map(fighterOf)
    const sample = damagePerHit(project, 20, { armor: 100, resistances: {}, weaknesses: [] })
    out += `\n**Damage formula:** \`${damageFormula(project)}\`${sample !== null ? ` (20 attack against 100 armor: ${r(sample)} per hit)` : ''}.\n`
    if (foes.length) {
      out += `\n**Seconds to kill / to die** (${mid.label}):\n\n| Loadout | ${foes.map((f) => esc(f.name)).join(' | ')} |\n|---|${'---|'.repeat(foes.length)}\n`
      for (const l of data) {
        const c = { levelId: mid.id || undefined }
        out += `| ${esc(entityLabel(l))} | ${foes.map((f) => { const k = timeToKill(project, l, f, c); const d = timeToDie(project, l, f, c); return `${k ? r(k.seconds) : '–'} / ${d ? r(d.seconds) : '∞'}` }).join(' | ')} |\n`
      }
    }
  }
  if (kinds.has('phaseBars') && sec.id === 'bosses' && data.length) {
    out += '\n**Boss phases and gates:**\n\n'
    for (const b of data) {
      const cov = phaseCoverage(project, b.id)
      const phases = cov.phases.map((p) => `${entityLabel(p)} ${p.hpFrom}–${p.hpTo}%${p.mechanics ? ` (${p.mechanics})` : ''}`)
      const gates = bossGates(project, b.id)
      out += `* **${esc(entityLabel(b))}:** ${esc(phases.join(' → ') || 'no phases')}${cov.gaps.length ? ' · gaps!' : ''} · gates: ${esc(gates.join(', ') || 'nothing')}\n`
    }
  }
  return out
}

/** Time & Weather summaries: phases in real minutes, weather mix per biome, event dates and coincidences, worst-case conditions. */
function timeWeatherSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const kinds = new Set(sec.views.map((v) => v.kind))
  const r = (n: number) => Math.round(n * 100) / 100
  const hh = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
  let out = ''
  if (kinds.has('dayClock') && data.length) {
    const cov = dayCoverage(project)
    out += '\n**Day clock:**\n\n| Phase | From – to | Real minutes |\n|---|---|---|\n'
    for (const a of cov.arcs) {
      const span = (a.to - a.from + 24) % 24 || 24
      const real = realMinutes(project, span)
      out += `| ${esc(entityLabel(a.phase))} | ${hh(a.from)} – ${hh(a.to)} | ${real === null ? '–' : r(real)} |\n`
    }
    if (cov.gaps.length || cov.overlaps.length) out += `\n_${[...cov.gaps.map(([f, t]) => `No phase ${hh(f)}–${hh(t)}`), ...cov.overlaps.map(([f, t]) => `Overlap ${hh(f)}–${hh(t)}`)].join('; ')}._\n`
  }
  if (kinds.has('biomeWeather') && data.length) {
    const rows = biomeWeather(project).filter((b) => b.weathers.length)
    if (rows.length) {
      out += '\n**Weather per biome:**\n\n'
      for (const b of rows) out += `* **${esc(entityLabel(b.biome))}:** ${b.weathers.map((w) => `${entityLabel(w.weather)} ${w.frequency}%`).join(', ')}, clear ${r(b.clear)}%${b.over ? ' (over 100%!)' : ''}\n`
    }
  }
  if (kinds.has('yearStrip') && sec.id === 'events' && data.length) {
    const cal = eventCalendar(project, 1)
    out += `\n**Events per year** (${yearLength(project)} days):\n\n`
    for (const e of data) {
      const days = cal.occurrences.filter((o) => o.event.id === e.id)
      const exp = cal.expected.get(e.id)
      out += `* **${esc(entityLabel(e))}:** ${exp === null || exp === undefined ? 'not scheduled' : e.schedule === 'Random chance' ? `about ${r(exp)} times` : `${days.length} time(s): day ${days.map((o) => r(o.day)).join(', ')}`}\n`
    }
    if (cal.coincidences.length) out += `\n_Coinciding: ${cal.coincidences.slice(0, 8).map((c) => `day ${r(c.day)} ${entityLabel(c.a.event)} + ${entityLabel(c.b.event)}`).join('; ')}._\n`
  }
  if (kinds.has('conditions') && data.length) {
    const night = nightPhase(project)
    const harshest = [...timeList(project, 'weather')].filter((w) => typeof w.visibility === 'number').sort((a, b) => a.visibility - b.visibility)[0]
    const head = ['Event', 'Visibility', 'Monster strength', ...((project.registry.catalogs.worldModifiers?.items ?? []).map((m) => m.label))]
    out += `\n**Worst case** (${[night && entityLabel(night), harshest && entityLabel(harshest)].filter(Boolean).join(' + ') || 'no phase or weather'} + event):\n\n| ${head.map(esc).join(' | ')} |\n|${'---|'.repeat(head.length)}\n`
    for (const e of data) {
      const c = conditions(project, { phase: night?.id, weather: harshest?.id, event: e.id })
      out += `| ${esc(entityLabel(e))} | ${r(c.visibility)}% | ${c.factors.map((f) => `×${r(f.value)}`).join(' | ')} |\n`
    }
  }
  return out
}

/** Where a screen's wireframe SVG goes in the export zip, relative to ui_ux.md. */
export const wireframePath = (screen: Entity) => `ui_wireframes/${String(screen.id).replace(/[^\w-]/g, '_')}.svg`

const REGION = (x: number, y: number, w: number, h: number, bw: number, bh: number) => {
  const cx = (x + w / 2) / bw
  const cy = (y + h / 2) / bh
  const v = cy < 1 / 3 ? 'top' : cy > 2 / 3 ? 'bottom' : ''
  const hz = cx < 1 / 3 ? 'left' : cx > 2 / 3 ? 'right' : ''
  return v && hz ? `${v}-${hz}` : v || hz || 'centre'
}
const elementLine = (project: Project, screens: Entity[], el: WireElement, bw: number, bh: number) => {
  const d = kindDef(el.kind)
  const bits = [d.label, el.text ? `“${el.text}”` : '', REGION(el.x, el.y, el.w, el.h, bw, bh), el.bind ? `shows ${bindLabel(project, el.bind)}` : '', el.action ? (el.action.kind === 'opens' ? `opens ${screens.find((s) => s.id === el.action!.screen)?.name ?? '⚠ missing'}` : el.action.kind) : '', el.states?.length ? `only in ${el.states.join(', ')}` : '']
  return bits.filter(Boolean).join(' · ')
}

/** Chapter 2: the flow as Mermaid (graph and wireframe buttons) with reachability. */
function uiFlowMd(project: Project): string {
  const screens = screensOf(project)
  if (!screens.length) return ''
  const f = flowAnalysis(project)
  const id = (s: string) => `S_${s.replace(/\W/g, '_')}`
  const seen = new Set<string>()
  let out = '\n```mermaid\nflowchart LR\n'
  for (const s of screens) out += `  ${id(s.id)}["${String(entityLabel(s)).replace(/"/g, "'")}"]\n`
  for (const e of navEdges(project)) {
    if (!e.to || seen.has(`${e.from}>${e.to}`)) continue
    seen.add(`${e.from}>${e.to}`)
    out += `  ${id(e.from)} ${e.source === 'wireframe' ? '-->' : '-.->'} ${id(e.to)}\n`
  }
  out += '```\n'
  out += `\n_Entry: ${esc(entityLabel(f.entry ?? { id: '' }))}. Solid arrows are buttons in the wireframes, dashed ones only in the graph._\n`
  if (f.unreachable.length) out += `\n_Unreachable: ${f.unreachable.map((s) => entityLabel(s)).join(', ')}._\n`
  if (f.deadEnds.length) out += `\n_No way back: ${f.deadEnds.map((s) => entityLabel(s)).join(', ')}._\n`
  return out
}

/** Chapter 3 (HUD widgets and their data) and chapter 6 (text fit) from the forms. */
function uiFormMd(project: Project, sectionId: string): string {
  if (sectionId === 'hud') {
    const hud = hudScreen(project)
    const els = layoutOf(hud)
    if (!hud || !els.length) return ''
    const { w, h } = artboardOf(project, hud)
    return `\n**HUD widgets** (${esc(entityLabel(hud))}, ${w}×${h}; [wireframe](${wireframePath(hud)})):\n\n${els.map((e) => `* ${esc(elementLine(project, screensOf(project), e, w, h))}`).join('\n')}\n`
  }
  if (sectionId === 'accessibility') {
    const rules = layoutRules(project)
    const misfits = screensOf(project).flatMap((s) => layoutIssues(project, s).filter((i) => i.kind === 'textFit').map((i) => `${entityLabel(s)}: ${i.message}`))
    return `\n_Text fit at +${rules.textExpansion} %: ${misfits.length ? misfits.map(esc).join('; ') : 'every label fits'}._\n`
  }
  return ''
}

/** Chapter 4: each screen's wireframe as a list of elements, its link, and annotations; chapter 5: control conflicts. */
function uiSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const kinds = new Set(sec.views.map((v) => v.kind))
  let out = ''
  if (kinds.has('wireframe')) {
    const screens = screensOf(project)
    for (const s of data) {
      const els = layoutOf(s)
      if (!els.length) continue
      const { w, h } = artboardOf(project, s)
      out += `\n#### ${esc(entityLabel(s))}: wireframe\n\n![${esc(entityLabel(s))}](${wireframePath(s)})\n\n${els.map((e) => `* ${esc(elementLine(project, screens, e, w, h))}`).join('\n')}\n`
      const notes = els.filter((e) => e.note?.trim())
      if (notes.length) out += `\n**Notes:**\n\n${notes.map((e, i) => `${i + 1}. ${esc(e.text || kindDef(e.kind).label)}: ${esc(e.note)}`).join('\n')}\n`
      const issues = layoutIssues(project, s).filter((i) => i.level !== 'info')
      if (issues.length) out += `\n_Open issues: ${issues.map((i) => esc(i.message)).join('; ')}._\n`
    }
  }
  if (kinds.has('bindingMap')) {
    const c = controlConflicts(project)
    if (c.length) out += `\n**Conflicts:** ${c.map((x) => `${esc(x.value)}: ${esc(entityLabel(x.a))} + ${esc(entityLabel(x.b))}`).join('; ')}\n`
  }
  return out
}

/** Story summaries: the chapter-2 act table, quest flow and main path, rewards per act, endings and the decision tree. */
function storySummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const kinds = new Set(sec.views.map((v) => v.kind))
  const r = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100)
  const field = (key: string) => sec.fields.find((f) => f.key === key)
  const text = (e: Entity, key: string) => {
    const f = field(key)
    return f ? valueToText(project, STORY_DOC, f, e[key]) : ''
  }
  const mm = (s: string) => s.replace(/"/g, "'")
  let out = ''
  if (kinds.has('actPacing') && data.length) {
    const pace = new Map(actPacing(project).map((p) => [p.act.id, p]))
    out += '\n**Acts** (doc chapter 2):\n\n| Act | Content | Biome | Key events | Player level | Quest hours |\n|---|---|---|---|---|---|\n'
    for (const a of actsInOrder(project)) {
      const p = pace.get(a.id)
      const lv = [a.levelMin, a.levelMax].some((x) => typeof x === 'number') ? `${a.levelMin ?? '…'}–${a.levelMax ?? '…'}` : ''
      out += `| ${[entityLabel(a), a.goal || a.summary || '', [text(a, 'biome'), text(a, 'extraBiomes')].filter(Boolean).join(', '), text(a, 'keyEvents'), lv + (p?.level ? ` (est. ${p.level})` : ''), p ? String(r(p.questHours)) : ''].map(esc).join(' | ')} |\n`
    }
  }
  if (kinds.has('questFlow') && data.length) {
    const deps = questDeps(project)
    if (deps.mainPath.length) out += `\n**Main questline:** ${deps.mainPath.map((q) => esc(entityLabel(q))).join(' → ')}\n`
    if (deps.edges.length) {
      out += '\n```mermaid\nflowchart LR\n'
      for (const q of data) out += `  ${q.id.replace(/\W/g, '_')}["${mm(entityLabel(q))}"]\n`
      for (const e of deps.edges) if (data.some((q) => q.id === e.from) && data.some((q) => q.id === e.to)) out += `  ${e.from.replace(/\W/g, '_')} ${e.kind === 'leadsTo' ? '-.->' : '-->'} ${e.to.replace(/\W/g, '_')}\n`
      out += '```\n'
    }
  }
  if (kinds.has('rewardBudget') && data.length) {
    const { rows } = rewardsByAct(project)
    if (rows.some((x) => x.xp || x.money || x.itemValue)) {
      out += '\n**Rewards per act:**\n\n| Act | XP | Money | Item value |\n|---|---|---|---|\n'
      for (const x of rows) out += `| ${esc(x.label)} | ${r(x.xp)} | ${r(x.money)} | ${r(x.itemValue)} |\n`
    }
  }
  if (kinds.has('endingPaths') && data.length) {
    out += '\n**Reachability:**\n\n'
    for (const e of endingReachability(project)) out += `* **${esc(entityLabel(e.ending))}:** ${e.reachable ? (e.empty ? 'no requirements yet' : 'reachable') : `unreachable — ${esc(e.reasons.join('; '))}`}\n`
    const decisions = decisionsOf(project)
    if (decisions.length) {
      out += '\n```mermaid\nflowchart LR\n'
      decisions.forEach((d, i) => {
        out += `  D${i}{"${mm(d.name)}"}\n`
        for (const o of d.options) out += `  D${i} --> ${o.id.replace(/\W/g, '_')}["${mm(entityLabel(o))}"]\n`
      })
      for (const e of data) for (const id of (e.requiresChoices ?? []) as string[]) out += `  ${id.replace(/\W/g, '_')} --> E_${e.id.replace(/\W/g, '_')}(["${mm(entityLabel(e))}"])\n`
      out += '```\n'
    }
  }
  return out
}

/** Trade forms for doc chapters 2–4 list the merchants of their kind, so the export reads in doc order. */
const TRADE_KIND_FORMS: Record<string, string> = { wandering: 'Wandering', market: 'Town market', capital: 'Faction capital' }

function tradeKindMd(project: Project, sectionId: string): string {
  const kind = TRADE_KIND_FORMS[sectionId]
  if (!kind) return ''
  const list = merchantsOf(project, kind)
  if (!list.length) return ''
  const items = itemList(project, 'items')
  const goods = (m: Entity) => ((m.goods ?? []) as string[]).map((id) => items.find((i) => i.id === id)?.name ?? id).join(', ')
  return `\n**${kind} merchants:**\n\n${list.map((m) => `* **${esc(entityLabel(m))}:** ${esc(goods(m)) || 'no goods yet'}`).join('\n')}\n`
}

/** Trade & Economy summaries: wandering odds, stock, prices and money loops, money flow per act. */
function tradeSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  const kinds = new Set(sec.views.map((v) => v.kind))
  const r = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100)
  const pc = (p: number) => `${Math.round(p * 1000) / 10}%`
  let out = ''
  if (kinds.has('wanderingCalendar')) {
    const rows = data.filter((m) => m.type === 'Wandering').map((m) => ({ m, o: wanderingOdds(project, m) })).filter((x) => x.o)
    if (rows.length) {
      out += '\n**Wandering merchant odds:**\n\n| Merchant | Roll every | Chance | Visits / 60 days | ≥1 in 30 days |\n|---|---|---|---|---|\n'
      for (const { m, o } of rows) out += `| ${esc(entityLabel(m))} | ${r(o!.interval)} d | ${pc(o!.chance)} | ${r(o!.expected(60))} | ${pc(o!.atLeastOne(30))} |\n`
    }
  }
  if (kinds.has('merchantStock') && data.length) {
    const c = stockCoverage(project)
    const over = c.rows.filter((x) => x.overCap.length)
    if (over.length) out += `\n_Above the rarity limit: ${over.map((x) => `${entityLabel(x.merchant)} (${x.overCap.map((g) => g.name).join(', ')})`).join('; ')}._\n`
    if (c.unsold.length) out += `\n_Valuable items no merchant trades: ${c.unsold.map((i) => i.name).join(', ')}._\n`
  }
  if (kinds.has('priceLadder')) {
    const items = itemList(project, 'items').filter((i) => typeof i.value === 'number').slice(0, 10)
    const top = reputationLevels(project).at(-1)
    if (items.length) {
      const head = ['Item', 'Buy', 'Sell', ...(top ? [`Buy (${entityLabel(top)})`, `Sell (${entityLabel(top)})`] : [])]
      out += `\n**Prices** (no merchant, baseline difficulty):\n\n| ${head.map(esc).join(' | ')} |\n|${'---|'.repeat(head.length)}\n`
      for (const i of items) {
        const p = (side: 'buy' | 'sell', levelId?: string) => {
          const v = priceOf(project, i.id, { side, levelId })
          return v ? String(r(v.price)) : '–'
        }
        out += `| ${[entityLabel(i), p('buy'), p('sell'), ...(top ? [p('buy', top.id), p('sell', top.id)] : [])].map(esc).join(' | ')} |\n`
      }
    }
    const a = arbitrage(project)
    const loops = [
      ...(a.inverse ? ['The sell margin is at or above the buy margin.'] : []),
      ...a.trade.map((l) => `Buy ${l.item.name} at ${l.from.name} for ${r(l.buy)}, sell at ${l.to.name} for ${r(l.sell)}.`),
      ...a.craft.map((l) => `Craft ${l.item.name} from bought ingredients for ${r(l.cost)}, sell for ${r(l.income)}.`),
    ]
    if (loops.length) out += `\n**Money loops:**\n\n${loops.map((l) => `* ${esc(l)}`).join('\n')}\n`
  }
  if (kinds.has('moneyFlow') && data.length) {
    const flow = moneyFlow(project)
    const periods = flow.byAct ? flow.periods : flow.periods.slice(-1)
    out += `\n**Money flow** (${flow.byAct ? 'per act' : `after ${flow.periods.length} days`}, starting with ${r(flow.start)}):\n\n| ${flow.byAct ? 'Act' : 'Period'} | In | Out | Net / day | Wallet | Kept |\n|---|---|---|---|---|---|\n`
    for (const p of periods) out += `| ${esc(p.label)} | ${r(p.sources)} | ${r(p.sinks)} | ${r(p.perDay)} | ${r(p.wallet)} | ${p.sources > 0 ? pc(p.kept) : '–'} |\n`
    const node = (e: Entity, i: number, prefix: string) => `  ${prefix}${i}["${String(entityLabel(e)).replace(/"/g, "'")} (${r(dailyAmount(e))}/day)"]`
    const src = data.filter((f) => f.direction === 'Source')
    const snk = data.filter((f) => f.direction === 'Sink')
    out += '\n```mermaid\nflowchart LR\n  W(("Wallet"))\n'
    src.forEach((f, i) => (out += `${node(f, i, 'S')}\n  S${i} --> W\n`))
    snk.forEach((f, i) => (out += `${node(f, i, 'K')}\n  W --> K${i}\n`))
    out += '```\n'
  }
  return out
}

export function sectionMd(project: Project, mod: PlannerModule, sec: SectionDef): string {
  const data = project.documents[mod.id]?.data[sec.id]
  if (data === undefined) return '_No data._\n'
  switch (sec.kind) {
    case 'form': {
      const filled = sec.fields
        .map((f) => ({ f, t: valueToText(project, mod.id, f, data[f.key]) }))
        .filter((x) => x.t)
      // The section heading already names a single-field form, so a bullet repeating that title is dropped.
      if (sec.fields.length === 1 && filled.length === 1 && filled[0].f.label === sec.title) return filled[0].t + '\n'
      const lines = filled.map(({ f, t }) => `* **${f.label}:** ${t}`)
      const extra = mod.id === TRADE_DOC ? tradeKindMd(project, sec.id) : mod.id === UI_DOC ? uiFormMd(project, sec.id) : ''
      return (lines.length ? lines.join('\n') + '\n' : extra ? '' : '_No data._\n') + extra
    }
    case 'collection':
      return collectionMd(project, mod.id, sec, data) + scheduleSummaryMd(project, mod.id, sec, data) + needsBalanceMd(project, sec, data) + playerSummaryMd(project, sec) + itemsSummaryMd(project, sec, data) + (mod.id === COMBAT_DOC ? combatSummaryMd(project, sec, data) : '') + (mod.id === TIME_DOC ? timeWeatherSummaryMd(project, sec, data) : '') + (mod.id === TRADE_DOC ? tradeSummaryMd(project, sec, data) : '') + (mod.id === STORY_DOC ? storySummaryMd(project, sec, data) : '') + (mod.id === UI_DOC ? uiSummaryMd(project, sec, data) : '')
    case 'matrix':
      return matrixMd(project, mod.id, sec, data)
    case 'graph':
      return graphMd(project, mod.id, sec, data) + (mod.id === UI_DOC && sec.id === 'flow' ? uiFlowMd(project) : '')
    case 'canvas': {
      if (!data.items.length) return '_Canvas is empty._\n'
      const entries = sec.zones ? resolveSource(project, mod.id, sec.zones.source) : []
      const zone = (i: any) => entries.find((e) => e.id === i.refId)?.label
      return (
        '| Kind | Label | Linked | x | y | Width | Height |\n|---|---|---|---|---|---|---|\n' +
        data.items.map((i: any) => `| ${esc(i.kind)} | ${esc(i.label)} | ${esc(zone(i) ?? '')} | ${Math.round(i.x)} | ${Math.round(i.y)} | ${Math.round(i.w)} | ${Math.round(i.h)} |`).join('\n') +
        '\n'
      )
    }
    case 'checklist': {
      const d = data as ChecklistData
      return d.groups.map((g) => `### ${g.title}\n${g.items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')}\n`).join('\n') || '_No items._\n'
    }
    case 'richtext':
      return String(data || '_No text._') + '\n'
    case 'formulas': {
      const d = data as FormulaData
      if (!d.items.length) return '_No formulas._\n'
      let out = '| Name | Formula | Variables | Result |\n|---|---|---|---|\n'
      for (const it of d.items) {
        const r = tryEvaluate(it.expr, it.vars)
        out += `| ${esc(it.name)} | \`${esc(it.expr)}\` | ${esc(Object.entries(it.vars).map(([k, v]) => `${k}=${v}`).join(', '))} | ${r.ok ? r.value : '—'} |\n`
      }
      return out
    }
  }
}

export function moduleToMarkdown(project: Project, mod: PlannerModule): string {
  let out = `# ${mod.title}\n\n**Status:** Draft | **Last modified:** ${project.meta.updatedAt.slice(0, 10)}\n\n> ${mod.summary}\n\n`
  let n = 0
  for (const sec of getSections(mod, project.registry)) {
    const split = sec.kind === 'collection' ? sec.exportSplit : undefined
    if (sec.kind === 'collection' && split) {
      const data = (project.documents[mod.id]?.data[sec.id] ?? []) as Entity[]
      const scale = sec.fields.find((f) => f.key === split.field)
      const options = scale?.type === 'enum' ? scale.options : []
      const rest = data.filter((e) => !options.includes(e[split.field]))
      const groups = [...options.map((o, i) => ({ title: split.headings[i] ?? o, items: data.filter((e) => e[split.field] === o) })), ...(rest.length ? [{ title: 'Unclassified loops', items: rest }] : [])]
      const bare = { ...sec, fields: sec.fields.filter((f) => f.key !== split.field) }
      for (const g of groups) out += `## ${++n}. ${g.title}\n\n${collectionMd(project, mod.id, bare, g.items)}\n`
      continue
    }
    out += `## ${++n}. ${sec.title}\n\n${sec.description ? `_${sec.description}_\n\n` : ''}${sectionMd(project, mod, sec)}\n`
  }
  return out
}

/** Path inside the exported docs folder, e.g. docs/01_design/x.md -> 01_design/x.md */
export const exportPath = (mod: PlannerModule) => mod.docsPath.replace(/^docs\//, '')

/** A file the export writes next to a document; `path` is relative to the document, as its Markdown links it. */
export type ExportAsset = { path: string; mime: string; content: string }

/**
 * Files a document links to (today: UI wireframe SVGs). The single source for both the export zip and the Markdown
 * preview, so whatever the preview shows is exactly what the zip contains.
 */
export function exportAssets(project: Project, mod: PlannerModule): ExportAsset[] {
  if (mod.id === UI_DOC) return screensOf(project).filter((s) => layoutOf(s).length).map((s) => ({ path: wireframePath(s), mime: 'image/svg+xml', content: layoutSvg(project, s) }))
  return []
}

export async function exportZip(project: Project): Promise<Blob> {
  const zip = new JSZip()
  for (const m of MODULES) {
    if (!project.documents[m.id]) continue
    zip.file(exportPath(m), moduleToMarkdown(project, m))
    const dir = exportPath(m).replace(/[^/]+$/, '')
    for (const a of exportAssets(project, m)) zip.file(dir + a.path, a.content)
  }
  return zip.generateAsync({ type: 'blob' })
}

export function sectionCsv(project: Project, mod: PlannerModule, sec: SectionDef): string | null {
  if (sec.kind !== 'collection') return null
  const data = (project.documents[mod.id]?.data[sec.id] ?? []) as Entity[]
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = sec.fields.map((f) => q(f.label)).join(',')
  const rows = data.map((e) => sec.fields.map((f) => q(valueToText(project, mod.id, f, e[f.key]))).join(','))
  return [header, ...rows].join('\n')
}
