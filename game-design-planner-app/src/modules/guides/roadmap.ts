import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { assumptions, protectedPillars, roadmapList, ROADMAP_DOC } from '../../core/roadmap'

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** The collection to add to, created if the document has none yet (a missing doc is left alone). */
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[ROADMAP_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const hasName = (list: Entity[], name: string) => list.some((e) => String(e.name ?? '').toLowerCase() === name.toLowerCase())
const byStart = (p: Project) => [...roadmapList(p, 'phases')].sort((a, b) => (num(a.start) ?? 0) - (num(b.start) ?? 0))

/** Phase 0 tasks from the roadmap doc, as week offsets inside the chosen phase. */
const PREP_TASKS = [
  { name: 'Fill in the vision: pillars, audience, platform, MVP scope', at: 0, duration: 1, effort: 1, acceptance: 'Vision document reviewed by the team.' },
  { name: 'Decide the open questions', at: 0, duration: 2, effort: 2, acceptance: 'Every open question decided or consciously deferred.' },
  { name: 'Core loop, difficulty, factions and biomes', at: 1, duration: 2, effort: 3, acceptance: 'Drafts of the four design docs exist.' },
  { name: 'Technical architecture and data schema', at: 2, duration: 2, effort: 3, acceptance: 'Architecture doc and first ADRs approved.' },
  { name: 'Set up the Unity project and build pipeline', at: 3, duration: 2, effort: 2, acceptance: 'An empty project builds on CI.' },
  { name: 'Art direction sketch, glossary, risk register, backlog', at: 4, duration: 2, effort: 2, acceptance: 'Prototype backlog prioritized.' },
]

const tasksExample: GuideExample = {
  id: 'prep',
  section: 'tasks',
  title: 'Pre-production tasks',
  description: 'The six pre-production tasks from the roadmap doc, with effort in person-weeks and an acceptance criterion each, placed inside the phase you pick.',
  preview: 'roadmapList',
  param: { key: 'phase', label: 'Phase', options: (p) => byStart(p).map((e) => ({ id: e.id, label: String(e.name ?? e.id) })) },
  apply: (p, phaseId) => {
    const list = ensureList(p, 'tasks')
    const phase = roadmapList(p, 'phases').find((e) => e.id === phaseId) ?? byStart(p)[0]
    const base = num(phase?.start) ?? 0
    for (const t of PREP_TASKS) {
      if (hasName(list, t.name)) continue
      list.push({ id: makeId(), name: t.name, kind: 'Task', phase: phase?.id, start: base + t.at, duration: t.duration, effort: t.effort, acceptance: t.acceptance, status: 'Planned' })
    }
  },
}

const GATES = [
  { name: 'G0', question: 'Is the design stable enough to prototype?', outcomes: 'Go / More planning' },
  { name: 'G1', question: 'Is it fun and feasible?', outcomes: 'Go / Descope / Pivot' },
  { name: 'G2', question: 'Are quality and estimates on track?', outcomes: 'Go / Reduce scope' },
  { name: 'G3', question: 'Is it feature complete?', outcomes: 'Go / Delay' },
  { name: 'G4', question: 'Is it content complete and stable?', outcomes: 'Go / Delay' },
  { name: 'G5', question: 'Can it ship?', outcomes: 'Release / Fix' },
]

const gatesExample: GuideExample = {
  id: 'gates',
  section: 'gates',
  title: 'Gate reviews G0–G5',
  description: 'One yes/no gate at the end of each phase, in phase order, from the roadmap doc (G0–G5; later phases get a generic gate). Phases that already have a gate are skipped.',
  preview: 'roadmapList',
  apply: (p) => {
    const list = ensureList(p, 'gates')
    const gated = new Set(list.map((g) => g.phase))
    byStart(p).forEach((phase, i) => {
      const g = GATES[i] ?? { name: `G${i}`, question: `Has “${phase.name ?? 'this phase'}” met its exit criteria?`, outcomes: 'Go / Delay' }
      if (gated.has(phase.id) || hasName(list, g.name)) return
      list.push({ id: makeId(), name: g.name, phase: phase.id, decisionMakers: 'Whole team', question: g.question, outcomes: g.outcomes, decision: 'Pending' })
    })
  },
}

const CUTS = [
  'Depth of mercenary armies and NPC relationship events',
  'Number of special events and weather types',
  'Number of classes (7 → 4–5) and skill tree depth',
  'Simpler logistics network (manual shipments instead of automatic)',
  'Number of endings',
  'Number of factions (4 → 3)',
]

const cutsExample: GuideExample = {
  id: 'cuts',
  section: 'cuts',
  title: 'Doc cut order',
  description: 'The six scope reductions from the roadmap doc, numbered after any cuts you already have. Link each to the tasks it drops to see its saving.',
  preview: 'roadmapList',
  apply: (p) => {
    const list = ensureList(p, 'cuts')
    let order = Math.max(0, ...list.map((c) => num(c.order) ?? 0))
    for (const name of CUTS) if (!hasName(list, name)) list.push({ id: makeId(), name, order: ++order })
  },
}

const DEPS = [
  { name: 'Economy model decisions (money flow, tax)', blocksNote: 'Town management, trade, NPC', why: 'The simulation cannot be implemented without them.' },
  { name: 'Data-driven schema', blocksNote: 'All content (items, buildings, needs)', why: 'Switching later is expensive.' },
  { name: 'Save system', blocksNote: 'Every system that stores state', why: 'Introduced late, every system must be rewritten.' },
  { name: 'Final art style', blocksNote: 'Asset production', why: 'A style change means producing assets again.' },
  { name: 'Faction system', blocksNote: 'Quests, trade, biome access', why: 'Several systems build on it.' },
]

const depsExample: GuideExample = {
  id: 'deps',
  section: 'dependencies',
  title: 'Doc critical dependencies',
  description: 'The five blocking dependencies from the roadmap doc. Afterwards, link the phases and tasks each one blocks.',
  preview: 'roadmapList',
  apply: (p) => {
    const list = ensureList(p, 'dependencies')
    for (const d of DEPS) if (!hasName(list, d.name)) list.push({ id: makeId(), ...d })
  },
}

const phases = (p: Project) => roadmapList(p, 'phases')
const tasks = (p: Project) => roadmapList(p, 'tasks')
const tracking = (p: Project): Record<string, any> => p.documents[ROADMAP_DOC]?.data.tracking ?? {}

export const ROADMAP_GUIDE: ModuleGuide = {
  map: {
    width: 800,
    height: 160,
    nodes: [
      { id: 'assumptions', label: 'Assumptions', section: 'assumptions', x: 10, y: 14 },
      { id: 'risks', label: 'Risk Register', doc: 'production.risks', x: 10, y: 102 },
      { id: 'phases', label: 'Phases', section: 'phases', x: 220, y: 58 },
      { id: 'tasks', label: 'Tasks', section: 'tasks', x: 430, y: 14 },
      { id: 'gates', label: 'Gate reviews', section: 'gates', x: 430, y: 102 },
      { id: 'cuts', label: 'Scope cuts', section: 'cuts', x: 640, y: 14 },
      { id: 'vision', label: 'Vision', doc: 'overview.vision', x: 640, y: 102 },
    ],
    edges: [
      { from: 'assumptions', to: 'phases', label: 'dates, buffer' },
      { from: 'risks', to: 'phases', label: 'threaten' },
      { from: 'phases', to: 'tasks', label: 'contain' },
      { from: 'phases', to: 'gates', label: 'end in' },
      { from: 'tasks', to: 'cuts', label: 'dropped by' },
      { from: 'vision', to: 'cuts', label: 'protects' },
    ],
  },
  steps: [
    {
      id: 'start',
      title: 'Set the start date and buffer',
      body: 'All numbers are weeks from the start. A start date shows calendar dates on the timelines; the buffer adds a safety margin to the end.',
      section: 'assumptions',
      target: 'field-startDate',
      done: (p) => filled(assumptions(p).startDate),
    },
    {
      id: 'phases',
      title: 'Lay out the phases',
      body: 'Each phase has a start week, a duration and the phases it depends on. The timeline marks the critical path.',
      section: 'phases',
      target: 'view-timeline',
      done: (p) => phases(p).length > 0 && phases(p).every((e) => num(e.start) !== undefined && num(e.duration) !== undefined),
    },
    {
      id: 'exit',
      title: 'Give every phase exit criteria',
      body: 'Measurable, yes/no checks such as “20+ NPCs at 60 FPS on target hardware”. Gates are decided against them.',
      section: 'phases',
      target: 'field-exit',
      done: (p) => phases(p).length > 0 && phases(p).every((e) => Array.isArray(e.exit) && e.exit.length > 0),
    },
    {
      id: 'tasks',
      title: 'Break phases into tasks',
      body: 'Give each task a phase, a start and duration, and an acceptance criterion. Milestones are zero-length tasks.',
      section: 'tasks',
      target: 'add',
      done: (p) => tasks(p).some((t) => !!t.phase),
      action: { label: 'Insert example…', examples: 'tasks' },
    },
    {
      id: 'capacity',
      title: 'Estimate effort and capacity',
      body: 'Task effort and phase capacity are in person-weeks. Progress on Phases compares them and flags phases over capacity.',
      section: 'phases',
      target: 'view-phaseProgress',
      done: (p) => tasks(p).some((t) => num(t.effort) !== undefined) && phases(p).some((e) => num(e.capacity) !== undefined),
    },
    {
      id: 'deps',
      title: 'Name the critical dependencies',
      body: 'What blocks what, and why. Link the phases and tasks each dependency blocks.',
      section: 'dependencies',
      target: 'add',
      done: (p) => roadmapList(p, 'dependencies').length > 0,
      action: { label: 'Insert example…', examples: 'dependencies' },
    },
    {
      id: 'gates',
      title: 'Close every phase with a gate',
      body: 'A yes/no question answered from the exit criteria, with the possible outcomes. Record the decision when it is made.',
      section: 'gates',
      target: 'add',
      done: (p) => {
        const gated = new Set(roadmapList(p, 'gates').map((g) => g.phase))
        return phases(p).length > 0 && phases(p).every((e) => gated.has(e.id))
      },
      action: { label: 'Insert example…', examples: 'gates' },
    },
    {
      id: 'cuts',
      title: 'Order the scope cuts',
      body: 'Number them in the order you would make them, and link the tasks each drops. Savings shows whether they recover the effort above capacity.',
      section: 'cuts',
      target: 'view-cutSavings',
      done: (p) => roadmapList(p, 'cuts').some((c) => num(c.order) !== undefined),
      action: { label: 'Insert example…', examples: 'cuts' },
    },
    {
      id: 'protected',
      title: 'Mark what may not be cut',
      body: 'Pick the Vision pillars no cut may touch. A cut that drops a scope item serving one of them gets a hint.',
      section: 'protected',
      target: 'field-pillars',
      done: (p) => protectedPillars(p).length > 0,
    },
    {
      id: 'tracking',
      title: 'Agree how progress is tracked',
      body: 'Say where status is reported and when the roadmap is reviewed, e.g. velocity below 70% for two sprints.',
      section: 'tracking',
      target: 'field-velocityThreshold',
      done: (p) => filled(tracking(p).statusCadence) || num(tracking(p).velocityThreshold) !== undefined,
      action: {
        label: 'Use the doc’s rule',
        run: (p) => {
          const d = p.documents[ROADMAP_DOC]?.data
          if (!d) return
          const t = (d.tracking ??= {})
          if (!filled(t.statusCadence)) t.statusCadence = 'Weekly: done / in progress / blocked tasks in the backlog.'
          t.velocityThreshold ??= 70
          if (!filled(t.notes)) t.notes = 'Retrospective at each milestone; monthly risk review.'
        },
      },
    },
  ],
  examples: [tasksExample, depsExample, gatesExample, cutsExample],
  concepts: {
    phases: {
      title: 'Critical path and buffer',
      body: 'The critical path is the chain of dependent phases with no slack: any slip there moves the end date. The buffer adds a percentage on top of the planned end.',
      diagram: 'criticalPath',
    },
    cuts: {
      title: 'Cut order and savings',
      body: 'Cuts are made top to bottom. Each saves the effort of the open tasks it drops (or your own estimate); the plan is safe when the running total reaches the effort above capacity.',
      diagram: 'cutLadder',
    },
  },
  empty: {
    phases: 'The big stages from pre-production to release, each ending in a gate.',
    tasks: 'The work inside each phase, with effort, so progress and capacity can be compared.',
    dependencies: 'What blocks other work, and why, so it gets scheduled early.',
    gates: 'The go / no-go decision that closes each phase.',
    cuts: 'What you would drop first if the schedule slips, in order.',
    changelog: 'Why the roadmap changed, so later readers know the reasons.',
  },
}
