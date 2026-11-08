import { catalog, f, mod, s, section, v } from './helpers'

const ADR_STATUS = ['Proposed', 'Accepted', 'Deprecated', 'Superseded']
const STATUS = ['Planned', 'In progress', 'Done', 'Blocked']

/** Default layers, lowest first. Fixed ids so the v1 → v2 migration can point modules at them. */
export const DEFAULT_LAYERS = [
  { id: 'layer-core', name: 'Core', order: 0, description: 'Engine-independent foundations: ids, events, math, services.' },
  { id: 'layer-persistence', name: 'Persistence', order: 1, description: 'Saving, loading and data assets.' },
  { id: 'layer-simulation', name: 'Simulation', order: 2, description: 'Town, NPC and economy ticks.' },
  { id: 'layer-gameplay', name: 'Gameplay', order: 3, description: 'Player, combat, items, quests.' },
  { id: 'layer-ui', name: 'UI', order: 4, description: 'Screens, HUD and input.' },
  { id: 'layer-tools', name: 'Tools', order: 5, description: 'Editor and debug tools; may use every layer.' },
]

/** v1 kept stack, communication, simulation and scenes as free text and the module layer as a fixed list. */
function migrateArchitecture(data: Record<string, any>) {
  const p = data.principles && typeof data.principles === 'object' ? data.principles : (data.principles = {})
  const notes: string[] = []
  for (const [key, label] of [['stack', 'Technology stack'], ['communication', 'Communication patterns'], ['simulation', 'Simulation architecture'], ['scenes', 'Scenes and lifecycle']] as const) {
    const text = typeof p[key] === 'string' ? p[key].trim() : ''
    delete p[key]
    if (text) notes.push(`${label}: ${text}`)
  }
  if (notes.length) p.legacyNotes = [p.legacyNotes, ...notes].filter(Boolean).join('\n\n')
  if (!Array.isArray(data.layers)) data.layers = DEFAULT_LAYERS.map((l) => ({ ...l }))
  const layers: Record<string, any>[] = data.layers
  for (const m of Array.isArray(data.modules) ? data.modules : []) {
    const name = typeof m.layer === 'string' ? m.layer.trim() : ''
    if (!name || layers.some((l) => l.id === name)) continue
    let layer = layers.find((l) => String(l.name ?? '').toLowerCase() === name.toLowerCase())
    if (!layer) {
      layer = { id: `layer-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, order: layers.length }
      layers.push(layer)
    }
    m.layer = layer.id
  }
}

const LOD = 'Level of detail'

// ---- Data-driven Design ----
/** Default formats with fixed ids so the v1 → v2 migration can point schemas at them. */
export const DEFAULT_FORMATS = [
  { id: 'format-so', name: 'ScriptableObject', editedIn: 'Unity Inspector', merge: 'Merges poorly', loadsAt: 'Runtime', moddable: false, whenToUse: 'Content designers edit in Unity with references to sprites and prefabs.' },
  { id: 'format-json', name: 'JSON', editedIn: 'Text editor', merge: 'Merges well', loadsAt: 'Runtime', moddable: true, whenToUse: 'Nested data that mods or tools must read and write.' },
  { id: 'format-csv', name: 'CSV', editedIn: 'Spreadsheet', merge: 'Merges well', loadsAt: 'Build time', moddable: true, whenToUse: 'Flat tables balanced in a spreadsheet: prices, stats, drop rates.' },
]
/** Design planner sections whose entries become records of a schema. */
export const CONTENT_SOURCES = [
  { label: 'Items — Items & Crafting', doc: 'design.items', section: 'items' },
  { label: 'Recipes — Items & Crafting', doc: 'design.items', section: 'recipes' },
  { label: 'Loot tables — Items & Crafting', doc: 'design.items', section: 'loot' },
  { label: 'Buildings — Town Management', doc: 'design.town', section: 'buildings' },
  { label: 'Archetypes — NPC System', doc: 'design.npc', section: 'archetypes' },
  { label: 'Jobs — NPC System', doc: 'design.npc', section: 'jobs' },
  { label: 'Life events — NPC System', doc: 'design.npc', section: 'events' },
  { label: 'Skills — Player Character', doc: 'design.player', section: 'skills' },
  { label: 'Abilities — Player Character', doc: 'design.player', section: 'abilities' },
  { label: 'Enemies — Combat', doc: 'design.combat', section: 'enemies' },
  { label: 'Bosses — Combat', doc: 'design.combat', section: 'bosses' },
  { label: 'Status effects — Combat', doc: 'design.combat', section: 'statusEffects' },
  { label: 'Biomes — World & Biomes', doc: 'design.world', section: 'biomes' },
  { label: 'Factions — Factions & Diplomacy', doc: 'design.factions', section: 'factions' },
  { label: 'Merchants — Trade & Economy', doc: 'design.trade', section: 'merchants' },
  { label: 'Weather — Time, Weather & Events', doc: 'design.timeWeather', section: 'weather' },
  { label: 'Quests — Story & Quests', doc: 'design.story', section: 'quests' },
  { label: 'Characters — Story & Quests', doc: 'design.story', section: 'characters' },
  { label: 'Screens — UI / UX', doc: 'design.ui', section: 'screens' },
]
export const LOAD_STRATEGIES = ['Preload at boot', 'With scene', 'On demand', 'Streamed']
export const VALIDATION_STAGES = ['In the editor', 'On import', 'Build / CI', 'At load']

/** v1 kept five free-text fields and the format as plain text. Text goes to notes; formats become entries with fixed ids. */
function migrateDataDriven(data: Record<string, any>) {
  const pr = data.principle && typeof data.principle === 'object' ? data.principle : (data.principle = {})
  const notes: string[] = []
  for (const [key, label] of [['formats', 'Formats'], ['ids', 'ID and reference conventions'], ['loading', 'Loading and Addressables'], ['validation', 'Validation and editor tools'], ['modding', 'Modding']] as const) {
    const text = typeof pr[key] === 'string' ? pr[key].trim() : ''
    delete pr[key]
    if (text) notes.push(`${label}: ${text}`)
  }
  if (notes.length) pr.legacyNotes = [pr.legacyNotes, ...notes].filter(Boolean).join('\n\n')
  if (!Array.isArray(data.formats)) data.formats = DEFAULT_FORMATS.map((x) => ({ ...x }))
  const formats: Record<string, any>[] = data.formats
  for (const sc of Array.isArray(data.schemas) ? data.schemas : []) {
    const name = typeof sc?.format === 'string' ? sc.format.trim() : ''
    if (!name || formats.some((x) => x.id === name)) continue
    let fm = formats.find((x) => String(x.name ?? '').toLowerCase() === name.toLowerCase())
    if (!fm) formats.push((fm = { id: `format-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name }))
    sc.format = fm.id
  }
}


