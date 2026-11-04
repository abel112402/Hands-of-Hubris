import { DEFAULT_DAMAGE_FORMULA } from './combatFormula'
import { tryEvaluate } from './formula'
import type { CatalogItem, Entity, Project } from './model/types'
import { difficultyMultiplier } from './player'

export const COMBAT_DOC = 'design.combat'
export { DEFAULT_DAMAGE_FORMULA }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const asMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {})
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const listOf = (project: Project, docId: string, section: string): Entity[] => {
  const d = project.documents[docId]?.data[section]
  return Array.isArray(d) ? d : []
}
export const combatList = (project: Project, section: string) => listOf(project, COMBAT_DOC, section)
const model = (project: Project): Record<string, any> => project.documents[COMBAT_DOC]?.data.damageModel ?? {}
const label = (e: Entity | undefined) => (e ? String(e.name ?? '') || '(unnamed)' : '⚠ missing')
const catalogItems = (project: Project, id: string): CatalogItem[] => project.registry.catalogs[id]?.items ?? []

/** Resistance used when an enemy lists a damage type as a weakness but sets no explicit resistance for it. */
export const WEAKNESS_RESIST = -25
/** Player HP when neither the loadout nor the Player's Health stat sets one. */
export const DEFAULT_PLAYER_HP = 100

// ---------- Fighters ----------

/** What the damage maths needs about anything that fights. */
export type Fighter = {
  id: string
  name: string
  hp: number | null
  damage: number | null
  attackRate: number
  armor: number
  damageType?: string
  resistances: Record<string, number>
  weaknesses: string[]
}

export const fighterOf = (e: Entity): Fighter => ({
  id: e.id,
  name: label(e),
  hp: isNum(e.hp) ? e.hp : null,
  damage: isNum(e.damage) ? e.damage : null,
  attackRate: isNum(e.attackRate) && e.attackRate > 0 ? e.attackRate : 1,
  armor: isNum(e.armor) ? e.armor : 0,
  damageType: e.damageType,
  resistances: asMap(e.resistances),
  weaknesses: ids(e.weaknesses),
})

/** Variant as a fighter: its base enemy with the HP and damage multipliers applied. */
export function variantFighter(project: Project, variant: Entity): Fighter | null {
  const base = combatList(project, 'enemies').find((e) => e.id === variant.base)
  if (!base) return null
  const f = fighterOf(base)
  const hm = isNum(variant.hpMult) ? variant.hpMult : 1
  const dm = isNum(variant.damageMult) ? variant.damageMult : 1
  return { ...f, id: variant.id, name: label(variant), hp: f.hp === null ? null : f.hp * hm, damage: f.damage === null ? null : f.damage * dm }
}

/** Resistance of a defender to a damage type, in %; listed weaknesses without a value count as WEAKNESS_RESIST. */
export function resistanceOf(f: Pick<Fighter, 'resistances' | 'weaknesses'>, damageType?: string): number {
  if (!damageType) return 0
  if (isNum(f.resistances[damageType])) return f.resistances[damageType]
  return f.weaknesses.includes(damageType) ? WEAKNESS_RESIST : 0
}

/** Average crit factor from the damage model: 1 + chance × (multiplier − 1). */
export function critFactor(project: Project): number {
  const m = model(project)
  const chance = isNum(m.critChance) ? m.critChance / 100 : 0
  const mult = isNum(m.critMultiplier) ? m.critMultiplier : 1
  return 1 + chance * (mult - 1)
}

export const damageFormula = (project: Project) => String(model(project).damageFormula ?? '').trim() || DEFAULT_DAMAGE_FORMULA

/** Damage of one hit after armor and resistance, from the damage model formula; null when the formula fails. */
export function damagePerHit(project: Project, attack: number, defender: Pick<Fighter, 'armor' | 'resistances' | 'weaknesses'>, damageType?: string): number | null {
  const r = tryEvaluate(damageFormula(project), { attack, armor: defender.armor, resist: resistanceOf(defender, damageType), crit: critFactor(project) })
  return r.ok ? Math.max(0, r.value) : null
}

