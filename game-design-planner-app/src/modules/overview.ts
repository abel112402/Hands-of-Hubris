import { f, mod, s, section, v } from './helpers'

const SCOPE = ['In MVP', 'Later', 'Out of scope']

export const overviewModules = [
  mod('overview', 'vision', 'Vision & Concept', 'docs/00_overview/vision.md', '🎯', 'Pitch, pillars, audience, scope.', [
    s.form('concept', 'Concept', [
      f.text('pitch', 'One-sentence pitch'),
      f.long('genres', 'Genre and reference games'),
      f.long('audience', 'Target audience'),
      f.long('tone', 'Mood and tone'),
      f.long('platform', 'Platform and technical frame (Unity version, 2D/3D, min. specs)'),
      f.long('monetization', 'Monetization / release plan'),
    ]),
    s.collection('pillars', 'Design pillars', 'pillar', [f.long('rationale', 'Why this pillar?'), f.color('color', 'Color')], [
      v.cards(),
      v.table(),
    ]),
    s.collection('usps', 'Unique selling points', 'USP', [f.long('description', 'Description')]),
    s.collection('scope', 'Scope', 'scope item', [f.enm('bucket', 'Bucket', SCOPE), f.long('notes', 'Notes')], [
      v.kanban('bucket'),
      v.table(),
    ]),
  ]),
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
