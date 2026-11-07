import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { OPEN_QUESTIONS_DOC, questionList } from '../../core/openQuestions'

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const some = (p: Project, test: (q: Entity) => boolean) => questionList(p).some(test)

const ensureList = (p: Project): Entity[] => {
  const d = p.documents[OPEN_QUESTIONS_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d.questions)) d.questions = []
  return d.questions
}

type Spec = { name: string; area: string; options: string }

const STARTER: Spec[] = [
  { name: 'Where do NPCs get money to buy their needs?', area: 'Economy', options: 'A: wages from workplaces / B: selling own produce / C: a basic stipend from the treasury' },
  { name: 'Who manages the treasury / tax and what can it be spent on?', area: 'Economy', options: 'A: the player sets tax and spends freely / B: a council NPC spends by rules the player sets' },
  { name: 'Do NPCs age and die? How is the population replenished?', area: 'NPC', options: 'A: no ageing, migrants arrive / B: ageing and births / C: ageing, migrants only' },
  { name: 'What exactly is the penalty when needs are unmet?', area: 'NPC', options: 'A: mood drops, then work slows / B: the NPC leaves after N days / C: both' },
  { name: 'Storage capacity limits to keep the economy bounded?', area: 'Logistics', options: 'A: per-building caps / B: one global cap raised by upgrades / C: no cap, decay instead' },
]

const starter: GuideExample = {
  id: 'starter',
  section: 'questions',
  title: 'Hands of Hubris starter questions',
  description: 'The five economy, NPC and logistics questions from the design doc, each with two or three options to weigh.',
  preview: 'questions',
  apply: (p) => {
    const list = ensureList(p)
    for (const s of STARTER) {
      const existing = list.find((q) => String(q.name ?? '').toLowerCase() === s.name.toLowerCase())
      if (existing) {
        existing.area ??= s.area
        if (!filled(existing.options)) existing.options = s.options
      } else list.push({ id: makeId(), name: s.name, area: s.area, options: s.options, status: 'Open' })
    }
  },
}

export const OPEN_QUESTIONS_GUIDE: ModuleGuide = {
  map: {
    width: 580,
    height: 160,
    nodes: [
      { id: 'team', label: 'Team & Workflow', doc: 'production.team', x: 10, y: 14 },
      { id: 'questions', label: 'Questions', section: 'questions', x: 220, y: 58 },
      { id: 'roadmap', label: 'Roadmap', doc: 'overview.roadmap', x: 430, y: 14 },
      { id: 'npc', label: 'NPC System', doc: 'design.npc', x: 430, y: 102 },
    ],
    edges: [
      { from: 'team', to: 'questions', label: 'owns' },
      { from: 'roadmap', to: 'questions', label: 'reviews at gates' },
      { from: 'questions', to: 'npc', label: 'decisions update' },
    ],
  },
  steps: [
    {
      id: 'add',
      title: 'Add the open questions',
      body: 'One row per question, phrased so it can be answered with a choice. Start from the doc’s starter set if you like.',
      section: 'questions',
      target: 'add',
      done: (p) => questionList(p).length > 0,
      action: { label: 'Insert example…', examples: 'questions' },
    },
    {
      id: 'area',
      title: 'Give each question an area',
      body: 'Economy, NPC, Logistics… The table and board use it to group related questions.',
      section: 'questions',
      target: 'field-area',
      done: (p) => questionList(p).length > 0 && questionList(p).every((q) => filled(q.area)),
    },
    {
      id: 'options',
      title: 'List the options',
      body: 'Write the alternatives as “A: … / B: …” before deciding, so the trade-off is on record.',
      section: 'questions',
      target: 'field-options',
      done: (p) => some(p, (q) => filled(q.options)),
    },
    {
      id: 'owner',
      title: 'Set an owner and a due date',
      body: 'The owner is a role from Team & Workflow. A due date makes the question show up as overdue when it slips.',
      section: 'questions',
      target: 'field-owner',
      done: (p) => some(p, (q) => filled(q.owner) && filled(q.due)),
    },
    {
      id: 'decide',
      title: 'Decide and write it back',
      body: 'Fill in Decision, move the card to Decided, then name the design doc you updated under “Updated in docs”.',
      section: 'questions',
      target: 'view-kanban',
      done: (p) => some(p, (q) => q.status === 'Decided' && filled(q.decision) && Array.isArray(q.affects) && q.affects.length > 0),
    },
  ],
  examples: [starter],
  concepts: {},
  empty: {
    questions: 'Every design question that is still open, so none is forgotten before the next gate.',
  },
}