export const formulaError = (project: Project): string | null => {
  const r = tryEvaluate(damageFormula(project), { attack: 10, armor: 10, resist: 10, crit: 1 })
  return r.ok ? null : r.error
}

// ---------- Multipliers ----------

export type Conditions = { levelId?: string; night?: boolean }

/** Highest "monster strength" of the Time & Weather day phases; 1 when none is set or night strength is off. */
export function nightStrength(project: Project): number {
  if (!model(project).useNightStrength) return 1
  const vals = listOf(project, 'design.timeWeather', 'dayPhases').map((p) => p.monsterStrength).filter(isNum)
  return vals.length ? Math.max(1, ...vals) : 1
}

export const enemyHpMult = (project: Project, c: Conditions) => (c.levelId ? difficultyMultiplier(project, model(project).hpParam, c.levelId) : 1)
export const enemyDamageMult = (project: Project, c: Conditions) =>
  (c.levelId ? difficultyMultiplier(project, model(project).damageParam, c.levelId) : 1) * (c.night ? nightStrength(project) : 1)

// ---------- Loadouts ----------

export type Attack = { source: string; damage: number; damageType?: string; interval: number }

/** Attacks a loadout can make: its weapon, plus each ability whose effect formula evaluates to a number at the loadout's level. */
export function loadoutAttacks(project: Project, loadout: Entity): Attack[] {
  const items = listOf(project, 'design.items', 'items')
  const out: Attack[] = []
  const weapon = items.find((i) => i.id === loadout.weapon)
  if (weapon && isNum(weapon.damage)) out.push({ source: label(weapon), damage: weapon.damage, damageType: weapon.damageType, interval: 1 / (isNum(weapon.attackSpeed) && weapon.attackSpeed > 0 ? weapon.attackSpeed : 1) })
  const level = isNum(loadout.level) ? loadout.level : 1
  for (const a of listOf(project, 'design.player', 'abilities').filter((x) => ids(loadout.abilities).includes(x.id))) {
    const r = String(a.formula ?? '').trim() ? tryEvaluate(String(a.formula), { level }) : null
    if (!r?.ok) continue
    const interval = Math.max(isNum(a.cooldown) ? a.cooldown : 0, isNum(a.castTime) ? a.castTime : 0, 0.1)
    out.push({ source: label(a), damage: r.value, damageType: a.damageType, interval })
  }
  return out
}

/** The loadout as a defender: HP (loadout, else Player Health max, else 100), armor and resistances from its armor items (resist capped at 90%). */
export function loadoutDefense(project: Project, loadout: Entity): Fighter {
  const items = listOf(project, 'design.items', 'items').filter((i) => ids(loadout.armorItems).includes(i.id))
  const health = listOf(project, 'design.player', 'survival').find((s) => s.stat === 'health')
  const hp = isNum(loadout.hp) ? loadout.hp : isNum(health?.max) ? health!.max : DEFAULT_PLAYER_HP
  const resistances: Record<string, number> = {}
  for (const i of items) for (const [t, v] of Object.entries(asMap(i.resistances))) if (isNum(v)) resistances[t] = Math.min(90, (resistances[t] ?? 0) + v)
  return { id: loadout.id, name: label(loadout), hp, damage: null, attackRate: 1, armor: items.reduce((s, i) => s + (isNum(i.armor) ? i.armor : 0), 0), resistances, weaknesses: [] }
}

export type KillResult = { seconds: number; hits: number; perHit: number; dps: number; source: string }

