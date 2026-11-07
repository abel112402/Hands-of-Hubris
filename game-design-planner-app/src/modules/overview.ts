import { f, mod, s, section, v } from './helpers'

const ASSUMPTIONS = { section: 'assumptions', startField: 'startDate', bufferField: 'buffer' }
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

/** v1 stored what a critical dependency blocks as free text. */
function migrateRoadmap(data: Record<string, any>) {
  if (!Array.isArray(data.dependencies)) return
  for (const d of data.dependencies) {
    if (d.blocks !== undefined && d.blocksNote === undefined) d.blocksNote = d.blocks
    delete d.blocks
  }
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
        // Additive optional field: v1/v2 data without it stays valid, so no version bump or migration is needed.
        f.multi('pillars', 'Backed by pillars', section('pillars'), { help: 'Which design pillars make this selling point true?' }),
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
        [v.cards(), v.table(), v.visionReadiness()],
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
          f.multi('pillars', 'Serves pillars', section('pillars'), { help: 'Which design pillars does this scope item serve? An item with no pillar is a candidate to cut.' }),
          f.multi('usps', 'Delivers USPs', section('usps')),
          f.text('mvpRationale', 'MVP rationale', { help: 'Why is this in or out of the first release?' }),
          f.text('acceptance', 'Acceptance test', { help: 'One line: how will we know it is done?' }),
        ],
        [v.kanban('bucket'), v.pillarMatrix(), v.table()],
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
  {
    ...mod('overview', 'roadmap', 'Roadmap', 'docs/00_overview/roadmap.md', '🗺️', 'Phases, tasks, dependencies, gates and scope-cut plan.', [
    s.form(
      'assumptions',
      'Assumptions',
      [
        f.long('notes', 'Planning assumptions', { help: 'Team size, working pattern, what the estimates assume. All schedule numbers in this document are in weeks.' }),
        f.date('startDate', 'Project start date', { help: 'Optional. Lets the timelines show calendar dates next to week numbers.' }),
        f.num('buffer', 'Schedule buffer (%)', { min: 0, max: 100, help: 'Added on top of the planned end to show a buffered end date on the timelines.' }),
      ],
      'All start and duration values are in weeks from the project start.',
    ),
    s.collection(
      'phases',
      'Phases',
      'phase',
      [
        f.num('start', 'Start (week)', { min: 0, group: 'Schedule' }),
        f.num('duration', 'Duration (weeks)', { min: 0, group: 'Schedule' }),
        f.multi('dependsOn', 'Depends on phases', section('phases'), { group: 'Schedule' }),
        f.color('color', 'Color', { group: 'Schedule' }),
        f.long('goal', 'Goal', { help: 'One outcome the team can verify, e.g. "Prove the core loop is fun with grey-box art".', group: 'Definition' }),
        f.long('entry', 'Entry condition', { help: 'What must be true before this phase starts.', group: 'Definition' }),
        f.check('exit', 'Exit criteria', { help: 'Measurable and yes/no, e.g. "30 FPS on min-spec for 10 minutes".', group: 'Definition' }),
        f.long('outputs', 'Outputs', { group: 'Definition' }),
        f.long('risks', 'Main risks', { group: 'Risks & capacity' }),
        // Additive optional fields (riskRefs here, saving/scopeItems on cuts, the protected and tracking sections): no version bump needed.
        f.multi('riskRefs', 'Linked risks', section('risks', 'production.risks'), { help: 'Entries of the Risk Register this phase is exposed to.', group: 'Risks & capacity' }),
        f.text('owner', 'Owner', { help: 'Optional.', group: 'Risks & capacity' }),
        f.num('capacity', 'Capacity (person-weeks)', { min: 0, help: 'Optional. Compared with the effort of the phase\'s tasks.', group: 'Risks & capacity' }),
      ],
      [
        v.timeline('start', 'duration', 'wk', { depsField: 'dependsOn', calendar: ASSUMPTIONS }),
        v.phaseProgress(),
        v.cards(),
        v.table(['name', 'start', 'duration', 'goal']),
      ],
      {
        seed: [
          { id: 'phase0', name: 'Pre-production', start: 0, duration: 6, goal: 'Finalize design, technical basics, decide open questions' },
          { id: 'phase1', name: 'Prototype', start: 6, duration: 10, dependsOn: ['phase0'], goal: 'Prove core loop and economic simulation (grey box)' },
          { id: 'phase2', name: 'Vertical Slice', start: 16, duration: 14, dependsOn: ['phase1'], goal: 'One biome, one base, one faction in final quality' },
          { id: 'phase3', name: 'Alpha (feature complete)', start: 30, duration: 20, dependsOn: ['phase2'], goal: 'All systems working with partial content' },
          { id: 'phase4', name: 'Beta (content complete)', start: 50, duration: 16, dependsOn: ['phase3'], goal: 'All content in, balancing and polish' },
          { id: 'phase5', name: 'Release candidate & launch', start: 66, duration: 8, dependsOn: ['phase4'], goal: 'Bug fixing, optimization, launch preparation' },
          {
            id: 'phase6',
            name: 'Post-release support',
            start: 74,
            duration: 6,
            dependsOn: ['phase5'],
            goal: 'Hotfixes within the SLA and the first major patch 4–6 weeks after launch; support then continues beyond this window',
          },
        ],
      },
    ),
    s.collection(
      'tasks',
      'Tasks & milestones',
      'task',
      [
        f.enm('kind', 'Type', ['Task', 'Milestone'], { help: 'A milestone is a zero-duration event; its duration is ignored.' }),
        f.ref('phase', 'Phase', section('phases')),
        f.num('start', 'Start (week)', { min: 0 }),
        f.num('duration', 'Duration (weeks)', { min: 0 }),
        f.multi('dependsOn', 'Depends on', section('tasks')),
        f.text('doc', 'Related design doc'),
        f.enm('status', 'Status', ['Planned', 'In progress', 'Done', 'Blocked']),
        f.long('acceptance', 'Acceptance criterion', { help: 'How we know it is done, e.g. "Save/load round-trips a full town".' }),
        f.text('owner', 'Owner', { help: 'Optional.' }),
        f.num('effort', 'Effort (person-weeks)', { min: 0, help: 'Optional. Summed per phase and compared with its capacity.' }),
        f.enm('confidence', 'Estimate confidence', ['High', 'Medium', 'Low'], { help: 'Optional. Low-confidence items are flagged as risky.' }),
      ],
      [
        v.timeline('start', 'duration', 'wk', {
          depsField: 'dependsOn',
          kindField: 'kind',
          calendar: ASSUMPTIONS,
          bands: { section: 'phases', startField: 'start', durationField: 'duration' },
        }),
        v.kanban('status'),
        v.table(),
      ],
      { description: 'Dependencies are drawn on the timeline. Red links start before their predecessor ends; the critical path is the chain with no slack.' },
    ),
    s.collection(
      'dependencies',
      'Critical dependencies',
      'dependency',
      [
        f.multi('blocksPhases', 'Blocks phases', section('phases')),
        f.multi('blocksTasks', 'Blocks tasks', section('tasks')),
        f.text('blocksNote', 'Blocks (other)', { help: 'Anything that is not a phase or task.' }),
        f.long('why', 'Why it blocks'),
      ],
      [v.table(), v.cards()],
    ),
    s.collection(
      'gates',
      'Gate reviews',
      'gate',
      [
        f.ref('phase', 'End of phase', section('phases')),
        f.text('decisionMakers', 'Decision makers'),
        f.long('question', 'Question', { help: 'A yes/no question the exit criteria can answer, e.g. "Is the design stable enough to prototype?"' }),
        f.text('outcomes', 'Possible outcomes', { help: 'e.g. Go / Descope / Pivot' }),
        f.enm('decision', 'Decision', ['Pending', 'Go', 'No-go', 'Conditional']),
        f.date('reviewDate', 'Review date'),
        f.long('decisionNote', 'Decision note', { help: 'Why this outcome, and any conditions.' }),
      ],
      [v.table(), v.cards()],
    ),
    s.collection(
      'cuts',
      'Scope reduction order',
      'cut',
      [
        f.num('order', 'Order', { min: 1, help: '1 is cut first.' }),
        f.long('description', 'What is cut / simplified', { help: 'Say what is dropped and what stays, e.g. "Factions 4 → 3; keep the diplomacy loop".' }),
        f.multi('affectsPhases', 'Affects phases', section('phases')),
        f.multi('affectsTasks', 'Affects tasks', section('tasks')),
        f.multi('scopeItems', 'Vision scope items', section('scope', 'overview.vision'), { help: 'Scope items of the Vision this cut drops or simplifies.' }),
        f.num('saving', 'Saving (person-weeks)', { min: 0, help: 'Optional. Leave empty to use the effort of the affected tasks that are not done.' }),
      ],
      [v.ladder('order', ['affectsPhases', 'affectsTasks']), v.cutSavings(), v.table(['order', 'name', 'description']), v.cards()],
    ),
    s.form('protected', 'Not cuttable', [
      f.multi('pillars', 'Protected pillars', section('pillars', 'overview.vision'), { help: 'Vision pillars no cut may touch. A cut that removes a scope item serving one of them gets a hint.' }),
      f.long('notes', 'Other protected items', { help: 'e.g. "Extensible architecture".' }),
    ]),
    s.form('tracking', 'Metrics and tracking', [
      f.long('statusCadence', 'Status updates', { help: 'How often and where progress is reported, e.g. "Weekly: done / in progress / blocked in the backlog".' }),
      f.num('velocityThreshold', 'Velocity review threshold (%)', { min: 0, max: 100, help: 'If completed vs planned work stays below this for two sprints, review the roadmap.' }),
      f.long('notes', 'Other metrics', { help: 'Retrospectives per milestone, monthly risk review…' }),
    ]),
    s.collection(
      'changelog',
      'Change log',
      'change',
      [f.text('date', 'Date'), f.long('reason', 'Reason')],
      [v.table()],
    ),
    ]),
    version: 2,
    migrate: migrateRoadmap,
  },
]
