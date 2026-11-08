/**
 * Steps several genres share. Packs use the same step ID, so with two genres selected the step
 * appears once: the first selected genre's wording wins and the other genre's tips become notes.
 * Each builder takes the pack's chapter and genre-specific tips.
 */
import type { DoneRule, I18nText, PhaseId, WalkStep } from '../../core/walkthrough/types'

/** `phase` overrides the builder's default when the pack places the step in another phase's chapter. */
type Opts = { chapter: string; phase?: PhaseId; tips?: I18nText[]; min?: number; optional?: boolean }

const filled = (docId: string, section: string, min?: number): DoneRule => ({ kind: 'sectionFilled', docId, section, ...(min ? { min } : {}) })

const make = (base: Omit<WalkStep, 'chapter' | 'tips' | 'optional' | 'done'> & { done: (min?: number) => DoneRule; defaultMin?: number }) =>
  ({ chapter, phase, tips, min, optional }: Opts): WalkStep => {
    const { done, defaultMin, ...rest } = base
    return { ...rest, ...(phase ? { phase } : {}), chapter, done: done(min ?? defaultMin), ...(tips ? { tips } : {}), ...(optional ? { optional } : {}) }
  }

export const filledRule = filled

// ---------- Player and progression ----------

export const levelingStep = make({
  id: 'player.leveling',
  kind: 'decide',
  phase: 'systems',
  title: 'Shape the progression curve',
  body: 'How fast the character grows: the XP curve, the level cap and what each level gives. The curve sets the pace of the whole game.',
  examples: [
    { docId: 'design.player', exampleId: 'xp-poly' },
    { docId: 'design.player', exampleId: 'xp-exp' },
    { docId: 'design.player', exampleId: 'xp-plateau' },
  ],
  target: { docId: 'design.player', section: 'leveling' },
  done: () => filled('design.player', 'leveling'),
  aiPrompt: 'Which XP curve fits my game length and session length? Explain the trade-offs.',
})

export const skillsStep = make({
  id: 'player.skills',
  kind: 'build',
  phase: 'systems',
  title: 'Sketch the skill trees',
  body: 'Which builds exist and how players choose between them. A good tree offers real choices, not one obvious best path.',
  examples: [{ docId: 'design.player', exampleId: 'tree-3x3' }, { docId: 'design.player', exampleId: 'tree-linear' }],
  target: { docId: 'design.player', section: 'skills' },
  done: (min) => filled('design.player', 'skills', min),
  defaultMin: 5,
})

export const abilitiesStep = make({
  id: 'player.abilities',
  kind: 'build',
  phase: 'systems',
  title: 'Design the abilities',
  body: 'Active abilities with cost, cooldown and purpose. Each ability should answer a situation the player meets.',
  target: { docId: 'design.player', section: 'abilities' },
  done: (min) => filled('design.player', 'abilities', min),
  defaultMin: 3,
})

// ---------- Items and crafting ----------

export const itemsStep = make({
  id: 'items.list',
  kind: 'build',
  phase: 'content',
  title: 'List the items',
  body: 'Every item with its type, value and where it comes from. Items without a source or a use are wasted content.',
  examples: [{ docId: 'design.items', exampleId: 'types-default' }],
  target: { docId: 'design.items', section: 'items' },
  done: (min) => filled('design.items', 'items', min),
  defaultMin: 8,
})

export const rarityStep = make({
  id: 'items.rarity',
  kind: 'decide',
  phase: 'content',
  title: 'Define rarity tiers',
  body: 'How many tiers, how rare each is and how much stronger. Rarity is the promise that the next drop could be better.',
  examples: [{ docId: 'design.items', exampleId: 'mult-linear' }, { docId: 'design.items', exampleId: 'mult-steep' }],
  target: { docId: 'design.items', section: 'rarityTiers' },
  done: (min) => filled('design.items', 'rarityTiers', min),
  defaultMin: 3,
})

export const recipesStep = make({
  id: 'craft.recipes',
  kind: 'build',
  phase: 'content',
  title: 'Chain gathering into crafting',
  body: 'Stations and recipes that turn raw materials into tools, gear and buildings. Each recipe should open something new, not just a bigger number.',
  examples: [{ docId: 'design.items', exampleId: 'chain-starter' }],
  target: { docId: 'design.items', section: 'recipes' },
  done: (min) => ({ kind: 'all', rules: [filled('design.items', 'stations'), filled('design.items', 'recipes', min)] }),
  defaultMin: 5,
})

export const lootStep = make({
  id: 'loot.tables',
  kind: 'build',
  phase: 'content',
  title: 'Design loot tables',
  body: 'What drops where and how often. Loot tables are where rarity, enemies and progression meet.',
  examples: [
    { docId: 'design.items', exampleId: 'loot-trash' },
    { docId: 'design.items', exampleId: 'loot-elite' },
    { docId: 'design.items', exampleId: 'loot-boss' },
  ],
  target: { docId: 'design.items', section: 'loot' },
  done: (min) => filled('design.items', 'loot', min),
  defaultMin: 2,
})

// ---------- Combat ----------