// ---- Coding Standards ----
export const NAME_TARGETS = ['Namespace', 'Class / struct', 'Interface', 'Method', 'Property', 'Public field', 'Private field', 'Constant', 'Enum value', 'Event', 'Parameter / local', 'Script file', 'Prefab', 'Scene', 'ScriptableObject asset', 'Texture / sprite', 'Material', 'Animation', 'Audio', 'Folder', 'Other']
export const CASINGS = ['PascalCase', 'camelCase', 'UPPER_SNAKE', 'snake_case', 'kebab-case', 'Any']
/** Everything except 'Manual' counts as automated. */
export const ENFORCEMENT = ['Manual', 'IDE / .editorconfig', 'Roslyn analyzer', 'CI check', 'Asset validator']
export const SEVERITY = ['Blocker', 'Major', 'Minor', 'Nit']
const OWNERSHIP = ['Free', 'Team-owned', 'Generated (don’t edit)', 'Third-party (don’t edit)']
const ASSET_TYPES = ['Prefab', 'Prefab variant', 'Scene', 'ScriptableObject', 'Addressable group', 'Texture / sprite', 'Material', 'Animation', 'Audio', 'Other']
const MITIGATIONS = ['None', 'One editor at a time', 'Nested prefabs', 'Additive scenes', 'UnityYAMLMerge', 'LFS lock']
const REVIEW_CATEGORIES = ['Correctness', 'Architecture', 'Naming & style', 'Performance', 'Unity assets', 'Tests', 'Security', 'Docs']

/** v1 kept five free-text fields and a grouped checklist. Text goes to notes; checklist items become checks with the same ids. */
function migrateCoding(data: Record<string, any>) {
  const st = data.standards && typeof data.standards === 'object' ? data.standards : (data.standards = {})
  const notes: string[] = []
  for (const [key, label] of [['naming', 'Naming conventions'], ['style', 'Code style / analyzers'], ['structure', 'Folder structure'], ['assets', 'Prefab, scene and ScriptableObject rules'], ['git', 'Git workflow']] as const) {
    const text = typeof st[key] === 'string' ? st[key].trim() : ''
    delete st[key]
    if (text) notes.push(`${label}: ${text}`)
  }
  if (notes.length) st.legacyNotes = [st.legacyNotes, ...notes].filter(Boolean).join('\n\n')
  const old = data.review
  if (Array.isArray(old)) return
  const checks: Record<string, any>[] = []
  for (const g of Array.isArray(old?.groups) ? old.groups : []) {
    const title = typeof g?.title === 'string' ? g.title.trim() : ''
    const category = REVIEW_CATEGORIES.find((c) => c.toLowerCase() === title.toLowerCase())
    for (const it of Array.isArray(g?.items) ? g.items : []) {
      if (!it || typeof it !== 'object') continue
      checks.push({ id: String(it.id ?? `check-${checks.length + 1}`), name: String(it.text ?? '').trim() || 'Check', ...(category ? { category } : title ? { group: title } : {}), adopted: !!it.done })
    }
  }
  data.review = checks
}

