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
import { ARCH_DOC, bootSequence, dependencies, dependencyCycles, extensionCoverage, layerOrder, messageFlow, nameOf, tickBudget } from '../architecture'
import { bondLadder, eventOdds, lifespan, needChains, needsBalance, NPC_DOC, populationMix, workforceFlow } from '../npc'
import { comparedLevels, depletion, levelTable, PLAYER_DOC, treeAnalysis } from '../player'
import { coverage, finalValue, itemList, itemSources, lootOdds, rawCost, valueAdded } from '../items'
import { biomeWeather, conditions, dayCoverage, eventCalendar, nightPhase, realMinutes, seasonYear, TIME_DOC, timeList, yearLength } from '../timeWeather'
import { bossGates, COMBAT_DOC, damageFormula, damagePerHit, fighterOf, phaseCoverage, threatRamp, timeToDie, timeToKill } from '../combat'
import { artboardOf, bindLabel, controlConflicts, flowAnalysis, hudScreen, kindDef, layoutIssues, layoutOf, layoutRules, layoutSvg, navEdges, screensOf, UI_DOC, type WireElement } from '../ui'
import { actPacing, actsInOrder, decisionsOf, endingReachability, questDeps, rewardsByAct, STORY_DOC } from '../story'
import { OPEN_QUESTIONS_DOC, questionStats } from '../openQuestions'
import { pillarCoverage, scopeWithoutPillar, VISION_DOC } from '../vision'
import { cutSavings, cutsToRecover, overload, phaseProgress, ROADMAP_DOC } from '../roadmap'
import { CORE_LOOP_DOC, formatMinutes, loopList, loopPacing, pillarLoops } from '../coreLoop'
import { CATEGORIES as DIFFICULTY_CATEGORIES, DIFFICULTY_DOC, levelPressure, levelsOf, levelSteps } from '../difficulty'
import { difficultyImpact } from '../difficultyImpact'
import { DIPLOMACY_DOC, factionStandings, relationPairs, startValue, levelAt } from '../diplomacy'
import { biomeCoverage, biomesInOrder, biomeThreat, COVERAGE_COLUMNS, unlockPath, WORLD_DOC } from '../world'
import { factionFootprints } from '../diplomacyFootprint'
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