/** How long a loadout takes to kill a fighter with its best attack (no mixing), at a difficulty level. */
export function timeToKill(project: Project, loadout: Entity, target: Fighter, c: Conditions = {}): KillResult | null {
  if (target.hp === null || target.hp <= 0) return null
  const hp = target.hp * enemyHpMult(project, c)
  let best: KillResult | null = null
  for (const a of loadoutAttacks(project, loadout)) {
    const perHit = damagePerHit(project, a.damage, target, a.damageType)
    if (!perHit) continue
    const hits = Math.ceil(hp / perHit)
    const r = { seconds: hits * a.interval, hits, perHit, dps: perHit / a.interval, source: a.source }
    if (!best || r.seconds < best.seconds) best = r
  }
  return best
}

export type DeathResult = { seconds: number; hits: number; perHit: number; dps: number }

/** How long a fighter takes to kill the loadout, at a difficulty level and optionally at night. */
export function timeToDie(project: Project, loadout: Entity, attacker: Fighter, c: Conditions = {}): DeathResult | null {
  if (attacker.damage === null || attacker.damage <= 0) return null
  const def = loadoutDefense(project, loadout)
  const perHit = damagePerHit(project, attacker.damage * enemyDamageMult(project, c), def, attacker.damageType)
  if (!perHit) return null
  const hits = Math.ceil((def.hp ?? DEFAULT_PLAYER_HP) / perHit)
  return { seconds: hits / attacker.attackRate, hits, perHit, dps: perHit * attacker.attackRate }
}

// ---------- Threat ----------

const ROLE_ORDER = ['Starter', 'Early', 'Mid', 'Late', 'Final']

/** Biome role index of an enemy's biome (Starter = 0 … Final = 4), or null without one. */
export function biomeStage(project: Project, e: Entity): number | null {
  const b = listOf(project, 'design.world', 'biomes').find((x) => x.id === e.biome)
  const i = b ? ROLE_ORDER.indexOf(b.role) : -1
  return i >= 0 ? i : null
}