export const technicalModules = [
  {
    ...mod('technical', 'architecture', 'Technical Architecture', 'docs/02_technical/architecture.md', '🏗️', 'Layers, modules, messages, simulation ticks, scenes, extension points.', [
      s.form('principles', 'Goals and principles', [
        f.long('goals', 'Goals and principles', { placeholder: 'e.g. Extend content without touching core code; modules testable in isolation.' }),
        f.long('legacyNotes', 'Notes from the earlier version', { help: 'Free text moved here by the upgrade. Turn it into Stack, Channels, Simulation and Scene entries, then clear it.' }),
      ]),
      s.collection(
        'stack',
        'Technology stack',
        'technology',
        [
          f.enm('category', 'Category', ['Engine', 'Render pipeline', 'Package', 'Library', 'Service', 'Tool']),
          f.text('version', 'Version'),
          f.long('purpose', 'Purpose'),
          f.multi('usedBy', 'Used by modules', section('modules')),
          f.enm('risk', 'Risk', ['Low', 'Medium', 'High'], { help: 'Lock-in, licence, maturity or upgrade risk.' }),
          f.text('license', 'Licence'),
        ],
        [v.kanban('category'), v.table(['name', 'category', 'version', 'risk', 'usedBy'])],
        { description: 'Engine, render pipeline, packages and services the game builds on.' },
      ),
      s.collection(
        'layers',
        'Systems overview (layers)',
        'layer',
        [
          f.num('order', 'Order (lowest first)', { help: 'A module may depend on its own layer and lower layers.' }),
          f.multi('mayUse', 'May also use', section('layers'), { help: 'Extra layers this one may depend on, e.g. Tools uses everything. Higher layers listed here are allowed.' }),
          f.long('description', 'Description'),
        ],
        [v.archLayerStack(), v.table(['name', 'order', 'mayUse'])],
        { description: 'The layer rule: dependencies point down. The Layer diagram under Modules marks every upward dependency.', seed: DEFAULT_LAYERS.map(({ name, order, description }) => ({ name, order, description })) },
      ),
      s.collection(
        'modules',
        'Modules / assemblies',
        'module',
        [
          f.ref('layer', 'Layer', section('layers')),
          f.text('assembly', 'Assembly name', { placeholder: 'e.g. HoH.Simulation' }),
          f.long('responsibility', 'Responsibility'),
          f.multi('dependsOn', 'Depends on', section('modules')),
          f.long('api', 'Public API'),
          f.enm('status', 'Status', STATUS),
        ],
        [v.archLayers(), v.archMatrix(), v.archCoupling(), v.cards(), v.table(['name', 'layer', 'dependsOn', 'status'])],
        { description: 'One entry per assembly. Draw dependencies here; the views check layer direction, cycles and coupling.' },
      ),
      s.graph('dependencies', 'External systems diagram (optional)', ['Module', 'Layer', 'External'], {
        nodeSource: section('modules'),
        edgeKinds: ['depends on', 'publishes events to'],
        description: 'Optional: sketch how modules connect to external systems (platform services, packages, servers). Module-to-module dependencies live in Modules → Depends on, and the Layer diagram draws them for you.',
      }),
      s.collection(
        'channels',
        'Communication channels',
        'channel',
        [
          f.enm('kind', 'Kind', ['Event bus', 'ScriptableObject channel', 'Direct call', 'DI service', 'Message queue']),
          f.multi('publishers', 'Published by', section('modules')),
          f.multi('subscribers', 'Listened to by', section('modules')),
          f.text('payload', 'Payload', { placeholder: 'e.g. NpcId, NeedId, amount' }),
          f.enm('frequency', 'How often', ['Rare', 'Per player action', 'Per tick', 'Per frame']),
          f.long('notes', 'Notes'),
        ],
        [v.archMessages(), v.table(['name', 'kind', 'publishers', 'subscribers', 'frequency'])],
        { description: 'Events, ScriptableObject channels and services that modules talk through instead of direct references.' },
      ),
      s.collection(
        'extensionPoints',
        'Extension points',
        'extension point',
        [
          f.ref('host', 'Host module', section('modules')),
          f.enm('kind', 'Kind', ['Data asset', 'Interface / plugin', 'Event hook', 'ScriptableObject', 'Mod script']),
          f.multi('schemas', 'Extends data schemas', section('schemas', 'technical.dataDriven'), { help: 'Data-driven Design schemas this point lets designers add without code.' }),
          f.long('how', 'How to extend'),
          f.long('example', 'Example'),
        ],
        [v.archExtensions(), v.cards(), v.table(['name', 'host', 'kind', 'schemas'])],
        { description: 'How new needs, stats, buildings or items get in without changing core code.' },
      ),
      s.form(
        'simulation',
        'Simulation architecture',
        [
          f.num('tickRate', 'Simulation ticks per second', { min: 0, step: 0.1, help: 'Default 10.' }),
          f.num('targetFps', 'Target frame rate', { min: 1, help: 'Default 60. Sets the frame budget.' }),
          f.num('simShare', 'Share of a frame for simulation (%)', { min: 0, max: 100, help: 'Default 25.' }),
          f.num('farInstances', 'Far instances (bases / regions on low detail)', { min: 0, help: 'How many copies of the far-LOD work run. Default 0.' }),
          f.long('scheduling', 'Scheduling and ordering'),
          f.long('lod', LOD),
        ],
        'Planning numbers for the Tick schedule view below. Estimates, not a profile.',
      ),
      s.collection(
        'systems',
        'Simulation systems',
        'system',
        [
          f.ref('module', 'Module', section('modules')),
          f.num('every', 'Runs every N ticks', { min: 1, help: 'Default 1 (every tick).', group: 'Near' }),
          f.num('costMs', 'Cost per run (ms)', { min: 0, step: 0.01, group: 'Near' }),
          f.num('farEvery', 'Far: runs every N ticks', { min: 1, help: 'Low-detail rate for far instances. Empty: not simulated far away.', group: LOD }),
          f.num('farCostMs', 'Far: cost per run (ms)', { min: 0, step: 0.01, group: LOD }),
          f.enm('thread', 'Runs on', ['Main thread', 'Jobs / Burst', 'Async']),
          f.num('order', 'Order in tick'),
          f.long('notes', 'Notes'),
        ],
        [v.archTicks(), v.table(['name', 'module', 'every', 'costMs', 'farEvery', 'thread'])],
        { description: 'Systems that run on the simulation tick, with their cost and low-detail rate.' },
      ),
      s.collection(
        'scenes',
        'Scenes and lifecycle',
        'scene',
        [
          f.enm('kind', 'Kind', ['Bootstrap', 'Persistent', 'Loading', 'Level', 'Additive UI']),
          f.num('loadOrder', 'Load order', { help: 'Bootstrap first. Scenes with the same order load together.' }),
          f.multi('loads', 'Initialises modules', section('modules')),
          f.multi('next', 'Can go to', section('scenes')),
          f.num('loadSeconds', 'Estimated load time (s)', { min: 0, step: 0.1 }),
          f.long('notes', 'Notes'),
        ],
        [v.archBoot(), v.table(['name', 'kind', 'loadOrder', 'loads', 'next'])],
        { description: 'Scene structure, bootstrap and what each scene brings up.' },
      ),
    ]),
    version: 2,
    migrate: migrateArchitecture,
  },
  {
    ...mod('technical', 'coding', 'Coding Standards', 'docs/02_technical/coding_standards.md', '📏', 'Naming rules, folders, asset rules, Git flow and review.', [
      s.form(
        'standards',
        'Principles',
        [
          f.long('principles', 'Principles', { placeholder: 'e.g. Code reads like the design doc; the analyzer, not the reviewer, catches style.' }),
          f.long('legacyNotes', 'Notes from the earlier version', { help: 'Free text moved here by the upgrade. Turn it into naming rules, folders, asset rules and branches, then clear it.' }),
        ],
        'The few ideas every rule below serves.',
      ),
      s.collection(
        'naming',
        'Naming conventions',
        'naming rule',
        [
          f.enm('target', 'Applies to', NAME_TARGETS),
          f.enm('casing', 'Casing', CASINGS),
          f.text('prefix', 'Prefix', { placeholder: 'e.g. I, _, SO_' }),
          f.text('suffix', 'Suffix', { placeholder: 'e.g. Async, Controller, _Variant' }),
          f.text('pattern', 'Custom pattern (regex)', { help: 'Optional. Overrides casing, prefix and suffix, e.g. ^HoH(\\.[A-Z][A-Za-z0-9]*)+$', group: 'Advanced' }),
          f.text('example', 'Good example', { placeholder: 'e.g. IDamageable' }),
          f.text('counterExample', 'Bad example', { placeholder: 'e.g. Damageable' }),
          f.enm('enforcement', 'Enforced by', ENFORCEMENT),
          f.enm('severity', 'Severity', SEVERITY),
          f.long('notes', 'Notes'),
        ],
        [v.codingNaming(), v.table(['name', 'target', 'casing', 'prefix', 'suffix', 'example', 'enforcement'])],
        { description: 'One rule per kind of name. The Rule tester checks any name against every rule, and Architecture assemblies against the Namespace rule.' },
      ),
      s.form(
        'style',
        'Code style and analyzers',
        [
          f.enm('indent', 'Indentation', ['Spaces', 'Tabs']),
          f.num('indentSize', 'Indent size', { min: 1, max: 8 }),
          f.num('lineLength', 'Max line length', { min: 40 }),
          f.enm('braces', 'Brace style', ['Allman (new line)', 'K&R (same line)']),
          f.enm('varUsage', 'Use of var', ['Always', 'When the type is obvious', 'Never']),
          f.bool('nullable', 'Nullable reference types on'),
          f.long('analyzers', 'Analyzers and .editorconfig', { placeholder: 'e.g. Microsoft.Unity.Analyzers, .editorconfig at repo root, warnings as errors in CI.' }),
          f.long('notes', 'Other style rules'),
        ],
        'Formatting the IDE and analyzers enforce, so reviews can skip it.',
      ),
      s.collection(
        'folders',
        'Unity project folder structure',
        'folder',
        [
          f.ref('parent', 'Parent folder', section('folders'), { help: 'Empty = directly under Assets/.' }),
          f.long('purpose', 'What goes here'),
          f.list('contents', 'File types', { placeholder: 'e.g. .cs, .prefab' }),
          f.ref('module', 'Architecture module', section('modules', 'technical.architecture'), { help: 'The Technical Architecture module whose code or assets live here.' }),
          f.bool('asmdef', 'Has an .asmdef'),
          f.enm('ownership', 'Editing rule', OWNERSHIP),
          f.long('notes', 'Notes'),
        ],
        [v.codingFolders(), v.table(['name', 'parent', 'module', 'asmdef', 'ownership'])],
        { description: 'The Assets/ tree: what goes where and which Architecture module owns it.' },
      ),
      s.collection(
        'assetRules',
        'Prefab, scene and ScriptableObject rules',
        'asset rule',
        [
          f.enm('assetType', 'Asset type', ASSET_TYPES),
          f.ref('folder', 'Lives in', section('folders')),
          f.long('rule', 'Rule'),
          f.enm('mergeRisk', 'Merge-conflict risk', ['Low', 'Medium', 'High']),
          f.enm('mitigation', 'Conflict mitigation', MITIGATIONS),
          f.enm('enforcement', 'Enforced by', ENFORCEMENT),
          f.enm('severity', 'Severity', SEVERITY),
        ],
        [v.kanban('assetType'), v.table(['name', 'assetType', 'folder', 'mergeRisk', 'mitigation'])],
        { description: 'Naming, variants and how to avoid merge conflicts in Unity’s YAML assets.' },
      ),
      s.collection(
        'branches',
        'Git workflow: branches',
        'branch type',
        [
          f.text('pattern', 'Name pattern', { placeholder: 'e.g. feature/<ticket>-<desc>', help: '<word> stands for any text without “/”; * for anything.' }),
          f.ref('from', 'Branches from', section('branches')),
          f.multi('mergesInto', 'Merges into', section('branches')),
          f.enm('lifetime', 'Lifetime', ['Permanent', 'Until release', 'Days', 'Hours']),
          f.bool('protected', 'Protected'),
          f.enm('mergeMethod', 'Merge method', ['Merge commit', 'Squash', 'Rebase', 'Fast-forward']),
          f.num('approvals', 'Required approvals', { min: 0 }),
          f.bool('ciRequired', 'CI must pass'),
          f.long('notes', 'Notes'),
        ],
        [v.codingGit(), v.table(['name', 'pattern', 'from', 'mergesInto', 'lifetime', 'mergeMethod', 'approvals'])],
        { description: 'Branch types, where each starts and where it merges back.' },
      ),
      s.form(
        'git',
        'Git workflow: commits, PRs and LFS',
        [
          f.enm('commitFormat', 'Commit message format', ['Conventional Commits', 'Ticket prefix', 'Free']),
          f.text('commitExample', 'Commit example', { placeholder: 'e.g. feat(npc): add hunger decay' }),
          f.long('prRules', 'Pull request rules'),
          f.list('lfs', 'Git LFS patterns', { placeholder: 'e.g. *.psd' }),
          f.list('ignore', '.gitignore highlights', { placeholder: 'e.g. Library/' }),
          f.long('notes', 'Notes'),
        ],
        'Commit, PR and large-file rules. The Branch flow view checks LFS patterns against the asset folders.',
      ),
      s.collection(
        'review',
        'Code review checklist',
        'check',
        [
          f.enm('category', 'Category', REVIEW_CATEGORIES),
          f.enm('severity', 'Severity', SEVERITY),
          f.enm('enforcement', 'Enforced by', ENFORCEMENT),
          f.bool('adopted', 'Agreed by the team'),
          f.text('group', 'Group (from the earlier checklist)'),
          f.long('description', 'What to look for'),
        ],
        [v.codingReview(), v.kanban('category'), v.table(['name', 'category', 'severity', 'enforcement', 'adopted'])],
        { description: 'What a reviewer checks. The Enforcement board shows which rules across this document a tool already catches.' },
      ),
    ]),
    version: 2,
    migrate: migrateCoding,
  },
  {
    ...mod('technical', 'dataDriven', 'Data-driven Design', 'docs/02_technical/data_driven_design.md', '🧬', 'Formats, schemas, IDs, loading, validation and mods.', [
      s.form(
        'principle',
        'Principle',
        [
          f.long('principle', 'Principle', { placeholder: 'e.g. Every item, building, NPC and quest is a data asset; adding one never needs a code change.' }),
          f.long('legacyNotes', 'Notes from the earlier version', { help: 'Free text moved here by the upgrade. Turn it into formats, ID rules, load groups and validators, then clear it.' }),
        ],
        'Why content lives in data, not code.',
      ),
      s.collection(
        'formats',
        'Data formats',
        'format',
        [
          f.enm('editedIn', 'Edited in', ['Unity Inspector', 'Spreadsheet', 'Text editor', 'Custom tool']),
          f.enm('merge', 'Version control', ['Merges well', 'Merges poorly', 'Binary']),
          f.enm('loadsAt', 'Read at', ['Build time', 'Runtime']),
          f.bool('moddable', 'Players can add files'),
          f.long('whenToUse', 'When to use'),
        ],
        [v.cards(), v.table(['name', 'editedIn', 'merge', 'loadsAt', 'moddable'])],
        { description: 'The file formats content is authored in and when each one fits.', seed: DEFAULT_FORMATS },
      ),
      s.collection(
        'schemas',
        'Data schemas',
        'schema',
        [
          f.ref('format', 'Format', section('formats')),
          f.enm('source', 'Content planner', CONTENT_SOURCES.map((c) => c.label), { help: 'The design planner whose entries become records of this schema. Gives the record count.' }),
          f.text('idPrefix', 'ID prefix', { placeholder: 'e.g. item.' }),
          f.list('required', 'Required fields (name: type)', { placeholder: 'e.g. output: Item' }),
          f.list('optional', 'Optional fields (name: type)', { placeholder: 'e.g. tags: string[]' }),
          f.long('validation', 'Validation rules'),
          f.text('editorTool', 'Editor tool', { placeholder: 'e.g. Custom inspector with preview', group: 'Pipeline' }),
          f.num('avgSizeKb', 'Average record size (KB)', { min: 0, step: 0.1, help: 'Including referenced sprites or audio. Default 4.', group: 'Pipeline' }),
          f.num('records', 'Record count', { min: 0, help: 'Used when no content planner is set, or to override it.', group: 'Pipeline' }),
          f.num('version', 'Schema version', { min: 1, group: 'Pipeline' }),
          f.bool('moddable', 'Moddable', { group: 'Pipeline' }),
        ],
        [v.dataModel(), v.dataTester(), v.dataReadiness(), v.table(['name', 'format', 'source', 'idPrefix', 'required'])],
        { description: 'One schema per content type. A type that names another schema (Item, Item[]) is a reference and shows as an arrow in the Data model.', seed: ['Item', 'Building', 'NPC need', 'Recipe', 'Enemy', 'Quest'].map((name) => ({ name })) },
      ),
      s.form(
        'ids',
        'IDs and references',
        [
          f.enm('casing', 'ID casing (after the prefix)', ['snake_case', 'kebab-case', 'camelCase', 'PascalCase']),
          f.text('example', 'Example ID', { placeholder: 'e.g. item.iron_sword' }),
          f.enm('resolution', 'References are stored as', ['ID string', 'Direct asset reference', 'Addressables key', 'GUID']),
          f.long('stability', 'Renames and stability', { placeholder: 'e.g. IDs never change after release; renames add an alias.' }),
          f.long('notes', 'Notes'),
        ],
        'How records are identified and how one record points at another. The Record tester checks IDs against these rules.',
      ),
      s.collection(
        'loadGroups',
        'Loading and Addressables',
        'load group',
        [
          f.multi('schemas', 'Schemas', section('schemas')),
          f.enm('strategy', 'Loaded', LOAD_STRATEGIES),
          f.ref('scene', 'With scene', section('scenes', 'technical.architecture'), { help: 'For “With scene”: the Technical Architecture scene that loads this group.' }),
          f.text('label', 'Addressables label', { placeholder: 'e.g. content-items' }),
          f.num('budgetMb', 'Memory budget (MB)', { min: 0, step: 0.1 }),
          f.long('notes', 'Notes'),
        ],
        [v.dataLoadPlan(), v.table(['name', 'schemas', 'strategy', 'scene', 'budgetMb'])],
        { description: 'Which schemas load together and when. The Load plan estimates their size from record counts.' },
      ),
      s.collection(
        'validators',
        'Validation and editor tools',
        'validator',
        [
          f.ref('schema', 'Schema', section('schemas'), { help: 'Empty = applies to every schema.' }),
          f.text('field', 'Field'),
          f.enm('kind', 'Check', ['Required', 'Range', 'Unique ID', 'Reference exists', 'Pattern', 'Custom']),
          f.enm('when', 'Runs', VALIDATION_STAGES),
          f.enm('severity', 'Severity', ['Error', 'Warning']),
          f.text('tool', 'Tool', { placeholder: 'e.g. OnValidate, import script, CI job' }),
          f.long('notes', 'Notes'),
        ],
        [v.kanban('when'), v.table(['name', 'schema', 'field', 'kind', 'when', 'severity'])],
        { description: 'Automatic checks on content and where they run, earliest first.' },
      ),
      s.form(
        'modding',
        'Mods and extensibility',
        [
          f.enm('support', 'Mod support', ['None', 'Data mods', 'Data + scripts']),
          f.text('folder', 'Mod folder', { placeholder: 'e.g. %AppData%/HandsOfHubris/Mods' }),
          f.long('loadOrder', 'Load order and conflicts'),
          f.long('notes', 'Notes'),
        ],
        'Mark moddable schemas under Data schemas → Pipeline. Pipeline readiness shows which have an Architecture extension point.',
      ),
    ]),
    version: 2,
    migrate: migrateDataDriven,
  },
  mod('technical', 'save', 'Save System', 'docs/02_technical/save_system.md', '💾', 'What and how to save.', [
    s.form('save', 'Save system', [
      f.long('requirements', 'What is saved'),
      f.long('format', 'Format and storage'),
      f.long('versioning', 'Versioning and migration'),
      f.long('autosave', 'Autosave and integrity'),
      f.long('performance', 'Performance'),
    ]),
  ]),
  mod('technical', 'ai', 'AI Systems', 'docs/02_technical/ai_systems.md', '🤖', 'NPC, enemy and economy AI.', [
    s.form('approach', 'Approach', [
      f.long('approach', 'Behavior tree / Utility AI / GOAP / FSM, and why'),
      f.long('navigation', 'Navigation'),
      f.long('npc', 'NPC schedule and task assignment'),
      f.long('enemy', 'Enemy AI'),
      f.long('economy', 'Economic simulation'),
      f.long('debug', 'Debug and visualization'),
    ]),
    s.graph('behavior', 'Behavior tree / state machine', ['Selector', 'Sequence', 'Condition', 'Action', 'State'], { edgeKinds: ['child', 'transition'] }),
  ]),
  mod('technical', 'performance', 'Performance', 'docs/02_technical/performance.md', '⚡', 'Targets and budgets.', [
    s.collection(
      'budgets',
      'Budgets',
      'budget',
      [
        f.text('platform', 'Platform'),
        f.text('metric', 'Metric'),
        f.num('target', 'Target'),
        f.num('current', 'Current'),
        f.text('unit', 'Unit'),
      ],
      [v.table(), v.cards()],
    ),
    s.form('techniques', 'Techniques', [f.long('techniques', 'Pooling, LOD, streaming, Jobs/Burst'), f.long('profiling', 'Profiling process')]),
    s.collection('bottlenecks', 'Known bottlenecks', 'bottleneck', [f.long('description', 'Description'), f.enm('status', 'Status', ['Open', 'Investigating', 'Fixed'])], [v.kanban('status'), v.table()]),
  ]),
  mod('technical', 'tools', 'Tools & Build Pipeline', 'docs/02_technical/tools_pipeline.md', '🔧', 'Environment, tools, CI/CD.', [
    s.form('env', 'Environment', [
      f.long('environment', 'Development environment'),
      f.long('tools', 'Editor tools'),
      f.long('build', 'Build and CI/CD'),
      f.long('localization', 'Localization pipeline'),
      f.long('logging', 'Logging and telemetry'),
    ]),
    s.checklist('setup', 'Setup checklist'),
  ]),
  mod('technical', 'adr', 'Architecture Decision Records', 'docs/adr/README.md', '🧾', 'Technical decision log.', [
    s.collection(
      'adrs',
      'ADRs',
      'ADR',
      [
        f.num('number', 'Number', { min: 1 }),
        f.enm('status', 'Status', ADR_STATUS),
        f.text('date', 'Date'),
        f.text('deciders', 'Deciders'),
        f.long('context', 'Context'),
        f.long('criteria', 'Decision criteria'),
        f.long('options', 'Options considered'),
        f.long('decision', 'Decision'),
        f.long('consequences', 'Consequences'),
        f.ref('supersedes', 'Supersedes', section('adrs')),
      ],
      [v.kanban('status'), v.table(['number', 'name', 'status', 'date']), v.cards()],
    ),
  ]),
]