/** Summaries for the Technical Architecture views: layers with a Mermaid dependency graph, channels, coverage, tick budget and boot order. */
function architectureSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  if (!data.length) return ''
  const r = (n: number) => Math.round(n * 100) / 100
  const kinds = new Set(sec.views.map((v) => v.kind))
  const node = (id: string, label: string) => `${id.replace(/[^A-Za-z0-9_]/g, '_')}["${label.replace(/["[\]]/g, '')}"]`
  let out = ''
  if (kinds.has('archLayers')) {
    const layers = [...layerOrder(project)].reverse()
    const deps = dependencies(project).filter((d) => d.to)
    out += '\n```mermaid\nflowchart TB\n'
    for (const l of layers) {
      const mods = data.filter((m) => m.layer === l.id)
      if (!mods.length) continue
      out += `  subgraph ${node('L' + l.id, nameOf(l))}\n` + mods.map((m) => `    ${node(m.id, nameOf(m))}\n`).join('') + '  end\n'
    }
    for (const d of deps) out += `  ${node(d.from.id, nameOf(d.from))} ${d.issue === 'upward' ? '-.->|upward|' : '-->'} ${node(d.to!.id, nameOf(d.to))}\n`
    out += '```\n'
    const up = deps.filter((d) => d.issue === 'upward')
    const cycles = dependencyCycles(project)
    out += `\n_${deps.length} dependencies; ${up.length ? `upward: ${up.map((d) => `${nameOf(d.from)} → ${nameOf(d.to)}`).join(', ')}` : 'none upward'}; ${cycles.length ? `cycles: ${cycles.map((c) => c.map(nameOf).join(' ↔ ')).join('; ')}` : 'no cycles'}._\n`
  }
  if (kinds.has('archMessages')) {
    out += '\n| Channel | Kind | Published by | Listened to by |\n|---|---|---|---|\n'
    for (const c of messageFlow(project)) out += `| ${nameOf(c.channel)} | ${c.channel.kind ?? '–'} | ${c.publishers.map(nameOf).join(', ') || '–'} | ${c.subscribers.map(nameOf).join(', ') || '–'} |\n`
  }
  if (kinds.has('archExtensions')) {
    const cov = extensionCoverage(project)
    if (cov.rows.length) out += `\n_Extension coverage: ${cov.rows.map((x) => `${nameOf(x.schema)} → ${x.points.map(nameOf).join(', ') || 'none'}`).join('; ')}._\n`
  }
  if (kinds.has('archTicks')) {
    const b = tickBudget(project)
    out += `\n_Tick budget (planning estimate): ${r(b.tickRate)} ticks/s at ${r(b.fps)} fps; main-thread average ${r(b.avgFrameMs)} ms of a ${r(b.budgetMs)} ms simulation budget per frame; worst tick ${r(b.worstTickMs)} ms of a ${r(b.frameMs)} ms frame._\n`
    out += '\n| System | Every N ticks | ms / s | Thread |\n|---|---|---|---|\n'
    for (const x of b.rows) out += `| ${nameOf(x.system)} | ${x.every} | ${r(x.perSecond)} | ${x.system.thread ?? 'Main thread'} |\n`
  }
  if (kinds.has('archBoot')) {
    const boot = bootSequence(project)
    if (boot.steps.length) out += `\n_Boot order: ${boot.steps.map((s) => `${s.scenes.map(nameOf).join(' + ')} (${r(s.seconds)} s)`).join(' → ')}._\n`
  }
  return out
}

