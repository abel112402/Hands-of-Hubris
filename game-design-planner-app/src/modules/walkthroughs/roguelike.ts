import type { GenrePack } from '../../core/walkthrough/types'
import { bossesStep, enemiesStep, filledRule as filled, itemsStep, levelingStep, lootStep, rarityStep } from './shared'

/** Roguelike / roguelite: short runs, randomness and meta progression. */
export const ROGUELIKE_PACK: GenrePack = {
  id: 'roguelike',
  version: 1,
  chapters: [
    { id: 'rogue.runs', phase: 'systems', title: 'Runs and meta progression' },
    { id: 'rogue.content', phase: 'content', title: 'Run content' },
  ],
  notes: {
    'concept.loop': ['A roguelike has two loops: the run (minutes to an hour) and the meta loop across runs. Describe both.'],
    'content.places': ['For generated levels, describe the rules (size, rooms, hazards) rather than fixed layouts.'],
    'ship.balance': ['Set target win rates and run lengths per difficulty; randomness needs measured balance.'],
  },
  insert: [
    {
      after: 'systems.progression',
      steps: [
        {
          id: 'rogue.run',
          kind: 'decide',
          phase: 'systems',
          chapter: 'rogue.runs',
          title: 'Define a run',
          body: 'How a run starts, how long it lasts, what ends it and what the player keeps. The run is the unit everything else is tuned around.',
          target: { docId: 'design.coreLoop', section: 'loops' },
          done: filled('design.coreLoop', 'loops', 3),
          aiPrompt: 'Help me define a run for my roguelike: length, structure, what ends it and what carries over.',
        },
        levelingStep({ chapter: 'rogue.runs', tips: ['Split run progression (resets) from meta progression (kept); meta should widen options more than raw power.'] }),
        {
          id: 'rogue.escalation',
          kind: 'decide',
          phase: 'systems',
          chapter: 'rogue.runs',
          title: 'Decide what escalates during a run',
          body: 'Enemy strength, density, hazards: which values rise per floor or loop, and how fast.',
          target: { docId: 'design.difficulty', section: 'params' },
          done: filled('design.difficulty', 'params', 2),
        },
      ],
    },
    {
      after: 'content.places',
      steps: [
        enemiesStep({ chapter: 'rogue.content', min: 6, tips: ['Enemies should combine: design pairs that are harder together than apart.'] }),
        bossesStep({ chapter: 'rogue.content' }),
        rarityStep({ chapter: 'rogue.content' }),
        itemsStep({ chapter: 'rogue.content', min: 15, tips: ['Aim for items that change how you play (synergies) over flat stat boosts.'] }),
        lootStep({ chapter: 'rogue.content', min: 3 }),
        {
          id: 'rogue.review',
          kind: 'review',
          phase: 'content',
          chapter: 'rogue.content',
          title: 'Check runs escalate fairly',
          body: 'Loot tables in use, time-to-kill in range and a threat that rises across the run. Finishes when those checks pass.',
          target: { docId: 'design.combat', section: 'enemies' },
          done: { kind: 'all', rules: [filled('design.items', 'loot'), filled('design.combat', 'enemies'), { kind: 'hintsClear', ruleIds: ['items.loot', 'combat.ttk', 'combat.threatRamp'] }] },
        },
      ],
    },
    {
      after: 'ship.balance',
      steps: [
        {
          id: 'rogue.metrics',
          kind: 'decide',
          phase: 'ship',
          chapter: 'quality',
          title: 'Choose what to measure in playtests',
          body: 'Win rate, run length, item pick rates, cause of death: the numbers that show whether randomness is fair.',
          target: { docId: 'qa.balance', section: 'metrics' },
          done: filled('qa.balance', 'metrics', 3),
        },
      ],
    },
  ],
}
