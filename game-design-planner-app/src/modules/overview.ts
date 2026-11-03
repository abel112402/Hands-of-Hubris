import { f, mod, s, section, v } from './helpers'

const SCOPE = ['In MVP', 'Later', 'Out of scope']

/** v1 kept pitch, references, audience, tone, platform and monetization in one 'concept' form. */
const CONCEPT_SPLIT: Record<string, [string, string]> = {
  pitch: ['pitch', 'pitch'],
  genres: ['references', 'genres'],
  audience: ['audience', 'audience'],
  tone: ['tone', 'tone'],
  platform: ['platform', 'platform'],
  monetization: ['monetization', 'monetization'],
}

function migrateVision(data: Record<string, any>) {
  const old = data.concept
  if (!old || typeof old !== 'object') return
  for (const [key, [sectionId, field]] of Object.entries(CONCEPT_SPLIT)) {
    if (old[key] === undefined) continue
    data[sectionId] = { ...(data[sectionId] ?? {}), [field]: old[key] }
  }
  delete data.concept
}

export const overviewModules = [
  {
    ...mod('overview', 'vision', 'Vision & Concept', 'docs/00_overview/vision.md', '🎯', 'Pitch, pillars, audience, scope.', [
      s.form('pitch', 'One-sentence pitch', [
        f.text('pitch', 'One-sentence pitch', {
          help: 'A draft is fine now; refine it last, once the rest of the vision is clear.',
          placeholder: 'A [genre] where [player] [does what] in order to [goal].',
        }),
        f.long('playerFantasy', 'Player fantasy', { help: 'Who does the player get to be, and what power or feeling do they get?' }),
        f.long('mainActivity', 'Main player activity', { help: 'What does the player do most of the time, minute to minute?' }),
      ]),
      s.form('references', 'Genre and reference games', [
        f.long('genres', 'Genre and reference games', { help: 'Name the genres and 2–4 concrete reference games.' }),
        f.long('referencesTaken', 'What we take from the references', { help: 'e.g. "Stardew Valley: the daily rhythm and relationship tracking."' }),
        f.long('referencesDifferent', 'What we do differently', { help: 'Where this game deliberately departs from its references.' }),
      ]),
      s.form('audience', 'Target audience', [
        f.long('audience', 'Target audience', { help: 'Who is it for? Player profiles, experience level, platforms they play on.' }),
      ]),
      s.collection('usps', 'Unique selling points', 'USP', [
        f.long('description', 'Description'),
        f.long('playerBenefit', 'Player benefit', { help: 'What does the player gain from this?' }),
        f.long('differentiator', 'Different from references / competitors', { help: 'How is this not already offered by a reference game?' }),
      ]),
      s.collection(
        'pillars',
        'Design pillars',
        'pillar',
        [
          f.long('rationale', 'Why this pillar?'),
          f.long('decisionTest', 'How it guides a decision', { help: 'A test that can reject a feature, e.g. "If a feature adds busywork without a meaningful choice, cut it."' }),
          f.text('example', 'Example that fits'),
          f.text('nonExample', 'Example that does not fit'),
          f.color('color', 'Color'),
        ],
        [v.cards(), v.table()],
      ),
      s.form('tone', 'Mood and tone', [
        f.long('tone', 'Mood and tone', { help: 'The emotional goal and atmosphere, and any contrast the game plays with.' }),
      ]),
      s.collection(
        'scope',
        'Scope',
        'scope item',
        [
          f.enm('bucket', 'Bucket', SCOPE),
          f.long('notes', 'Notes'),
          f.text('mvpRationale', 'MVP rationale', { help: 'Why is this in or out of the first release?' }),
          f.text('acceptance', 'Acceptance test', { help: 'One line: how will we know it is done?' }),
        ],
        [v.kanban('bucket'), v.table()],
      ),
      s.form('platform', 'Platform and technical frame', [
        f.long('platform', 'Platform and technical frame', { help: 'Unity version, target platforms, 2D/3D, perspective, minimum specs.' }),
      ]),
      s.form('monetization', 'Monetization / release plan', [f.long('monetization', 'Monetization / release plan')]),
    ]),
    version: 2,
    migrate: migrateVision,
  },
  mod('overview', 'glossary', 'Glossary', 'docs/00_overview/glossary.md', '📖', 'Shared vocabulary between design, code and content.', [
    s.collection(
      'terms',
      'Terms',
      'term',
      [
        f.text('codeName', 'Code / English name'),
        f.long('definition', 'Definition', { required: true }),
        f.text('related', 'Related document'),
      ],
      [v.table(['name', 'codeName', 'definition', 'related']), v.cards()],
    ),
  ]),
  mod('overview', 'roadmap', 'Roadmap', 'docs/00_overview/roadmap.md', '🗺️', 'Phases, tasks, dependencies, gates and scope-cut plan.', [
    s.form('assumptions', 'Assumptions', [
      f.long('notes', 'Planning assumptions (team size, estimate unit, start date, buffer)'),
      f.text('startDate', 'Project start date'),
      f.num('buffer', 'Schedule buffer (%)', { min: 0, max: 100 }),
    ]),
    s.collection(
      'phases',
      'Phases',
      'phase',
      [
        f.num('start', 'Start (week)', { min: 0 }),
        f.num('duration', 'Duration (weeks)', { min: 0 }),
        f.color('color', 'Color'),
        f.long('goal', 'Goal'),
        f.long('entry', 'Entry condition'),
        f.check('exit', 'Exit criteria'),
        f.long('outputs', 'Outputs'),
        f.long('risks', 'Main risks'),
        f.multi('dependsOn', 'Depends on phases', section('phases')),
      ],
      [v.timeline('start', 'duration', 'wk', { depsField: 'dependsOn' }), v.cards(), v.table(['name', 'start', 'duration', 'goal'])],
      {
        seed: [
          { id: 'phase0', name: 'Pre-production', start: 0, duration: 6, goal: 'Finalize design, technical basics, decide open questions' },
          { id: 'phase1', name: 'Prototype', start: 6, duration: 10, dependsOn: ['phase0'], goal: 'Prove core loop and economic simulation (grey box)' },
          { id: 'phase2', name: 'Vertical Slice', start: 16, duration: 14, dependsOn: ['phase1'], goal: 'One biome, one base, one faction in final quality' },
          { id: 'phase3', name: 'Alpha (feature complete)', start: 30, duration: 20, dependsOn: ['phase2'], goal: 'All systems working with partial content' },
          { id: 'phase4', name: 'Beta (content complete)', start: 50, duration: 16, dependsOn: ['phase3'], goal: 'All content in, balancing and polish' },
          { id: 'phase5', name: 'Release candidate & launch', start: 66, duration: 8, dependsOn: ['phase4'], goal: 'Bug fixing, optimization, launch preparation' },
        ],
      },
    ),
    s.collection(
      'tasks',
      'Tasks / milestones',
      'task',
      [
        f.ref('phase', 'Phase', section('phases')),
        f.num('start', 'Start (week)', { min: 0 }),
        f.num('duration', 'Duration (weeks)', { min: 0 }),
        f.multi('dependsOn', 'Depends on', section('tasks')),
        f.text('doc', 'Related design doc'),
        f.enm('status', 'Status', ['Planned', 'In progress', 'Done', 'Blocked']),
        f.long('acceptance', 'Acceptance criterion'),
      ],
      [v.timeline('start', 'duration', 'wk', { depsField: 'dependsOn' }), v.kanban('status'), v.table()],
      { description: 'Dependencies are drawn on the timeline and the critical path is highlighted.' },
    ),
    s.collection(
      'gates',
      'Gate reviews',
      'gate',
      [
        f.ref('phase', 'End of phase', section('phases')),
        f.text('decisionMakers', 'Decision makers'),
        f.long('question', 'Question'),
        f.text('outcomes', 'Possible outcomes'),
      ],
      [v.table(), v.cards()],
    ),
    s.collection(
      'cuts',
      'Scope reduction order',
      'cut',
      [f.num('order', 'Order', { min: 1 }), f.long('description', 'What is cut / simplified')],
      [v.table(['order', 'name', 'description']), v.cards()],
    ),
    s.collection(
      'dependencies',
      'Critical dependencies',
      'dependency',
      [f.text('blocks', 'Blocks'), f.long('why', 'Why it blocks')],
      [v.table(), v.cards()],
    ),
    s.collection(
      'changelog',
      'Change log',
      'change',
      [f.text('date', 'Date'), f.long('reason', 'Reason')],
      [v.table()],
    ),
  ]),
]