/** Summaries for the NPC System visual views: mix, need chains, lifespan, workforce, bond ladder and event odds. */
function npcSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  if (!data.length) return ''
  const r = (n: number) => Math.round(n * 100) / 100
  const kinds = new Set(sec.views.map((v) => v.kind))
  let out = ''
  if (kinds.has('npcPopulation')) {
    const mix = populationMix(project)
    if (mix.rows.length) out += `\n_Population mix: ${mix.rows.map((x) => `${entityLabel(x.archetype)} ${r(x.share)}%`).join(', ')} (total ${r(mix.total)}%)._\n`
  }
  if (kinds.has('npcNeedChain')) {
    out += '\n| Need | Per 100 NPCs / day | Satisfied by | Grace (days) | When unmet |\n|---|---|---|---|---|\n'
    for (const c of needChains(project)) out += `| ${c.label} | ${c.per100 === null ? '–' : r(c.per100)} | ${c.supply.join(', ') || '–'} | ${c.graceDays ?? '–'} | ${c.consequence || (c.rule ? '–' : 'no rule')} |\n`
  }
  if (kinds.has('npcLifespan')) {
    const l = lifespan(project)
    if (l.rows.length) out += `\n_Lifespan ${l.scale[0]}–${l.scale[1]}: ${l.rows.map((x) => `${entityLabel(x.stage)} ${x.from}–${x.to}${x.canWork ? ' (works)' : ''}`).join(', ')}; working age ${Math.round(l.workShare * 100)}% of a lifetime._\n`
  }
  if (kinds.has('npcWorkforce')) {
    const f = workforceFlow(project)
    const label = new Map(f.nodes.map((n) => [n.id, n.label]))
    const node = (id: string) => `${id.replace(/[^A-Za-z0-9_]/g, '_')}["${(label.get(id) ?? id).replace(/["[\]]/g, '')}"]`
    const lines = f.links.map((k) => `  ${node(k.from)} ${k.mismatch ? '-.->|wrong workers|' : '-->'} ${node(k.to)}`)
    if (lines.length) out += '\n```mermaid\nflowchart LR\n' + lines.join('\n') + '\n```\n'
  }
  if (kinds.has('npcBondLadder')) {
    const b = bondLadder(project)
    if (b.levels.length) out += `\n_Bond ladder: ${b.levels.map((l) => `${l.name} ${l.from}…${l.to}${l.bonds.length ? ` → ${l.bonds.map((x) => entityLabel(x)).join(', ')}` : ''}`).join('; ')}._\n`
  }
  if (kinds.has('npcEventOdds')) {
    const rows = eventOdds(project, yearLength(project), seasonYear(project).ranges.length || 4).filter((x) => x.perYear !== null)
    if (rows.length) out += `\n_Expected per year (one eligible roll): ${rows.map((x) => `${entityLabel(x.event)} ≈ ${r(x.perYear!)}`).join(', ')}._\n`
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

/** The doc's own table: # · Question · Area · Options · Decision · Status · Owner · Due, plus where it was written back. */
function openQuestionsMd(project: Project, docId: string, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  if (!data.length) return '_No entries yet._\n'
  const st = questionStats(project, Date.now())
  const cols = ['area', 'options', 'decision', 'status', 'owner', 'due', 'affects'].map((k) => sec.fields.find((f) => f.key === k)!).filter(Boolean)
  let out = `Open: ${st.open + st.discussion} (${st.discussion} in discussion) · Decided: ${st.decided} · Overdue: ${st.overdue}\n\n`
  out += `| # | Question | ${cols.map((f) => f.label).join(' | ')} |\n`
  out += `|${'---|'.repeat(cols.length + 2)}\n`
  data.forEach((q, i) => {
    out += `| ${[String(i + 1), entityLabel(q), ...cols.map((f) => valueToText(project, docId, f, q[f.key]))].map(esc).join(' | ')} |\n`
  })
  const notes = data.filter((q) => String(q.legacyNotes ?? '').trim())
  if (notes.length) out += '\n' + notes.map((q) => `* **${esc(entityLabel(q))}**, earlier notes: ${esc(q.legacyNotes)}`).join('\n') + '\n'
  return out
}

/** Pressure per level (by category, with the step from the previous level) and the cross-module impact, after the values. */
function difficultySummaryMd(project: Project): string {
  const rows = levelPressure(project)
  const p = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(Math.round(n * 100)))
  let out = ''
  if (rows.some((r) => r.overall !== null)) {
    const cats = DIFFICULTY_CATEGORIES.filter((c) => rows.some((r) => r.categories.some((x) => x.category === c)))
    const steps = new Map(levelSteps(project).map((s) => [s.to.id, s]))
    out += `\n**Pressure per level** (0 = easiest end of every range, 100 = hardest; planning summary)\n\n| Level | Overall | Step | ${cats.join(' | ')} |\n|${'---|'.repeat(cats.length + 3)}\n`
    for (const r of rows) {
      const s = steps.get(r.level.id)
      const step = s ? `${s.delta >= 0 ? '+' : ''}${Math.round(s.delta * 100)}${s.inverted ? ' (easier)' : s.tooClose ? ' (too close)' : ''}` : ''
      out += `| ${esc(r.level.label)} | ${p(r.overall)} | ${step} | ${cats.map((c) => p(r.categories.find((x) => x.category === c)?.mean)).join(' | ')} |\n`
    }
  }
  const impact = difficultyImpact(project)
  if (impact.length) {
    const levels = levelsOf(project)
    const r = (n: number) => Math.round(n * 100) / 100
    out += `\n**Impact on other systems**\n\n| System | Effect | ${levels.map((l) => esc(l.label)).join(' | ')} |\n|${'---|'.repeat(levels.length + 2)}\n`
    for (const row of impact) {
      const cell = (v: number | null) => (v === null ? '' : row.kind === 'mult' ? `×${r(v)}` : `${r(v)} ${row.unit}(s)`)
      out += `| ${row.group} | ${esc(row.label)} | ${levels.map((l) => cell(row.values[l.id])).join(' | ')} |\n`
    }
  }
  return out
}

