import type { SectionDef } from '../core/model/types'

export interface HelpLink { label: string; url: string }
export interface ModuleHelp { purpose: string; tips: string[]; links?: HelpLink[] }

const L = {
  patterns: { label: 'Game Programming Patterns', url: 'https://gameprogrammingpatterns.com/' },
  adr: { label: 'Architecture Decision Records', url: 'https://adr.github.io/' },
  so: { label: 'Unity: ScriptableObject', url: 'https://docs.unity3d.com/Manual/class-ScriptableObject.html' },
  balance: { label: 'Game Balance Concepts', url: 'https://gamebalanceconcepts.wordpress.com/' },
  changelog: { label: 'Keep a Changelog', url: 'https://keepachangelog.com/' },
  unityPerf: { label: 'Unity: Optimizing performance', url: 'https://docs.unity3d.com/Manual/BestPracticeGuides.html' },
  unityTest: { label: 'Unity Test Framework', url: 'https://docs.unity3d.com/Packages/com.unity.test-framework@latest' },
  mermaid: { label: 'Mermaid diagram syntax', url: 'https://mermaid.js.org/' },
  semver: { label: 'Semantic Versioning', url: 'https://semver.org/' },
}

const DEFAULT: ModuleHelp = {
  purpose: 'Capture this part of the design in structured form so it can be reviewed, referenced and exported to the docs folder.',
  tips: ['Fill in the sections top to bottom; empty sections are fine early on.', 'Use references instead of retyping names so renames never break links.'],
}

