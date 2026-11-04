import {
  bossGates,
  combatList,
  COMBAT_DOC as DOC,
  enemiesWithoutLoot,
  enemyBasicsMissing,
  fighterOf,
  formulaError,
  immuneFighters,
  phaseProblems,
  statusProblems,
  threatRamp,
  timeToDie,
  timeToKill,
  variantProblems,
} from '../../combat'
import { comparedLevels } from '../../player'
import type { Hint, HintRule } from '../types'
import { hintId, isDocEmpty, shortList } from '../util'

/** Fight lengths outside these bounds (seconds, first loadout, middle difficulty) are flagged for review. */
export const TTK_BOUNDS = { minKill: 1, maxKill: 60, minDie: 3 }

type Draft = Omit<Hint, 'id' | 'scope' | 'target' | 'titleKey' | 'bodyKey'> & { key: string; sectionId: string; entityId?: string }

const hint = (d: Draft): Hint => ({
  id: hintId(d.ruleId, d.entityId),
  ruleId: d.ruleId,
  severity: d.severity,
  scope: d.entityId ? 'entity' : 'section',
  target: { docId: DOC, sectionId: d.sectionId, entityId: d.entityId },
  titleKey: `hints.${d.key}.title`,
  bodyKey: `hints.${d.key}.body`,
  params: d.params,
  action: d.action ?? { kind: 'goto', docId: DOC, sectionId: d.sectionId },
})

const active = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && !isDocEmpty(project, DOC),
  evaluate,
})

const names = (l: Record<string, any>[]) => shortList(l.map((x) => String(x.name ?? '') || '(unnamed)'))
const r1 = (n: number) => Math.round(n * 10) / 10

/** Advisory combat checks: fight pacing and coverage are design choices, so nothing exceeds 'suggest'. */
export const combatRules: HintRule[] = [
  active('combat.enemyBasics', ({ project }) => {
    const rows = enemyBasicsMissing(project)
    return rows.length ? [hint({ key: 'combatEnemyBasics', ruleId: 'combat.enemyBasics', severity: 'suggest', sectionId: 'enemies', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('combat.ttk', ({ project }) => {
    const loadout = combatList(project, 'loadouts')[0]
    if (!loadout) return []
    const levels = comparedLevels(project)
    const mid = levels[Math.floor((levels.length - 1) / 2)]
    const c = { levelId: mid.id || undefined }
    const odd: string[] = []
    for (const e of [...combatList(project, 'enemies'), ...combatList(project, 'bosses')]) {
      const f = fighterOf(e)
      const kill = timeToKill(project, loadout, f, c)
      const die = timeToDie(project, loadout, f, c)
      if (kill && kill.seconds > TTK_BOUNDS.maxKill) odd.push(`${f.name}: ${r1(kill.seconds)} s to kill`)
      else if (kill && kill.seconds < TTK_BOUNDS.minKill) odd.push(`${f.name}: dies in ${r1(kill.seconds)} s`)
      if (die && die.seconds < TTK_BOUNDS.minDie) odd.push(`${f.name}: kills the player in ${r1(die.seconds)} s`)
    }
    return odd.length
      ? [hint({ key: 'combatTtk', ruleId: 'combat.ttk', severity: 'info', sectionId: 'loadouts', params: { loadout: String(loadout.name ?? ''), level: mid.label, names: shortList(odd, 3) } })]
      : []
  }),
  active('combat.threatRamp', ({ project }) => {
    const dips = threatRamp(project).dips
    return dips.length ? [hint({ key: 'combatThreatRamp', ruleId: 'combat.threatRamp', severity: 'info', sectionId: 'enemies', entityId: dips[0].enemy.id, params: { names: shortList(dips.map((d) => `${d.enemy.name} (${d.stageLabel})`)) } })] : []
  }),
  active('combat.immune', ({ project }) => {
    const rows = immuneFighters(project)
    return rows.length ? [hint({ key: 'combatImmune', ruleId: 'combat.immune', severity: 'suggest', sectionId: 'enemies', entityId: rows[0].id, params: { names: names(rows) } })] : []
  }),
  active('combat.noLoot', ({ project }) => {
    const rows = enemiesWithoutLoot(project)
    return rows.length
      ? [hint({ key: 'combatNoLoot', ruleId: 'combat.noLoot', severity: 'info', sectionId: 'enemies', params: { count: rows.length, names: names(rows) }, action: { kind: 'goto', docId: 'design.items', sectionId: 'loot' } })]
      : []
  }),
  active('combat.phases', ({ project }) => {
    const rows = phaseProblems(project)
    return rows.length
      ? [hint({ key: 'combatPhases', ruleId: 'combat.phases', severity: 'suggest', sectionId: 'phases', params: { names: shortList(rows.map((r) => `${r.boss.name}: ${r.problems.join(', ')}`), 2) } })]
      : []
  }),
  active('combat.bossGates', ({ project }) => {
    const rows = combatList(project, 'bosses').filter((b) => bossGates(project, b.id).length === 0)
    return rows.length ? [hint({ key: 'combatBossGates', ruleId: 'combat.bossGates', severity: 'info', sectionId: 'bosses', entityId: rows[0].id, params: { names: names(rows) } })] : []
  }),
  active('combat.variants', ({ project }) => {
    const rows = variantProblems(project)
    return rows.length ? [hint({ key: 'combatVariants', ruleId: 'combat.variants', severity: 'suggest', sectionId: 'variants', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('combat.status', ({ project }) => {
    const rows = statusProblems(project)
    return rows.length ? [hint({ key: 'combatStatus', ruleId: 'combat.status', severity: 'info', sectionId: 'statusEffects', entityId: rows[0].id, params: { count: rows.length, names: names(rows) } })] : []
  }),
  active('combat.formula', ({ project }) => {
    const err = formulaError(project)
    return err ? [hint({ key: 'combatFormula', ruleId: 'combat.formula', severity: 'suggest', sectionId: 'damageModel', params: { error: err } })] : []
  }),
]