/** Named standings from the matrix (allied / hostile pairs, one-sided pairs), after the relationship matrix. */
function diplomacyRelationsMd(project: Project): string {
  const pairs = relationPairs(project).filter((p) => p.mean !== undefined)
  if (!pairs.length) return ''
  const name = (p: (typeof pairs)[number]) => `${esc(entityLabel(p.a))} – ${esc(entityLabel(p.b))}`
  const by = (k: string) => pairs.filter((p) => p.standing === k).map(name)
  const allied = by('ally')
  const hostile = by('enemy')
  let out = `\n* **Allied:** ${allied.length ? allied.join(', ') : 'none'}\n* **Hostile:** ${hostile.length ? hostile.join(', ') : 'none'}\n`
  const one = pairs.filter((p) => p.asymmetric)
  if (one.length) out += `* **One-sided:** ${one.map((p) => `${esc(entityLabel(p.a))} → ${esc(entityLabel(p.b))} ${p.ab}, back ${p.ba}`).join('; ')}\n`
  return out
}

/** Where each faction appears (views: factionFootprint), after the faction sheets. */
function diplomacyFootprintMd(project: Project): string {
  const rows = factionFootprints(project)
  if (!rows.length) return ''
  const standing = new Map(factionStandings(project).map((s) => [s.faction.id, s]))
  let out = '\n**Faction footprint**\n\n| Faction | Allies | Hostile | Characters | Unlocks | Actions | Endings | Used in other modules |\n|---|---|---|---|---|---|---|---|\n'
  for (const r of rows) {
    const s = standing.get(r.faction.id)
    const other = r.elsewhere.map((g) => `${esc(g.docTitle)} (${g.usages.length})`).join(', ') || 'none yet'
    out += `| ${esc(entityLabel(r.faction))} | ${s?.allies.length ?? 0} | ${s?.enemies.length ?? 0} | ${r.characters} | ${r.unlocks} | ${r.actions} | ${r.endings} | ${other} |\n`
  }
  return out
}

/** The level a new game starts in, under the relationship levels. */
function diplomacyStartMd(project: Project): string {
  const v = startValue(project)
  const l = levelAt(project, v)
  return `\n_A new game starts at ${v}${l ? ` (${esc(l.name)})` : ', outside every level'}._\n`
}

/** World overview after the biome sheets (views: unlockPath, biomeThreat, biomeCoverage): unlock order, threat and gaps, plus a Mermaid unlock path. */
function worldSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>): string {
  const kinds = new Set(sec.views.map((v) => v.kind))
  const list = biomesInOrder(project)
  if (!list.length || !kinds.has('unlockPath')) return ''
  const path = unlockPath(project)
  const threat = new Map(biomeThreat(project).map((r) => [r.biome.id, r]))
  const cov = new Map(biomeCoverage(project).map((r) => [r.biome.id, r]))
  const n = (x: number | null | undefined) => (x === null || x === undefined ? '' : String(Math.round(x)))
  let out = '\n**World overview**\n\n| Biome | Role | Player level | Opens | Gates | Median threat | Coverage | Missing |\n|---|---|---|---|---|---|---|---|\n'
  for (const b of list) {
    const t = threat.get(b.id)
    const c = cov.get(b.id)
    const wave = path.wave.get(b.id)
    const gates = path.links.filter((l) => l.to === b.id).map((l) => `${l.via}: ${l.gate}`).join(', ')
    const missing = c ? COVERAGE_COLUMNS.filter((col) => c.cells[col.key] === 0).map((col) => col.label).join(', ') : ''
    const lv = t?.levelMin !== null && t?.levelMin !== undefined ? `${t.levelMin}${t.levelMax !== null && t.levelMax !== t.levelMin ? `–${t.levelMax}` : ''}` : ''
    out += `| ${[entityLabel(b), b.role ?? '', lv, wave === undefined ? 'never' : wave === 0 ? 'at start' : `wave ${wave}`, gates, n(t?.median) + (t?.flag ? ` (${t.flag})` : ''), c ? `${Math.round(c.score * 100)}%` : '', missing].map(esc).join(' | ')} |\n`
  }
  const drawn = path.links.filter((l) => l.from && l.from !== l.to)
  if (drawn.length) {
    const id = (s: string) => `b_${s.replace(/[^A-Za-z0-9]/g, '_')}`
    out += '\n```mermaid\nflowchart LR\n'
    for (const b of list) out += `  ${id(b.id)}["${entityLabel(b).replace(/"/g, "'")} (${b.role ?? 'no role'})"]\n`
    for (const l of drawn) out += `  ${id(l.from!)} -->|${`${l.via}: ${l.gate}`.replace(/[|"]/g, '/')}| ${id(l.to)}\n`
    out += '```\n'
  }
  return out
}