export const MODULE_HELP: Record<string, ModuleHelp> = {
  'overview.vision': { purpose: 'Defines what the game is and is not: pitch, pillars, audience and scope. Every later decision is checked against it.', tips: ['Keep pillars to 3–5 and phrase them so they can reject a feature; the decision test says how.', 'The one-sentence pitch is a draft you refine last, once the rest is clear.', 'Describe the player fantasy and main activity, and say what you take from references and what you do differently.', 'For each USP, state the player benefit and how it differs from a reference.', 'Give scope items a bucket; a rationale or acceptance test is optional. Readiness tips are suggestions, never errors.'] },
  'overview.glossary': { purpose: 'One shared vocabulary so design, code and content use the same terms.', tips: ['Add a term the first time two people disagree on its meaning.', 'Match code identifiers to glossary terms.'] },
  'overview.roadmap': { purpose: 'Orders the whole production into phases with exit criteria, gates and a scope-cut plan. All schedule numbers are in weeks from the project start.', tips: ['Give every phase measurable, yes/no exit criteria, e.g. "30 FPS on min-spec for 10 minutes".', 'Set a start date and buffer in Assumptions to see calendar dates and a buffered end on the timelines.', 'Red dependency links start before their predecessor ends; the critical path is the chain with no slack.', 'Use the Milestone type for zero-duration events. Owner, effort and confidence are optional.', 'A gate question should be answerable from the exit criteria; record the decision and review date.', 'Number cuts in the order you would make them (1 first) and link what they affect.'], links: [L.mermaid] },
  'design.coreLoop': {
    purpose: 'Describes what the player repeats at second, minute, session and campaign scale. If the loop is not fun, nothing else saves the game.',
    tips: [
      'Describe each loop as action → reward → next decision; each part has its own field.',
      'Pick the time scale by how long one cycle takes: seconds, minutes, hours / days, or the whole campaign.',
      'Use “Builds toward” to show how short loops feed longer ones; the Progression view lays them out by scale.',
      'In the diagram: Action = what the player does, System = a game system that reacts, Resource = gathered or spent, Reward = what is gained, Goal = a target. Use “feeds” for repeated actions, “rewards” / “leads to” back to an earlier node for feedback, “unlocks” for gates.',
      'Link diagram nodes to real systems (buildings, items, enemies, quests, factions, biomes) instead of retyping their names, and tick which loops use each node.',
      'Export follows the design doc: one heading per time scale, then rewards and progression, then diagrams.',
    ],
  },
  'design.difficulty': {
    purpose: 'Defines which parameters change per difficulty so tuning stays systematic.',
    tips: [
      'Describe each preset’s intended experience and target player before tuning numbers.',
      'Give every parameter a unit, a direction (does higher make the game harder?) and a range; the editor then flags values outside it and reversals between adjacent presets.',
      'Prefer multipliers over hard-coded values. Values are entered in the matrix, which shows each row’s unit, range and notes.',
      'Use the Compare view on Parameters to see presets side by side; values are scaled to each parameter’s range so units can mix.',
      'Tick “Intentional exception” for a parameter that should not follow harder = higher.',
      'Custom settings let players adjust selected pressures without adding more fixed presets.',
    ],
    links: [L.balance],
  },
  'design.factions': {
    purpose: 'Models factions, their relations and the consequences of player choices.',
    tips: [
      'Start with the System overview: reputation scale, starting value, decay and how relationships change.',
      'Add as many factions as the design needs; four is a suggestion, not a limit.',
      'The matrix is the reputation model (directional, numeric). The graph names relationships such as alliances and trade; the editor warns when they disagree.',
      'Asymmetric pairs are allowed when the story needs them; they are marked for review, and “Mirror” fills empty reverse cells.',
      'For each action, record the direct change and the spillover on other factions, and why they react.',
      'Relationship levels need a minimum (and optionally a maximum) so every value maps to exactly one level; the Ranges view shows gaps and overlaps.',
      'Link key characters and unlocks to the real entries, with the conditions that unlock them.',
    ],
  },
  'design.world': { purpose: 'Lays out biomes, progression gating and the map so content can be planned per area.', tips: ['Set the entry condition on each biome; the graph is the visual layer and hints flag disagreements.', 'Link map zones to biome entries instead of retyping names; the sketch is the layout, Exploration holds scale, generation and navigation.', 'List enemies, bosses and garrisons per biome so the export carries them.', 'Mark biomes optional if they are intentionally isolated.'] },
  'design.town': { purpose: 'Plans buildings, resource flow and economy so the town is balanced before it is built.', tips: ['Draw resource flow in the graph; look for sources without sinks.', 'Keep building costs as maps so new resources appear automatically.'], links: [L.balance] },
  'design.npc': {
    purpose: 'Specifies who the NPCs are and how they live: stats, needs, archetypes, life cycle, work, relationships and events. It is the heart of the town simulation.',
    tips: [
      'Start with Overview: the stat scale, maximum age and Town time units per day drive the inputs, ranges and the needs balance.',
      'Add new stats, needs or professions in Definitions. They appear in archetypes, the radar, the stat preview, the routine matrix and the coverage tips automatically.',
      'Stat and efficiency formulas use stat names as variables (lower case, “-” becomes “_”) plus level and age. The Preview view under Stats evaluates every formula for every archetype.',
      'For each need, say what satisfies it: a resource from the town stock or buildings that provide places. Population scenarios then compare daily needs with the Town estimate.',
      'The life cycle diagram needs a Start and an End. Tag states with life stages and link “on event” connections to the event that causes them.',
      'Archetype shares should add up to 100%; they also act as spawn weights for generation.',
      'All tips are advisory: an isolated state or an unused profession can be intentional.',
    ],
    links: [L.balance, L.patterns],
  },
  'design.player': { purpose: 'Defines the hero: survival, casts, skill trees and XP progression.', tips: ['Skill tree nodes can link to cast catalog entries.', 'Use the formula editor for XP curves and check the plot.'] },
  'design.items': { purpose: 'Item database, rarity/quality rules, recipes and loot tables.', tips: ['Define rarities and qualities once in Definitions.', 'Reference items by link in recipes and loot to avoid typos.'], links: [L.so] },
  'design.combat': { purpose: 'Combat model plus enemy and boss sheets with their numbers.', tips: ['Keep damage formulas in the formula editor so they can be tested.', 'Compare enemies on the radar view.'] },
  'design.timeWeather': { purpose: 'Day cycle, weather and special events that pace the game.', tips: ['Define what each time of day changes mechanically.', 'Events need trigger, effect and duration.'] },
  'design.trade': { purpose: 'Merchants, price rules and currencies.', tips: ['Define base prices once, apply modifiers via formulas.', 'Check that every currency has sources and sinks.'], links: [L.balance] },
  'design.story': { purpose: 'Acts, characters and the quest graph.', tips: ['Use edge types for requirements vs. consequences.', 'Auto layout tidies a messy quest graph.'] },
  'design.ui': { purpose: 'Screens, navigation flows and wireframes before art production.', tips: ['Wireframe the screens the player sees most first.', 'Link flows to the features they expose.'] },
  'design.openQuestions': { purpose: 'Tracks unresolved design decisions so none are forgotten.', tips: ['Move items to the done column with the decision recorded.', 'Review at every gate.'] },
  'technical.architecture': { purpose: 'Describes code modules, dependencies and extension points so the game stays extensible.', tips: ['Draw dependencies one-way; cycles are a design smell.', 'Mark extension points explicitly.'], links: [L.patterns] },
  'technical.coding': { purpose: 'Naming, structure and Git rules the whole team follows.', tips: ['Keep it short enough to be read.', 'Automate rules with linters where possible.'] },
  'technical.dataDriven': { purpose: 'Defines the data schemas that content is authored in, keeping content out of code.', tips: ['Version every schema.', 'Prefer ScriptableObjects or JSON with validation.'], links: [L.so] },
  'technical.save': { purpose: 'Decides what is saved and how, including versioning and migration.', tips: ['Version the save format from day one.', 'Test loading old saves for each release.'], links: [L.semver] },
  'technical.ai': { purpose: 'Plans NPC, enemy and economy AI behaviour.', tips: ['Describe states and transitions in the graph.', 'Budget AI update cost.'], links: [L.patterns] },
  'technical.performance': { purpose: 'Sets performance targets and budgets before they are violated.', tips: ['Define target hardware and frame time.', 'Measure on target hardware, not only the editor.'], links: [L.unityPerf] },
  'technical.tools': { purpose: 'Environment, tools and the build/CI pipeline.', tips: ['Pin the Unity version.', 'Automate builds early.'] },
  'technical.adr': { purpose: 'A log of technical decisions with context and consequences.', tips: ['One decision per record; never rewrite history, supersede instead.'], links: [L.adr] },
  'artAudio.art': { purpose: 'Visual style, palettes and references that keep art consistent.', tips: ['Collect references with a note on what to take from each.', 'Fix the palette early.'] },
  'artAudio.audio': { purpose: 'Music and SFX direction and needs.', tips: ['List sounds per game state.', 'Decide the loudness targets.'] },
  'artAudio.assets': { purpose: 'Asset workflow, naming and status tracking.', tips: ['Use the kanban view to track asset status.', 'Define naming and import rules once.'] },
  'production.milestones': { purpose: 'Milestones with scope and dates, derived from the roadmap.', tips: ['Each milestone needs a demonstrable outcome.', 'Use the timeline to check overlaps.'] },
  'production.backlog': { purpose: 'Features and tasks with priority and status.', tips: ['Drag cards between columns to change status.', 'Keep priorities few: must / should / could.'] },
  'production.risks': { purpose: 'Lists risks by likelihood and impact with mitigations.', tips: ['Drag risks in the matrix to re-rate them.', 'Review top risks at each gate.'] },
  'production.team': { purpose: 'Roles, methodology and the Definition of Done.', tips: ['Write the Definition of Done as testable checks.'] },
  'production.release': { purpose: 'Checklist to run before every release.', tips: ['Tick items per build and snapshot the project for history.'], links: [L.semver] },
  'qa.testPlan': { purpose: 'Strategy and concrete test cases.', tips: ['Link cases to the feature they cover.', 'Automate regression cases first.'], links: [L.unityTest] },
  'qa.balance': { purpose: 'Balance targets, metrics and a change log of tuning.', tips: ['Record why each number changed.', 'Test one variable at a time.'], links: [L.balance, L.changelog] },
  'qa.bugs': { purpose: 'Bug tracker with severity, steps and status.', tips: ['Always include reproduction steps and build version.'] },
  'templates.featureSpec': { purpose: 'Detailed spec for one feature before implementation.', tips: ['Cover goal, rules, edge cases, UI, data and acceptance criteria.'] },
  'custom.entities': { purpose: 'Your own entity types, defined in Definitions, for game-specific content.', tips: ['Define the type and fields in Definitions first.', 'Use it for anything the built-in planners do not cover.'] },
}