export const artAudioModules = [
  mod('artAudio', 'art', 'Art Direction', 'docs/03_art_audio/art_direction.md', '🎨', 'Style, palettes, references.', [
    s.form('style', 'Style', [
      f.long('style', 'Visual style and references'),
      f.long('characters', 'Character and enemy design guidelines'),
      f.long('contrast', 'Industrial Revolution / magic contrast'),
      f.long('ui', 'UI visual style'),
      f.long('vfx', 'VFX and animation'),
    ]),
    s.collection(
      'palettes',
      'Palettes & style cards',
      'style card',
      [
        f.enm('scope', 'Scope', ['Global', 'Faction', 'Biome', 'UI', 'Time of day']),
        f.color('c1', 'Color 1'),
        f.color('c2', 'Color 2'),
        f.color('c3', 'Color 3'),
        f.color('c4', 'Color 4'),
        f.long('notes', 'Notes'),
        f.list('references', 'Reference URLs'),
      ],
      [v.cards(), v.kanban('scope')],
    ),
  ]),
  mod('artAudio', 'audio', 'Audio Direction', 'docs/03_art_audio/audio_direction.md', '🎵', 'Music and SFX.', [
    s.form('mood', 'Mood', [f.long('mood', 'Mood and references'), f.long('mixing', 'Mixing and implementation (middleware)'), f.long('voice', 'Voice-over')]),
    s.collection(
      'music',
      'Music themes',
      'theme',
      [
        f.ref('biome', 'Biome', section('biomes', 'design.world')),
        f.ref('faction', 'Faction', section('factions', 'design.factions')),
        f.ref('time', 'Time of day', catalog('timeOfDay')),
        f.long('notes', 'Adaptive rules / mood'),
      ],
      [v.table(), v.cards()],
    ),
    s.collection('sfx', 'SFX categories', 'category', [f.num('volume', 'Volume (dB)'), f.long('notes', 'Notes')], [v.table()]),
  ]),
  mod('artAudio', 'assets', 'Asset Pipeline', 'docs/03_art_audio/asset_pipeline.md', '📦', 'Asset workflow and status.', [
    s.form('workflow', 'Workflow', [f.long('workflow', 'Concept → model/sprite → import → integration → approval'), f.long('naming', 'Naming and folder structure')]),
    s.collection(
      'specs',
      'Format specs',
      'spec',
      [f.text('format', 'Format'), f.text('limit', 'Resolution / poly limit'), f.long('import', 'Import settings')],
      [v.table()],
    ),
    s.collection(
      'assets',
      'Assets',
      'asset',
      [
        f.text('type', 'Type'),
        f.text('owner', 'Owner'),
        f.enm('status', 'Status', ['Concept', 'In production', 'Review', 'Approved', 'Integrated']),
        f.text('link', 'Link'),
        f.text('license', 'License / source'),
      ],
      [v.kanban('status'), v.table()],
    ),
  ]),
]