export const enemiesStep = make({
  id: 'combat.enemies',
  kind: 'build',
  phase: 'content',
  title: 'Build the enemy roster',
  body: 'Enemy roles, what each one tests and where it appears. Variety in what enemies ask of the player matters more than their number.',
  examples: [{ docId: 'design.combat', exampleId: 'roster' }],
  target: { docId: 'design.combat', section: 'enemies' },
  done: (min) => filled('design.combat', 'enemies', min),
  defaultMin: 5,
  aiPrompt: 'Suggest an enemy roster where each enemy tests a different player skill.',
})

export const damageStep = make({
  id: 'combat.damage',
  kind: 'decide',
  phase: 'systems',
  title: 'Pick the damage model',
  body: 'How attack, defence and resistances combine into damage. The formula decides how fights feel at every level.',
  examples: [
    { docId: 'design.combat', exampleId: 'formula-diminishing' },
    { docId: 'design.combat', exampleId: 'formula-flat' },
    { docId: 'design.combat', exampleId: 'formula-percent' },
  ],
  target: { docId: 'design.combat', section: 'damageModel' },
  done: () => filled('design.combat', 'damageModel'),
})

export const bossesStep = make({
  id: 'combat.bosses',
  kind: 'build',
  phase: 'content',
  title: 'Design the bosses and their phases',
  body: 'Bosses are exams for what the player learned. Each phase should change what the player must do, not only add health.',
  examples: [
    { docId: 'design.combat', exampleId: 'phases-three' },
    { docId: 'design.combat', exampleId: 'phases-enrage' },
    { docId: 'design.combat', exampleId: 'phases-adds' },
  ],
  target: { docId: 'design.combat', section: 'bosses' },
  done: (min) => ({ kind: 'all', rules: [filled('design.combat', 'bosses', min), filled('design.combat', 'phases', 2)] }),
  defaultMin: 1,
})

// ---------- Story ----------

export const actsStep = make({
  id: 'story.acts',
  kind: 'decide',
  phase: 'content',
  title: 'Lay out the acts',
  body: 'The big beats of the story and what changes for the player in each. Acts pace the story against the game length.',
  examples: [{ docId: 'design.story', exampleId: 'acts-three' }, { docId: 'design.story', exampleId: 'acts-five' }],
  target: { docId: 'design.story', section: 'acts' },
  done: (min) => filled('design.story', 'acts', min),
  defaultMin: 3,
})

export const castStep = make({
  id: 'story.cast',
  kind: 'build',
  phase: 'content',
  title: 'Introduce the main characters',
  body: 'Who the player meets, what they want and how they change. Characters with their own goals make the world feel alive.',
  examples: [{ docId: 'design.story', exampleId: 'cast-starter' }],
  target: { docId: 'design.story', section: 'characters' },
  done: (min) => filled('design.story', 'characters', min),
  defaultMin: 3,
})

export const questsStep = make({
  id: 'story.quests',
  kind: 'build',
  phase: 'content',
  title: 'Plan the quests',
  body: 'The main questline first, then side quests. Each quest needs a goal, a reason to care and a reward that fits.',
  examples: [{ docId: 'design.story', exampleId: 'main-questline' }, { docId: 'design.story', exampleId: 'tavern-jobs' }],
  target: { docId: 'design.story', section: 'quests' },
  done: (min) => filled('design.story', 'quests', min),
  defaultMin: 5,
})

// ---------- Town, economy, time ----------

export const buildingsStep = make({
  id: 'town.buildings',
  kind: 'build',
  phase: 'systems',
  title: 'List the buildings',
  body: 'What each building produces, needs and unlocks. Buildings are the backbone of any base or settlement.',
  examples: [{ docId: 'design.town', exampleId: 'town-production-chain' }],
  target: { docId: 'design.town', section: 'buildings' },
  done: (min) => filled('design.town', 'buildings', min),
  defaultMin: 3,
})

export const flowsStep = make({
  id: 'trade.flows',
  kind: 'decide',
  phase: 'systems',
  title: 'Map resource sources and sinks',
  body: 'Where money and resources come from and where they leave the game. Without sinks the economy inflates; without sources it starves.',
  examples: [{ docId: 'design.trade', exampleId: 'flows-lean' }, { docId: 'design.trade', exampleId: 'flows-trader' }],
  target: { docId: 'design.trade', section: 'flows' },
  done: (min) => filled('design.trade', 'flows', min),
  defaultMin: 3,
})

export const dayCycleStep = make({
  id: 'time.dayCycle',
  kind: 'decide',
  phase: 'systems',
  title: 'Design the day and night cycle',
  body: 'How long a day is and what each part of it changes. Time is a free source of rhythm and tension.',
  examples: [{ docId: 'design.timeWeather', exampleId: 'day-four' }, { docId: 'design.timeWeather', exampleId: 'day-long-night' }],
  target: { docId: 'design.timeWeather', section: 'dayPhases' },
  done: (min) => ({ kind: 'all', rules: [filled('design.timeWeather', 'time'), filled('design.timeWeather', 'dayPhases', min)] }),
  defaultMin: 2,
})