export const KIND_HELP: Record<SectionDef['kind'], { title: string; steps: string[] }> = {
  form: { title: 'Form', steps: ['Fill in the fields; changes are saved to the project immediately.', 'Required fields are marked and checked on the Issues page.'] },
  collection: { title: 'Collection', steps: ['Use “+ Add” to create an item and click it to open the inspector on the right.', 'Switch views with the tabs (cards, table, kanban, radar, matrix, timeline); the data is the same.', 'Table: click headers to sort, edit cells inline. Kanban: drag cards between columns.', 'Inspector: duplicate, delete, reorder, and see where the item is “Used by”.', 'Use the filter box to search, and export the table as CSV.'] },
  matrix: { title: 'Matrix', steps: ['Click a cell and type a value; colours show relative intensity.', 'Rows and columns come from catalogs; add entries in Definitions.'] },
  graph: { title: 'Graph', steps: ['Choose a node kind and press “+ Add node”.', 'Drag from a node’s right handle to another node to connect them.', 'Click a node or connection to edit it in the inspector; press Delete to remove.', 'Use Auto layout to tidy; scroll to zoom, drag background to pan.'] },
  canvas: { title: 'Canvas', steps: ['Choose an element kind and press “+ Add element”.', 'Drag to move and drag the bottom-right corner to resize (snaps to a grid).', 'Select an element to edit label, kind and exact position.'] },
  checklist: { title: 'Checklist', steps: ['Tick items as they are completed; add or remove items and groups as needed.'] },
  richtext: { title: 'Notes', steps: ['Write Markdown on the left and see the preview on the right.', 'Raw HTML is not rendered.'] },
  formulas: { title: 'Formulas', steps: ['Write an expression using variables, e.g. base * (1 + level * 0.1).', 'Functions: min, max, sqrt, abs, floor, ceil, round, pow, log.', 'Set test values for variables and use the plot to see the curve.'] },
}

export const getHelp = (docId: string, sec?: SectionDef) => ({
  module: MODULE_HELP[docId] ?? DEFAULT,
  kind: sec ? KIND_HELP[sec.kind] : undefined,
})