export const productionModules = [
  mod('production', 'milestones', 'Milestones', 'docs/04_production/milestones.md', '🚩', 'Milestone cards and timeline.', [
    s.collection(
      'milestones',
      'Milestones',
      'milestone',
      [
        f.num('start', 'Start (week)', { min: 0 }),
        f.num('duration', 'Duration (weeks)', { min: 0 }),
        f.text('due', 'Due date'),
        f.long('goal', 'Goal'),
        f.list('deliverables', 'Deliverables'),
        f.check('acceptance', 'Acceptance criteria'),
        f.text('owners', 'Owners'),
        f.enm('status', 'Status', STATUS),
        f.long('retro', 'Retrospective'),
      ],
      [v.timeline('start', 'duration', 'wk'), v.kanban('status'), v.cards()],
    ),
  ]),
  mod('production', 'backlog', 'Backlog', 'docs/04_production/backlog.md', '📋', 'Features, priorities, status.', [
    s.form('rules', 'Rules', [f.long('rules', 'Priority scale, labels, definition of ready / done')]),
    s.collection(
      'features',
      'Features',
      'feature',
      [
        f.text('area', 'Area'),
        f.enm('priority', 'Priority', ['P0', 'P1', 'P2', 'P3']),
        f.num('estimate', 'Estimate', { min: 0 }),
        f.ref('milestone', 'Milestone', section('milestones', 'production.milestones')),
        f.enm('status', 'Status', ['Backlog', 'Ready', 'In progress', 'Review', 'Done']),
        f.text('spec', 'Spec link'),
      ],
      [v.kanban('status'), v.table(), v.cards()],
    ),
  ]),
  mod('production', 'risks', 'Risk Register', 'docs/04_production/risk_register.md', '⚠️', '5×5 risk matrix.', [
    s.collection(
      'risks',
      'Risks',
      'risk',
      [
        f.enm('category', 'Category', ['Technical', 'Scope', 'Resource', 'Market']),
        f.num('probability', 'Probability (1–5)', { min: 1, max: 5 }),
        f.num('impact', 'Impact (1–5)', { min: 1, max: 5 }),
        f.long('mitigation', 'Prevention'),
        f.long('contingency', 'Contingency'),
        f.text('owner', 'Owner'),
        f.enm('status', 'Status', ['Open', 'Mitigated', 'Occurred', 'Closed']),
      ],
      [v.grid2d('probability', 'impact', 5), v.table(), v.kanban('status')],
      { seed: [{ name: 'Scope creep in the town simulation', category: 'Scope', probability: 4, impact: 4, status: 'Open' }] },
    ),
  ]),
  mod('production', 'team', 'Team & Workflow', 'docs/04_production/team_workflow.md', '👥', 'Roles, methodology, DoD.', [
    s.collection('members', 'Roles', 'member', [f.text('role', 'Role'), f.long('responsibility', 'Responsibility')], [v.table(), v.cards()]),
    s.form('method', 'Methodology', [f.long('method', 'Sprint length, ceremonies'), f.long('communication', 'Communication'), f.long('docs', 'Documentation process')]),
    s.checklist('dod', 'Definition of Done'),
    s.graph('process', 'Workflow diagram', ['Step', 'Decision', 'Start', 'End'], { edgeKinds: ['next', 'yes', 'no'] }),
  ]),
  mod('production', 'release', 'Release Checklist', 'docs/04_production/release_checklist.md', '🚀', 'Pre-release checklist.', [
    s.checklist('checklist', 'Checklist'),
  ]),
]

