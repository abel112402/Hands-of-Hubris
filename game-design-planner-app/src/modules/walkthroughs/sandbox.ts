import type { GenrePack } from '../../core/walkthrough/types'
import { buildingsStep, dayCycleStep, filledRule as filled, recipesStep } from './shared'

/** Sandbox / crafting: player-driven goals and building. */
export const SANDBOX_PACK: GenrePack = {
  id: 'sandbox',
  version: 1,
  chapters: [
    { id: 'sandbox.build', phase: 'systems', title: 'Building and crafting' },
    { id: 'sandbox.mods', phase: 'production', title: 'Data and modding' },
  ],
  notes: {
    'concept.pillars': ['Include a pillar about player expression, e.g. "Anything you see, you can build".'],
    'systems.progression': ['Sandbox progression is often self-directed: new tools and materials, not levels.'],
  },
  insert: [
    {
      after: 'systems.world',
      steps: [
        {
          id: 'sandbox.map',
          kind: 'build',
          phase: 'systems',
          chapter: 'sandbox.build',
          title: 'Sketch the world map',
          body: 'Rough layout of regions and what each offers. A world worth shaping needs variety to build in.',
          target: { docId: 'design.world', section: 'map' },
          done: filled('design.world', 'map'),
          optional: true,
        },
        {
          id: 'sandbox.materials',
          kind: 'decide',
          phase: 'systems',
          chapter: 'sandbox.build',
          title: 'Define material and item types',
          body: 'The categories everything is made of. Clear types make recipes and building rules readable.',
          examples: [{ docId: 'design.items', exampleId: 'types-default' }],
          target: { docId: 'design.items', section: 'types' },
          done: filled('design.items', 'types', 3),
        },
        recipesStep({ chapter: 'sandbox.build', phase: 'systems', tips: ['Prefer recipes that unlock new building pieces or tools over stronger copies.'] }),
        buildingsStep({ chapter: 'sandbox.build', tips: ['Separate building pieces (walls, floors) from functional buildings (stations, storage).'] }),
        dayCycleStep({ chapter: 'sandbox.build', optional: true, tips: ['Cycles make the world feel alive even without threats.'] }),
        {
          id: 'sandbox.review',
          kind: 'review',
          phase: 'systems',
          chapter: 'sandbox.build',
          title: 'Check the crafting web',
          body: 'Every material obtainable and used, recipes shaped sensibly. Finishes when those checks pass.',
          target: { docId: 'design.items', section: 'recipes' },
          done: { kind: 'all', rules: [filled('design.items', 'recipes'), { kind: 'hintsClear', ruleIds: ['items.noSource', 'items.unused', 'items.recipeShape'] }] },
        },
      ],
    },
    {
      after: 'production.stack',
      steps: [
        {
          id: 'sandbox.data',
          kind: 'decide',
          phase: 'production',
          chapter: 'sandbox.mods',
          title: 'Make content data-driven',
          body: 'Items, recipes and buildings defined in data files, not code, so content can grow without programmers.',
          target: { docId: 'technical.dataDriven', section: 'principle' },
          done: filled('technical.dataDriven', 'principle'),
        },
        {
          id: 'sandbox.formats',
          kind: 'decide',
          phase: 'production',
          chapter: 'sandbox.mods',
          title: 'Choose the data formats',
          body: 'Which file formats hold which content, and how they reference each other.',
          examples: [{ docId: 'technical.dataDriven', exampleId: 'data-unity-formats' }],
          target: { docId: 'technical.dataDriven', section: 'formats' },
          done: filled('technical.dataDriven', 'formats'),
        },
        {
          id: 'sandbox.modding',
          kind: 'decide',
          phase: 'production',
          chapter: 'sandbox.mods',
          title: 'Decide on modding',
          body: 'Which content players can add and how mods are loaded and validated. Modding can extend a sandbox for years.',
          target: { docId: 'technical.dataDriven', section: 'modding' },
          done: filled('technical.dataDriven', 'modding'),
          optional: true,
        },
      ],
    },
  ],
}
