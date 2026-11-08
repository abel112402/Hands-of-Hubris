import type { GenrePack } from '../../core/walkthrough/types'
import { abilitiesStep, bossesStep, damageStep, enemiesStep, filledRule as filled } from './shared'

/** Action: reflexes, tight controls and readable combat. */
export const ACTION_PACK: GenrePack = {
  id: 'action',
  version: 1,
  chapters: [
    { id: 'action.feel', phase: 'systems', title: 'Game feel' },
    { id: 'action.encounters', phase: 'content', title: 'Encounters' },
  ],
  notes: {
    'concept.loop': ['The minute loop is a fight: read the threat → position → act → see the result. It must feel good with placeholder art.'],
    'systems.controls': ['Write the response you expect for each input; action games live or die by how quickly input becomes motion.'],
    'systems.difficulty': ['Difficulty presets decide who can finish the game; consider assist options as well as harder modes.'],
  },
  replace: { 'systems.difficulty': { optional: false } },
  insert: [
    {
      after: 'systems.controls',
      steps: [
        {
          id: 'action.moves',
          kind: 'build',
          phase: 'systems',
          chapter: 'action.feel',
          title: 'List the player actions',
          body: 'Attack, dodge, block, jump…: every action with its timing and purpose. Fewer, deeper actions beat many shallow ones.',
          target: { docId: 'design.player', section: 'actions' },
          done: filled('design.player', 'actions', 4),
        },
        abilitiesStep({ chapter: 'action.feel', min: 2, tips: ['Give each ability a clear counter-play moment, not just more damage.'] }),
        damageStep({ chapter: 'action.feel' }),
        {
          id: 'action.status',
          kind: 'decide',
          phase: 'systems',
          chapter: 'action.feel',
          title: 'Add status effects',
          body: 'Stun, burn, slow…: status effects create combos and reasons to switch tactics.',
          examples: [{ docId: 'design.combat', exampleId: 'status-set' }],
          target: { docId: 'design.combat', section: 'statusEffects' },
          done: filled('design.combat', 'statusEffects', 2),
          optional: true,
        },
        {
          id: 'action.hud',
          kind: 'decide',
          phase: 'systems',
          chapter: 'action.feel',
          title: 'Lay out the HUD',
          body: 'What the player must read mid-fight and where it sits. Anything that needs a glance away from the action costs reaction time.',
          examples: [{ docId: 'design.ui', exampleId: 'hud-template' }],
          target: { docId: 'design.ui', section: 'hud' },
          done: filled('design.ui', 'hud'),
        },
        {
          id: 'action.inputMap',
          kind: 'build',
          phase: 'systems',
          chapter: 'action.feel',
          title: 'Map the inputs',
          body: 'Keyboard and controller bindings without conflicts, with the most used actions on the easiest inputs.',
          examples: [{ docId: 'design.ui', exampleId: 'controls-kbm' }, { docId: 'design.ui', exampleId: 'controls-pad' }],
          target: { docId: 'design.ui', section: 'controls' },
          done: filled('design.ui', 'controls', 4),
        },
      ],
    },
    {
      after: 'content.places',
      steps: [
        enemiesStep({ chapter: 'action.encounters', tips: ['Give every enemy a readable wind-up: fair attacks can be learned.'] }),
        bossesStep({ chapter: 'action.encounters' }),
        {
          id: 'action.review',
          kind: 'review',
          phase: 'content',
          chapter: 'action.encounters',
          title: 'Check fights are fair and readable',
          body: 'Time-to-kill in range, a rising threat curve, complete enemies, a HUD that covers what matters and no control conflicts. Finishes when those checks pass.',
          target: { docId: 'design.combat', section: 'enemies' },
          done: {
            kind: 'all',
            rules: [filled('design.combat', 'enemies'), filled('design.ui', 'controls'), { kind: 'hintsClear', ruleIds: ['combat.ttk', 'combat.threatRamp', 'combat.enemyBasics', 'ui.hudCoverage', 'ui.controlConflicts'] }],
          },
        },
      ],
    },
  ],
}