export const qaModules = [
  mod('qa', 'testPlan', 'Test Plan', 'docs/05_qa/test_plan.md', '🧪', 'Strategy and test cases.', [
    s.form('strategy', 'Strategy', [f.long('strategy', 'Goals, scope, levels'), f.long('automated', 'Automated tests'), f.long('manual', 'Manual testing'), f.long('compat', 'Compatibility and performance matrix'), f.long('soak', 'Long-running simulation (economy / NPC life cycle)')]),
    s.collection(
      'cases',
      'Test cases',
      'test case',
      [
        f.text('area', 'Area'),
        f.long('precondition', 'Precondition'),
        f.long('steps', 'Steps'),
        f.long('expected', 'Expected result'),
        f.enm('status', 'Status', ['Not run', 'Passed', 'Failed', 'Blocked']),
      ],
      [v.kanban('status'), v.table()],
    ),
  ]),
  mod('qa', 'balance', 'Balance Plan', 'docs/05_qa/balance_plan.md', '📊', 'Targets, metrics, change log.', [
    s.form('goals', 'Goals', [f.long('goals', 'Balance goals per difficulty'), f.long('playtest', 'Playtest process')]),
    s.collection(
      'metrics',
      'Metrics',
      'metric',
      [f.text('unit', 'Unit'), f.num('target', 'Target'), f.num('current', 'Current'), f.long('notes', 'Notes')],
      [v.table(), v.cards()],
    ),
    s.collection('changes', 'Change log', 'change', [f.text('date', 'Date'), f.long('reason', 'Reason'), f.long('impact', 'Impact')], [v.table()]),
  ]),
  mod('qa', 'bugs', 'Bug Reports', 'docs/05_qa/bug_report_template.md', '🐞', 'Bug tracker.', [
    s.collection(
      'bugs',
      'Bugs',
      'bug',
      [
        f.enm('severity', 'Severity', ['Blocker', 'Major', 'Medium', 'Minor']),
        f.text('version', 'Version / build'),
        f.text('platform', 'Platform'),
        f.text('area', 'Area'),
        f.long('steps', 'Reproduction steps'),
        f.long('expected', 'Expected'),
        f.long('actual', 'Actual'),
        f.enm('repro', 'Reproducibility', ['Always', 'Sometimes', 'Once']),
        f.list('attachments', 'Attachments'),
        f.enm('status', 'Status', ['New', 'Confirmed', 'In progress', 'Fixed', 'Closed']),
      ],
      [v.kanban('status'), v.table(), v.kanban('severity')],
    ),
  ]),
]

