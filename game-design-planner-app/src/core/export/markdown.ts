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
import { bossGates, COMBAT_DOC, damageFormula, damagePerHit, fighterOf, phaseCoverage, threatRamp, timeToDie, timeToKill } from '../combat'

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
      return lines.length ? lines.join('\n') + '\n' : '_No data._\n'
    }
    case 'collection':
      return collectionMd(project, mod.id, sec, data) + scheduleSummaryMd(project, mod.id, sec, data) + needsBalanceMd(project, sec, data) + playerSummaryMd(project, sec) + itemsSummaryMd(project, sec, data) + (mod.id === COMBAT_DOC ? combatSummaryMd(project, sec, data) : '')
    case 'matrix':
      return matrixMd(project, mod.id, sec, data)
    case 'graph':
      return graphMd(project, mod.id, sec, data)
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

export async function exportZip(project: Project): Promise<Blob> {
  const zip = new JSZip()
  for (const m of MODULES) {
    if (!project.documents[m.id]) continue
    zip.file(exportPath(m), moduleToMarkdown(project, m))
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