/** Loop pacing and pillar coverage, written under the Core Loop's "Rewards and progression" chapter (doc ch. 5). */
function coreLoopSummaryMd(project: Project): string {
  let out = ''
  const rows = loopPacing(project).filter((r) => r.minutes !== undefined)
  if (rows.length) {
    out += '\n**Loop pacing**\n\n| Loop | Time scale | One cycle | Builds toward |\n|---|---|---|---|\n'
    for (const r of rows) {
      const links = r.links.map((l) => `${entityLabel(l.to)} ${l.inverted ? '(not longer)' : `×${Math.round(l.ratio * 10) / 10}`}`).join(', ')
      out += `| ${esc(entityLabel(r.loop))} | ${esc(r.loop.scale ?? '')} | ${formatMinutes(r.minutes!)}${r.days !== undefined ? ` (${Math.round(r.days * 10) / 10} in-game days)` : ''} | ${esc(links)} |\n`
    }
  }
  const cov = pillarLoops(project)
  if (cov.length && loopList(project).some((l) => Array.isArray(l.pillars) && l.pillars.length)) {
    out += `\n**Pillars served by loops:** ${cov.map((c) => `${esc(entityLabel(c.pillar))} (${c.loops.length ? c.loops.map((l) => esc(entityLabel(l))).join(', ') : 'none'})`).join('; ')}\n`
  }
  return out
}

/** Progress per phase (views: phaseProgress) and the savings of the cut order (views: cutSavings). */
function roadmapSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  if (!data.length) return ''
  const kinds = new Set(sec.views.map((v) => v.kind))
  const r = (n: number) => Math.round(n * 10) / 10
  let out = ''
  if (kinds.has('phaseProgress')) {
    const rows = phaseProgress(project, Date.now()).filter((x) => x.tasks > 0 || x.capacity !== undefined)
    if (rows.length) {
      out += '\n**Progress**\n\n| Phase | Tasks done | Effort done / planned | Capacity | Ends |\n|---|---|---|---|---|\n'
      for (const x of rows)
        out += `| ${esc(entityLabel(x.phase))} | ${x.done}/${x.tasks} | ${r(x.effortDone)} / ${r(x.effort)} | ${x.capacity === undefined ? '' : r(x.capacity) + (x.over ? ' (over)' : '')} | ${x.endDate ?? ''}${x.late ? ' (late)' : ''} |\n`
    }
  }
  if (kinds.has('cutSavings')) {
    const rows = cutSavings(project)
    const need = overload(project)
    const enough = cutsToRecover(project)
    out += '\n**Savings (person-weeks)**\n\n| # | Cut | Saves | Cumulative |\n|---|---|---|---|\n'
    for (const c of rows) out += `| ${c.cut.order ?? ''} | ${esc(entityLabel(c.cut))} | ${c.source === 'none' ? '' : r(c.saving) + (c.source === 'manual' ? ' (estimate)' : '')} | ${r(c.cumulative)} |\n`
    if (need > 0) out += `\n_Overload to recover: ${r(need)} person-weeks; ${enough ? `the first ${enough} cut(s) recover it` : 'the cuts do not recover it'}._\n`
  }
  return out
}

