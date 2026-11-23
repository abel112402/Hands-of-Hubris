import type { EngineId } from './adapter'
import { CAPABILITIES, supportOf, type PrototypeReport } from './capabilities'
import type { EngineIR, EngineIssue } from './ir'

/**
 * What a playable prototype leaves to people (plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 17): the stand-ins the
 * engine makes for missing art, the plain built-in UI, the manual work per chosen system, the defaults the export
 * filled in and what the plan says but the prototype does not run. Everything is read from the export; nothing is
 * guessed. The export's README and the Unity gate's report show it.
 */
export type HandWork = {
  /** Assets the engine makes once as stand-ins; then they are yours to replace. */
  standIns: string[]
  /** Records with an asset field (icon, prefab…) left empty in the plan. */
  noArt: string[]
  /** Built-in UI that works but is plain: replace it with your own. */
  builtInUi: string[]
  /** Per chosen system, what is not generated and is done by hand. */
  byHand: { system: string; items: string[] }[]
  /** Values the export filled in because the plan left them empty. */
  defaults: string[]
  /** What the plan says that the prototype does not run. */
  notRun: string[]
}

/** The engine's file-name form of a name (as the Unity bridge's PlannerGreybox.Safe): invalid characters and spaces become “_”. */
const safe = (s: string) =>
  [...(s.trim() || 'Map')]
    .map((ch) => (ch.charCodeAt(0) < 32 || '<>:"/\\|?* '.includes(ch) ? '\n' : ch))
    .join('')
    .split('\n')
    .filter(Boolean)
    .join('_')

const NOTES = /^(gameplay|proto)\./
const NOT_NOTES = new Set(['gameplay.default', 'proto.verdict', 'proto.choiceMissing', 'proto.noSystems'])

export function handWork(ir: EngineIR, report: PrototypeReport, issues: EngineIssue[], engine: EngineId): HandWork {
  const g = ir.gameplay
  const chosen = new Set(report.profile.systems)
  const standIns: string[] = []
  if (engine === 'unity' && g?.scene && chosen.has('movement')) {
    const here = g.placements.filter((x) => x.location === g.scene!.location)
    standIns.push('`Prototype/Player.prefab` — the player (a capsule with the planned movement)')
    for (const x of here.filter((x) => x.role === 'item' && x.item)) standIns.push(`\`Prototype/Prefabs/${safe(x.key ?? x.item!)}.prefab\` — the pickup ${x.key ?? x.item} (a cube; or give its record a prefab in Unity)`)
    if (chosen.has('combat'))
      for (const x of here.filter((x) => x.role === 'enemy')) {
        const e = g.combat?.enemies.find((y) => y.enemy === x.enemy)
        if (e) standIns.push(`\`Prototype/Prefabs/${safe(e.key ?? e.enemy)}.prefab\` — the body of ${e.name} (a capsule)`)
      }
    if (chosen.has('trade'))
      for (const x of here.filter((x) => x.role === 'merchant')) {
        const name = g.trade?.merchants.find((m) => m.merchant === x.merchant)?.name
        if (name) standIns.push(`\`Prototype/Prefabs/Merchant${safe(name)}.prefab\` — the body of ${name} (a capsule)`)
      }
    if (chosen.has('dialogue'))
      for (const x of here.filter((x) => x.role === 'npc' && x.character)) {
        const name = g.dialogue?.characters.find((c) => c.character === x.character)?.name ?? x.character!
        standIns.push(`\`Prototype/Prefabs/Npc${safe(name)}.prefab\` — the body of ${name} (a capsule)`)
      }
  }
  const assetFields = new Map(ir.schemas.map((s) => [s.id, s.fields.filter((f) => f.type.k === 'asset').map((f) => f.name)]))
  const noArt = ir.records.flatMap((r) => {
    const empty = (assetFields.get(r.schema) ?? []).filter((f) => r.values[f] === null || r.values[f] === undefined || r.values[f] === '')
    return empty.length ? [`${r.name} (\`${r.key}\`): ${empty.join(', ')}`] : []
  })
  const builtInUi = engine !== 'unity' ? [] : [
    ...(chosen.has('interaction') ? ['The interaction prompt (“[E] Pick up …”): a plain on-screen label.'] : []),
    ...(chosen.has('crafting') ? ['The crafting panel (`PlannerCraftingPanel`, IMGUI): replace it with your UI over `PlannerCrafting.CanCraft` / `TryCraft`.'] : []),
    ...(chosen.has('dialogue') ? ['The dialogue panel (`PlannerDialoguePanel`, IMGUI): replace it with your UI over `PlannerDialogue.Options` / `Pick`.'] : []),
    ...(chosen.has('saveLoad') ? ['The quick save message (`PlannerQuickSave`): a plain label; there is no save menu or slot picker.'] : []),
    ...(chosen.has('trade') ? ['The trade panel and the money label (`PlannerTrade`, IMGUI): replace them with your shop UI over `CanBuy` / `Buy` / `CanSell` / `Sell`.'] : []),
    ...(chosen.has('progression') ? ['The level and XP label (`PlannerProgression`): a plain label; there is no level-up screen.'] : []),
    ...(chosen.has('time') ? ['The clock label (`PlannerClock`): a plain label.'] : []),
  ]
  const byHand = CAPABILITIES.filter((c) => chosen.has(c.id)).flatMap((c) => {
    const items = supportOf(c, engine).manual ?? []
    return items.length ? [{ system: c.label, items }] : []
  })
  const uniq = (xs: string[]) => [...new Set(xs)]
  const defaults = uniq(issues.filter((i) => i.code === 'gameplay.default').map((i) => i.message))
  const notRun = uniq(issues.filter((i) => (i.level === 'info' || i.level === 'warning') && NOTES.test(i.code) && !NOT_NOTES.has(i.code)).map((i) => i.message.replace(/^Playable prototype: /, '')))
  return { standIns, noArt, builtInUi, byHand, defaults, notRun }
}

/** The hand work as a Markdown section (empty when there is nothing to say). */
export function handWorkMarkdown(w: HandWork, heading = '##'): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n')
  const parts: string[] = []
  if (w.standIns.length) parts.push(`**Stand-ins** — made once when missing, then yours: replace them and build the scene again.\n\n${list(w.standIns)}`)
  if (w.noArt.length) parts.push(`**No art in the plan yet** (${w.noArt.length} record${w.noArt.length === 1 ? '' : 's'}; the engine shows a placeholder):\n\n${list(w.noArt)}`)
  if (w.builtInUi.length) parts.push(`**Plain built-in UI** — it works; make it yours:\n\n${list(w.builtInUi)}`)
  if (w.byHand.length) parts.push(`**By hand** — not generated for the chosen systems:\n\n${w.byHand.map((s) => `- ${s.system}: ${s.items.join('; ')}.`).join('\n')}`)
  if (w.defaults.length) parts.push(`**Defaults filled in** (set them in the plan to change them):\n\n${list(w.defaults)}`)
  if (w.notRun.length) parts.push(`**In the plan, not run by the prototype:**\n\n${list(w.notRun)}`)
  return parts.length ? `\n${heading} Placeholders and manual work\n\n${parts.join('\n\n')}\n` : ''
}