/** One comparable number: damage per second against an unarmored target × HP. */
export const threat = (e: Entity) => {
  const f = fighterOf(e)
  return f.hp !== null && f.damage !== null ? f.damage * f.attackRate * f.hp : null
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

export type ThreatRow = { enemy: Entity; stage: number | null; stageLabel: string; threat: number | null }

export function threatRamp(project: Project) {
  const rows: ThreatRow[] = combatList(project, 'enemies')
    .map((enemy) => {
      const stage = biomeStage(project, enemy)
      return { enemy, stage, stageLabel: stage === null ? 'No biome role' : ROLE_ORDER[stage], threat: threat(enemy) }
    })
    .sort((a, b) => (a.stage ?? 99) - (b.stage ?? 99) || (a.threat ?? 0) - (b.threat ?? 0))
  const medians = new Map<number, number>()
  for (let s = 0; s < ROLE_ORDER.length; s++) {
    const xs = rows.filter((r) => r.stage === s && r.threat !== null).map((r) => r.threat!)
    if (xs.length) medians.set(s, median(xs))
  }
  /** Enemies weaker than the median of an earlier stage. */
  const dips = rows.filter((r) => r.stage !== null && r.threat !== null && [...medians].some(([s, m]) => s < r.stage! && r.threat! < m))
  return { rows, medians, dips }
}

// ---------- Weaknesses ----------

/** Damage types the player can deal: Player abilities and Items weapons with damage. */
export function playerDamageTypes(project: Project): Set<string> {
  const out = new Set<string>()
  for (const a of listOf(project, 'design.player', 'abilities')) if (a.damageType) out.add(a.damageType)
  for (const i of listOf(project, 'design.items', 'items')) if (i.damageType && isNum(i.damage)) out.add(i.damageType)
  return out
}

/** Enemies and bosses resisting at least 100% of every damage type the player can deal. */
export function immuneFighters(project: Project): Entity[] {
  const types = [...playerDamageTypes(project)]
  if (!types.length) return []
  return [...combatList(project, 'enemies'), ...combatList(project, 'bosses')].filter((e) => {
    const f = fighterOf(e)
    return types.every((t) => resistanceOf(f, t) >= 100)
  })
}

export const damageTypes = (project: Project) => catalogItems(project, 'damageTypes')

// ---------- Bosses ----------

export type PhaseCoverage = { phases: Entity[]; gaps: [number, number][]; overlaps: [number, number][]; unset: Entity[] }

/** Phases of a boss ordered from full HP; gaps and overlaps in the 100 → 0 % range. Shared boundaries are fine. */
export function phaseCoverage(project: Project, bossId: string): PhaseCoverage {
  const all = combatList(project, 'phases').filter((p) => p.boss === bossId)
  const unset = all.filter((p) => !isNum(p.hpFrom) || !isNum(p.hpTo))
  const phases = all.filter((p) => isNum(p.hpFrom) && isNum(p.hpTo)).sort((a, b) => b.hpFrom - a.hpFrom)
  const gaps: [number, number][] = []
  const overlaps: [number, number][] = []
  let at = 100
  for (const p of phases) {
    if (p.hpFrom < at) gaps.push([at, p.hpFrom])
    if (p.hpFrom > at) overlaps.push([p.hpFrom, at])
    at = Math.min(at, p.hpTo)
  }
  if (phases.length && at > 0) gaps.push([at, 0])
  return { phases, gaps, overlaps, unset }
}

/** What a boss unlocks: its own links, World biomes that require it, and World progression connections caused by it. */
export function bossGates(project: Project, bossId: string): string[] {
  const boss = combatList(project, 'bosses').find((b) => b.id === bossId)
  const out: string[] = []
  const known = new Map(
    [...listOf(project, 'design.world', 'biomes'), ...listOf(project, 'design.player', 'skills'), ...listOf(project, 'design.items', 'items')].map((e) => [e.id, label(e)]),
  )
  for (const id of ids(boss?.unlockRefs)) out.push(known.get(id) ?? '⚠ missing')
  for (const b of listOf(project, 'design.world', 'biomes')) if (ids(b.entryBosses).includes(bossId)) out.push(`${label(b)} (entry)`)
  const g = project.documents['design.world']?.data.progression
  for (const e of Array.isArray(g?.edges) ? g.edges : []) if (e.refId === bossId) out.push(`progression: ${e.kind ?? 'unlock'}`)
  return [...new Set(out)]
}

// ---------- Checks used by hints ----------

export function enemiesWithoutLoot(project: Project): Entity[] {
  const sourced = new Set(listOf(project, 'design.items', 'loot').flatMap((t) => ids(t.sources)))
  return [...combatList(project, 'enemies'), ...combatList(project, 'bosses')].filter((e) => !sourced.has(e.id))
}

export const enemyBasicsMissing = (project: Project) =>
  combatList(project, 'enemies').filter((e) => !e.biome || !isNum(e.hp) || !isNum(e.damage) || (isNum(e.damage) && e.damage > 0 && !isNum(e.attackRate)))

export const variantProblems = (project: Project) =>
  combatList(project, 'variants').filter((v) => !v.base || !ids(v.when).length || (!isNum(v.hpMult) && !isNum(v.damageMult)))

export const statusProblems = (project: Project) =>
  combatList(project, 'statusEffects').filter((s) => !isNum(s.duration) || (isNum(s.tickDamage) && s.tickDamage > 0 && !isNum(s.tickInterval)))

export function phaseProblems(project: Project) {
  return combatList(project, 'bosses')
    .map((b) => {
      const c = phaseCoverage(project, b.id)
      const problems = [
        ...(c.phases.length === 0 && c.unset.length === 0 ? ['no phases'] : []),
        ...c.gaps.map(([a, z]) => `gap ${a}–${z}%`),
        ...c.overlaps.map(([a, z]) => `overlap ${z}–${a}%`),
        ...(c.unset.length ? [`${c.unset.length} phase(s) without HP range`] : []),
        ...(c.phases.some((p) => !String(p.mechanics ?? '').trim()) ? ['a phase without mechanics'] : []),
      ]
      return { boss: b, problems }
    })
    .filter((x) => x.problems.length)
}