export const templateModules = [
  mod('templates', 'featureSpec', 'Feature Specifications', 'docs/templates/feature_spec_template.md', '📝', 'Detailed feature specs.', [
    s.collection(
      'specs',
      'Feature specs',
      'feature spec',
      [
        f.enm('status', 'Status', ['Draft', 'Accepted', 'Implemented']),
        f.text('owner', 'Owner'),
        f.text('designDoc', 'Related design doc'),
        f.long('goal', 'Goal and rationale'),
        f.list('scopeIn', 'In scope'),
        f.list('scopeOut', 'Out of scope'),
        f.list('stories', 'User stories'),
        f.long('rules', 'Rules and behavior'),
        f.long('data', 'Data and parameters'),
        f.long('ui', 'UI/UX, audio and art needs'),
        f.long('tech', 'Technical considerations'),
        f.long('difficulty', 'Difficulty impact (Easy / Medium / Hard)'),
        f.long('edgeCases', 'Edge cases and risks'),
        f.check('acceptance', 'Acceptance criteria'),
        f.long('tests', 'Test plan'),
      ],
      [v.kanban('status'), v.cards(), v.table(['name', 'status', 'owner'])],
    ),
  ]),
  mod('custom', 'entities', 'Custom Entity Types', 'docs/custom_entities.md', '🧩', 'Your own entity types defined in Definitions.', (registry) =>
    registry.entityTypes.map((t) => ({
      id: t.id,
      title: t.name,
      kind: 'collection' as const,
      singular: t.name,
      fields: [{ key: 'name', label: 'Name', type: 'text' as const, required: true }, ...t.fields],
      views: [{ kind: 'cards' as const }, { kind: 'table' as const }],
    })),
  ),
]
