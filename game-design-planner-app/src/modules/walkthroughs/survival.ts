import type { GenrePack } from '../../core/walkthrough/types'
import { dayCycleStep, enemiesStep, filledRule as filled, itemsStep, recipesStep } from './shared'

/** Survival: needs, scarcity and a world that gets more dangerous over time. */
export const SURVIVAL_PACK: GenrePack = {
  id: 'survival',
  version: 1,
  chapters: [
    { id: 'survival.pressure', phase: 'systems', title: 'Survival pressure' },
    { id: 'survival.world', phase: 'content', title: 'A hostile world' },
  ],
  notes: {
    'concept.pillars': ['Make the pressure a pillar, e.g. "Every night is a threat" or "Nothing lasts forever".'],
    'concept.loop': ['The classic survival loop: gather → craft → prepare → survive the threat → expand.'],
    'systems.challenge': ['Decide whether death is a setback (lose items) or a restart (lose the world). It sets how careful players are.'],
    'content.places': ['Order places by danger: each new area should demand gear or knowledge from the previous one.'],
  },
  insert: [
    {
      after: 'systems.controls',
      steps: [
        {
          id: 'survival.needs',
          kind: 'decide',
          phase: 'systems',
          chapter: 'survival.pressure',
          title: 'Define the survival needs',
          body: 'Which needs drain (hunger, warmth, thirst, sanity…), how fast, and what happens at zero. Needs are the clock that keeps the player moving.',
          tips: ['Two or three needs are plenty; each one must change what the player does, not just add upkeep.'],
          examples: [
            { docId: 'design.player', exampleId: 'survival-forgiving' },
            { docId: 'design.player', exampleId: 'survival-standard' },
            { docId: 'design.player', exampleId: 'survival-harsh' },
          ],
          target: { docId: 'design.player', section: 'survival' },
          done: filled('design.player', 'survival', 2),
          aiPrompt: 'Which survival needs fit my pitch, and how fast should each drain?',
        },
        {
          id: 'survival.death',
          kind: 'decide',
          phase: 'systems',
          chapter: 'survival.pressure',
          title: 'Decide what death costs',
          body: 'Lost items, lost progress or a new character: the cost of death is the stake behind every risk the player takes.',
          target: { docId: 'design.player', section: 'death' },
          done: filled('design.player', 'death'),
        },
      ],
    },
    {
      after: 'systems.world',
      steps: [
        dayCycleStep({ chapter: 'survival.pressure', tips: ['Make the night more dangerous than the day, so players plan around it.'] }),
        {
          id: 'survival.weather',
          kind: 'decide',
          phase: 'systems',
          chapter: 'survival.pressure',
          title: 'Add weather that matters',
          body: 'Weather that changes needs, visibility or travel turns the same place into a different challenge.',
          examples: [{ docId: 'design.timeWeather', exampleId: 'weather-set' }],
          target: { docId: 'design.timeWeather', section: 'weather' },
          done: filled('design.timeWeather', 'weather', 2),
          optional: true,
        },
        {
          id: 'survival.pressureReview',
          kind: 'review',
          phase: 'systems',
          chapter: 'survival.pressure',
          title: 'Check the pressure is fair',
          body: 'Every need must have a way to refill it, drain at a sensible pace, and the night must really be harder. Finishes when those checks pass.',
          target: { docId: 'design.player', section: 'survival' },
          done: {
            kind: 'all',
            rules: [filled('design.player', 'survival'), filled('design.timeWeather', 'dayPhases'), { kind: 'hintsClear', ruleIds: ['player.survivalRestore', 'player.survivalPace', 'time.nightHarder'] }],
          },
        },
      ],
    },
    {
      after: 'content.places',
      steps: [
        itemsStep({ chapter: 'survival.world', min: 8, tips: ['Start with what can be gathered in the first area: wood, stone, food, water.'] }),
        recipesStep({ chapter: 'survival.world', tips: ['First recipes should answer the first threat: a fire, a shelter, a weapon.'] }),
        enemiesStep({ chapter: 'survival.world', min: 3, tips: ['Include threats that are better avoided than fought; survival is not only combat.'] }),
        {
          id: 'survival.shelter',
          kind: 'decide',
          phase: 'content',
          chapter: 'survival.world',
          title: 'Plan bases and shelters',
          body: 'Where the player is safe, what a base protects and whether it can be attacked.',
          examples: [{ docId: 'design.town', exampleId: 'town-hub-outpost' }],
          target: { docId: 'design.town', section: 'bases' },
          done: filled('design.town', 'bases'),
          optional: true,
        },
        {
          id: 'survival.contentReview',
          kind: 'review',
          phase: 'content',
          chapter: 'survival.world',
          title: 'Check every item has a source and a use',
          body: 'Scarcity only works if the player can find what they need. Finishes when no item lacks a source or a use.',
          target: { docId: 'design.items', section: 'items' },
          done: { kind: 'all', rules: [filled('design.items', 'items'), filled('design.items', 'recipes'), { kind: 'hintsClear', ruleIds: ['items.noSource', 'items.unused'] }] },
        },
      ],
    },
  ],
}