/** Pillar x scope table for the Vision's scope section (views: pillarMatrix). */
function visionSummaryMd(project: Project, sec: Extract<SectionDef, { kind: 'collection' }>, data: Entity[]): string {
  if (!sec.views.some((v) => v.kind === 'pillarMatrix') || !data.length) return ''
  const cov = pillarCoverage(project)
  if (!cov.length) return ''
  const mark = (e: Entity, id: string) => (Array.isArray(e.pillars) && e.pillars.includes(id) ? 'x' : '')
  let out = `\n**Pillar coverage**\n\n| Scope item | Bucket | ${cov.map((c) => esc(entityLabel(c.pillar))).join(' | ')} |\n|${'---|'.repeat(cov.length + 2)}\n`
  for (const e of data) out += `| ${esc(entityLabel(e))} | ${esc(e.bucket ?? '')} | ${cov.map((c) => mark(e, c.pillar.id)).join(' | ')} |\n`
  out += `| **Items / in MVP** | | ${cov.map((c) => `${c.scope.length} / ${c.mvp.length}`).join(' | ')} |\n`
  const loose = scopeWithoutPillar(project)
  if (loose.length) out += `\n_Serving no pillar yet: ${loose.map((e) => esc(entityLabel(e))).join(', ')}._\n`
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
      const extra =
        mod.id === TRADE_DOC
          ? tradeKindMd(project, sec.id)
          : mod.id === UI_DOC
            ? uiFormMd(project, sec.id)
            : mod.id === CORE_LOOP_DOC && sec.id === 'rewardsProgression'
              ? coreLoopSummaryMd(project)
              : ''
      // The section heading already names a single-field form, so a bullet repeating that title is dropped.
      if (sec.fields.length === 1 && filled.length === 1 && filled[0].f.label === sec.title) return filled[0].t + '\n' + extra
      const lines = filled.map(({ f, t }) => `* **${f.label}:** ${t}`)
      return (lines.length ? lines.join('\n') + '\n' : extra ? '' : '_No data._\n') + extra
    }
    case 'collection':
      if (mod.id === OPEN_QUESTIONS_DOC) return openQuestionsMd(project, mod.id, sec, data)
      return collectionMd(project, mod.id, sec, data) + scheduleSummaryMd(project, mod.id, sec, data) + needsBalanceMd(project, sec, data) + (mod.id === NPC_DOC ? npcSummaryMd(project, sec, data) : '') + (mod.id === ARCH_DOC ? architectureSummaryMd(project, sec, data) : '') + playerSummaryMd(project, sec) + itemsSummaryMd(project, sec, data) + (mod.id === COMBAT_DOC ? combatSummaryMd(project, sec, data) : '') + (mod.id === TIME_DOC ? timeWeatherSummaryMd(project, sec, data) : '') + (mod.id === TRADE_DOC ? tradeSummaryMd(project, sec, data) : '') + (mod.id === STORY_DOC ? storySummaryMd(project, sec, data) : '') + (mod.id === UI_DOC ? uiSummaryMd(project, sec, data) : '') + (mod.id === VISION_DOC ? visionSummaryMd(project, sec, data) : '') + (mod.id === ROADMAP_DOC ? roadmapSummaryMd(project, sec, data) : '') + (mod.id === WORLD_DOC && sec.id === 'biomes' ? worldSummaryMd(project, sec) : '') + (mod.id === DIPLOMACY_DOC && sec.id === 'factions' ? diplomacyFootprintMd(project) : '') + (mod.id === DIPLOMACY_DOC && sec.id === 'thresholds' && data.length ? diplomacyStartMd(project) : '')
    case 'matrix':
      return matrixMd(project, mod.id, sec, data) + (mod.id === DIFFICULTY_DOC && sec.id === 'values' ? difficultySummaryMd(project) : '') + (mod.id === DIPLOMACY_DOC && sec.id === 'relations' ? diplomacyRelationsMd(project) : '')
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
