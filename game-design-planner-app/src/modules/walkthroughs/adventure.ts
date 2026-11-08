import type { GenrePack } from '../../core/walkthrough/types'
import { actsStep, castStep, filledRule as filled, questsStep } from './shared'

/** Adventure / narrative: story, characters and exploration first. */
export const ADVENTURE_PACK: GenrePack = {
  id: 'adventure',
  version: 1,
  chapters: [
    { id: 'adv.story', phase: 'systems', title: 'Story foundation' },
    { id: 'adv.scenes', phase: 'content', title: 'Scenes, characters and choices' },
  ],
  notes: {
    'concept.pitch': ['Name the emotional hook: what the player should feel by the end.'],
    'content.screens': ['Dialogue, journal and inventory screens carry a narrative game; design them early.'],
  },
  // Many narrative games have no difficulty settings; the step stays if another selected genre needs it.
  remove: ['systems.difficulty'],
  insert: [
    {
      after: 'systems.world',
      steps: [
        {
          id: 'adv.premise',
          kind: 'decide',
          phase: 'systems',
          chapter: 'adv.story',
          title: 'Write the story premise',
          body: 'The setting, the protagonist’s situation and the central conflict, in a paragraph.',
          target: { docId: 'design.story', section: 'overview' },
          done: filled('design.story', 'overview'),
          aiPrompt: 'Help me turn my pitch into a story premise with a clear central conflict.',
        },
        {
          id: 'story.structure',
          kind: 'decide',
          phase: 'systems',
          chapter: 'adv.story',
          title: 'Choose the story structure',
          body: 'Linear, branching or open: the structure decides how scenes, choices and endings are built.',
          target: { docId: 'design.story', section: 'structure' },
          done: filled('design.story', 'structure'),
        },
        {
          id: 'adv.dialogue',
          kind: 'decide',
          phase: 'systems',
          chapter: 'adv.story',
          title: 'Define the dialogue style',
          body: 'How characters speak, how long lines are and how choices are presented.',
          target: { docId: 'design.story', section: 'dialogue' },
          done: filled('design.story', 'dialogue'),
        },
      ],
    },
    {
      after: 'content.places',
      steps: [
        actsStep({ chapter: 'adv.scenes' }),
        castStep({ chapter: 'adv.scenes', min: 4, tips: ['Every major character should want something that conflicts with someone else.'] }),
        questsStep({ chapter: 'adv.scenes', tips: ['In adventures, quests are scenes and puzzles: note what the player learns in each.'] }),
        {
          id: 'adv.choices',
          kind: 'build',
          phase: 'content',
          chapter: 'adv.scenes',
          title: 'Design meaningful choices',
          body: 'Which decisions change the story and how players see the consequences.',
          examples: [{ docId: 'design.story', exampleId: 'branch' }],
          target: { docId: 'design.story', section: 'choices' },
          done: filled('design.story', 'choices', 2),
        },
        {
          id: 'adv.endings',
          kind: 'decide',
          phase: 'content',
          chapter: 'adv.scenes',
          title: 'Write the endings',
          body: 'How the story can end and which choices lead there. Endings make choices feel worth it.',
          target: { docId: 'design.story', section: 'endings' },
          done: filled('design.story', 'endings'),
        },
        {
          id: 'adv.keyItems',
          kind: 'build',
          phase: 'content',
          chapter: 'adv.scenes',
          title: 'List key items and puzzles',
          body: 'Items that open paths or solve puzzles, and where they are found.',
          target: { docId: 'design.items', section: 'items' },
          done: filled('design.items', 'items', 3),
          optional: true,
        },
        {
          id: 'adv.review',
          kind: 'review',
          phase: 'content',
          chapter: 'adv.scenes',
          title: 'Check the story flows',
          body: 'Every scene reachable, no quest loops, acts in order, endings reachable and pacing balanced. Finishes when those checks pass.',
          target: { docId: 'design.story', section: 'questGraph' },
          done: {
            kind: 'all',
            rules: [filled('design.story', 'quests'), filled('design.story', 'endings'), { kind: 'hintsClear', ruleIds: ['story.unreachable', 'story.questCycle', 'story.actOrder', 'story.endings', 'story.pacing'] }],
          },
        },
      ],
    },
  ],
}
