import { archModules, branchFlow, CODING_DOC, codingList, enforcementRows, exampleIssues, moduleFolders } from '../../core/coding'
import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'

const data = (p: Project): Record<string, any> => {
  if (!p.documents[CODING_DOC]) p.documents[CODING_DOC] = { moduleVersion: 2, data: {} }
  return p.documents[CODING_DOC].data
}
const ensureList = (p: Project, section: string): Entity[] => {
  const d = data(p)
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const ensureForm = (p: Project, section: string): Record<string, any> => {
  const d = data(p)
  if (!d[section] || typeof d[section] !== 'object' || Array.isArray(d[section])) d[section] = {}
  return d[section]
}
const byName = (list: Entity[], name: string) => list.find((e) => String(e.name ?? '').toLowerCase() === name.toLowerCase())
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
/** Adds entries whose name is not there yet; returns the (existing or new) entry. */
const upsert = (list: Entity[], e: Record<string, unknown>) => {
  let x = byName(list, String(e.name))
  if (!x) list.push((x = { id: makeId(), ...e }))
  return x
}

const csharpExample: GuideExample = {
  id: 'coding-csharp-names',
  section: 'naming',
  title: 'C# code names (Unity)',
  description: 'PascalCase types and members, I-prefixed interfaces, _camelCase private fields, UPPER_SNAKE constants and dotted HoH namespaces, each with a good and a bad example.',
  preview: 'codingNaming',
  apply: (p) => {
    const list = ensureList(p, 'naming')
    const add = (name: string, target: string, casing: string, example: string, counterExample: string, extra: Record<string, unknown> = {}) =>
      upsert(list, { name, target, casing, example, counterExample, enforcement: 'IDE / .editorconfig', severity: 'Minor', ...extra })
    add('Namespaces', 'Namespace', 'PascalCase', 'HoH.Simulation.Npc', 'hoh.simulation', { prefix: 'HoH.', enforcement: 'Roslyn analyzer' })
    add('Types', 'Class / struct', 'PascalCase', 'NpcController', 'npc_controller')
    add('Interfaces', 'Interface', 'PascalCase', 'IDamageable', 'Damageable', { prefix: 'I' })
    add('Methods', 'Method', 'PascalCase', 'ApplyDamage', 'applyDamage')
    add('Properties', 'Property', 'PascalCase', 'IsStarving', 'isStarving')
    add('Private fields', 'Private field', 'camelCase', '_hunger', 'm_Hunger', { prefix: '_' })
    add('Constants', 'Constant', 'UPPER_SNAKE', 'MAX_HUNGER', 'MaxHunger')
    add('Parameters and locals', 'Parameter / local', 'camelCase', 'amount', 'Amount')
    add('Events', 'Event', 'PascalCase', 'Died', 'onDied')
  },
}

const assetNamesExample: GuideExample = {
  id: 'coding-asset-names',
  section: 'naming',
  title: 'Asset name prefixes',
  description: 'PF_ prefabs, SO_ ScriptableObject assets, M_ materials and T_ textures with a map suffix, checked by an asset validator.',
  preview: 'codingNaming',
  apply: (p) => {
    const list = ensureList(p, 'naming')
    const add = (name: string, target: string, e: Record<string, unknown>) => upsert(list, { name, target, casing: 'PascalCase', enforcement: 'Asset validator', severity: 'Minor', ...e })
    add('Prefabs', 'Prefab', { prefix: 'PF_', example: 'PF_Blacksmith', counterExample: 'Blacksmith' })
    add('ScriptableObject assets', 'ScriptableObject asset', { prefix: 'SO_', example: 'SO_IronSword', counterExample: 'IronSwordData' })
    add('Materials', 'Material', { prefix: 'M_', example: 'M_StoneWall', counterExample: 'stone wall mat' })
    add('Textures', 'Texture / sprite', { pattern: '^T_[A-Z][A-Za-z0-9]*_(D|N|M|E)$', example: 'T_StoneWall_N', counterExample: 'T_StoneWall', notes: 'Suffix: D diffuse, N normal, M mask, E emission.' })
    add('Scenes', 'Scene', { example: 'TownHub', counterExample: 'town-hub', enforcement: 'Manual' })
  },
}

const foldersExample: GuideExample = {
  id: 'coding-unity-folders',
  section: 'folders',
  title: 'Unity _Project layout',
  description: 'Everything of ours under Assets/_Project, split into Scripts (one folder and .asmdef per Architecture module), Art, Audio, Prefabs, Scenes and Data; third-party code kept apart.',
  preview: 'codingFolders',
  apply: (p) => {
    const list = ensureList(p, 'folders')
    const add = (name: string, parent: Entity | undefined, e: Record<string, unknown> = {}) => {
      let x = list.find((f) => String(f.name ?? '').toLowerCase() === name.toLowerCase() && (f.parent ?? undefined) === parent?.id)
      if (!x) list.push((x = { id: makeId(), name, ...(parent ? { parent: parent.id } : {}), ...e }))
      return x
    }
    const root = add('_Project', undefined, { purpose: 'Everything the team makes. The underscore keeps it on top.', ownership: 'Team-owned' })
    const scripts = add('Scripts', root, { purpose: 'C# code, one sub-folder per assembly.', contents: ['.cs', '.asmdef'] })
    const mods = archModules(p)
    if (mods.length) for (const m of mods) add(String(m.name), scripts, { module: m.id, asmdef: true, contents: ['.cs', '.asmdef'], ...(text(m.responsibility) ? { purpose: text(m.responsibility) } : {}) })
    else for (const n of ['Core', 'Gameplay', 'UI']) add(n, scripts, { asmdef: true, contents: ['.cs', '.asmdef'] })
    const art = add('Art', root, { purpose: 'Source and imported art.' })
    add('Models', art, { contents: ['.fbx'] })
    add('Textures', art, { contents: ['.png', '.psd'] })
    add('Materials', art, { contents: ['.mat'] })
    add('Audio', root, { contents: ['.wav', '.ogg'] })
    add('Prefabs', root, { contents: ['.prefab'], purpose: 'Mirrors the gameplay areas: Buildings, Npcs, Items.' })
    add('Scenes', root, { contents: ['.unity'] })
    add('Data', root, { contents: ['.asset'], purpose: 'ScriptableObject content: items, buildings, needs.' })
    add('Plugins', undefined, { purpose: 'Third-party packages that are not in the Package Manager.', ownership: 'Third-party (don’t edit)' })
    add('AddressableAssetsData', undefined, { purpose: 'Generated by Addressables.', ownership: 'Generated (don’t edit)' })
  },
}

const assetRulesExample: GuideExample = {
  id: 'coding-asset-rules',
  section: 'assetRules',
  title: 'Conflict-safe Unity assets',
  description: 'Nested prefabs and variants instead of copies, additive scenes per discipline, ScriptableObjects for data, and LFS locks for binary art.',
  preview: 'codingAssets',
  apply: (p) => {
    const list = ensureList(p, 'assetRules')
    const folders = codingList(p, 'folders')
    const folder = (n: string) => byName(folders, n)?.id
    const add = (name: string, assetType: string, e: Record<string, unknown>) => upsert(list, { name, assetType, enforcement: 'Manual', severity: 'Major', ...e })
    add('Variants, not copies', 'Prefab variant', { folder: folder('Prefabs'), rule: 'Make a prefab variant when only values change; never duplicate a prefab.', mergeRisk: 'Medium', mitigation: 'Nested prefabs' })
    add('Small nested prefabs', 'Prefab', { folder: folder('Prefabs'), rule: 'Split big prefabs so two people rarely edit the same file.', mergeRisk: 'High', mitigation: 'Nested prefabs' })
    add('One scene per discipline', 'Scene', { folder: folder('Scenes'), rule: 'Level art, lighting and gameplay live in separate additive scenes.', mergeRisk: 'High', mitigation: 'Additive scenes', severity: 'Blocker' })
    add('Data in ScriptableObjects', 'ScriptableObject', { folder: folder('Data'), rule: 'Tunable numbers live in SO assets, not in scene objects.', mergeRisk: 'Low', mitigation: 'UnityYAMLMerge', enforcement: 'Asset validator' })
    add('Lock binary art', 'Texture / sprite', { folder: folder('Textures'), rule: 'Lock .psd files before editing; they cannot be merged.', mergeRisk: 'High', mitigation: 'LFS lock' })
  },
}

const linkBranches = (list: Entity[], spec: [string, string | undefined, string[]][]) => {
  for (const [name, from, into] of spec) {
    const b = byName(list, name)!
    if (from && !b.from) b.from = byName(list, from)?.id
    if (!Array.isArray(b.mergesInto) || !b.mergesInto.length) b.mergesInto = into.map((n) => byName(list, n)?.id).filter(Boolean)
  }
}

const gitFlowExample: GuideExample = {
  id: 'coding-git-flow',
  section: 'branches',
  title: 'Git flow (develop + releases)',
  description: 'Protected main and develop; feature branches off develop, release branches stabilise a build, hotfixes go to both.',
  preview: 'codingBranches',
  apply: (p) => {
    const list = ensureList(p, 'branches')
    upsert(list, { name: 'main', pattern: 'main', lifetime: 'Permanent', protected: true, mergeMethod: 'Merge commit', approvals: 1, ciRequired: true })
    upsert(list, { name: 'develop', pattern: 'develop', lifetime: 'Permanent', protected: true, mergeMethod: 'Merge commit', approvals: 1, ciRequired: true })
    upsert(list, { name: 'feature', pattern: 'feature/<ticket>-<desc>', lifetime: 'Days', mergeMethod: 'Squash', approvals: 1, ciRequired: true })
    upsert(list, { name: 'release', pattern: 'release/<version>', lifetime: 'Until release', mergeMethod: 'Merge commit', approvals: 2, ciRequired: true })
    upsert(list, { name: 'hotfix', pattern: 'hotfix/<ticket>-<desc>', lifetime: 'Hours', mergeMethod: 'Merge commit', approvals: 1, ciRequired: true })
    linkBranches(list, [['develop', 'main', []], ['feature', 'develop', ['develop']], ['release', 'develop', ['main', 'develop']], ['hotfix', 'main', ['main', 'develop']]])
  },
}

const trunkExample: GuideExample = {
  id: 'coding-trunk',
  section: 'branches',
  title: 'Trunk-based (small team)',
  description: 'One protected main; short-lived task branches squash-merged within a day or two, behind feature flags if unfinished.',
  preview: 'codingBranches',
  apply: (p) => {
    const list = ensureList(p, 'branches')
    upsert(list, { name: 'main', pattern: 'main', lifetime: 'Permanent', protected: true, mergeMethod: 'Squash', approvals: 1, ciRequired: true })
    upsert(list, { name: 'task', pattern: '<user>/<ticket>-<desc>', lifetime: 'Days', mergeMethod: 'Squash', approvals: 1, ciRequired: true, notes: 'Merge within two days; hide unfinished work behind a flag.' })
    linkBranches(list, [['task', 'main', ['main']]])
  },
}

const reviewExample: GuideExample = {
  id: 'coding-review-unity',
  section: 'review',
  title: 'Unity review checklist',
  description: 'Correctness, architecture, performance, assets and tests, with what a tool already catches marked as such.',
  preview: 'codingReview',
  apply: (p) => {
    const list = ensureList(p, 'review')
    const add = (name: string, category: string, severity: string, enforcement: string, description?: string) => upsert(list, { name, category, severity, enforcement, adopted: true, ...(description ? { description } : {}) })
    add('Compiles without warnings', 'Correctness', 'Blocker', 'CI check')
    add('All tests pass', 'Tests', 'Blocker', 'CI check')
    add('No missing references in changed prefabs', 'Unity assets', 'Blocker', 'Asset validator')
    add('Names follow the naming rules', 'Naming & style', 'Minor', 'Roslyn analyzer')
    add('Formatting matches .editorconfig', 'Naming & style', 'Nit', 'IDE / .editorconfig')
    add('Dependencies only point down a layer', 'Architecture', 'Major', 'Manual', 'Check new using directives against the Technical Architecture layers.')
    add('No allocations in Update loops', 'Performance', 'Major', 'Manual', 'No LINQ, string building or new lists per frame.')
    add('New logic has a test', 'Tests', 'Major', 'Manual')
    add('Public API has XML docs', 'Docs', 'Minor', 'Roslyn analyzer')
    add('No secrets or keys in the change', 'Security', 'Blocker', 'CI check')
  },
}

export const CODING_GUIDE: ModuleGuide = {
  map: {
    width: 1050,
    height: 330,
    nodes: [
      { id: 'principles', label: 'Principles', x: 30, y: 35, section: 'standards' },
      { id: 'naming', label: 'Naming rules', x: 240, y: 35, section: 'naming' },
      { id: 'style', label: 'Style & analyzers', x: 450, y: 35, section: 'style' },
      { id: 'review', label: 'Review & enforcement', x: 660, y: 35, section: 'review' },
      { id: 'architecture', label: 'Technical Architecture', x: 30, y: 145, doc: 'technical.architecture' },
      { id: 'folders', label: 'Folder structure', x: 240, y: 145, section: 'folders' },
      { id: 'assetRules', label: 'Asset rules', x: 450, y: 145, section: 'assetRules' },
      { id: 'git', label: 'Commits & LFS', x: 660, y: 145, section: 'git' },
      { id: 'branches', label: 'Branches', x: 660, y: 255, section: 'branches' },
      { id: 'tools', label: 'Tools & Build', x: 870, y: 255, doc: 'technical.tools' },
    ],
    edges: [
      { from: 'principles', to: 'naming', label: 'guide' },
      { from: 'architecture', to: 'naming', label: 'namespaces' },
      { from: 'architecture', to: 'folders', label: 'modules live in' },
      { from: 'naming', to: 'assetRules', label: 'names' },
      { from: 'folders', to: 'assetRules', label: 'hold' },
      { from: 'folders', to: 'git', label: 'LFS types' },
      { from: 'style', to: 'review', label: 'automates' },
      { from: 'naming', to: 'review', label: 'enforced' },
      { from: 'assetRules', to: 'review', label: 'checked' },
      { from: 'git', to: 'branches', label: 'commits on' },
      { from: 'branches', to: 'tools', label: 'CI' },
    ],
  },
  steps: [
    { id: 'principles', title: 'Write the principles', body: 'Two or three ideas the rules serve, e.g. “the analyzer, not the reviewer, catches style”.', section: 'standards', target: 'field-principles', done: (p) => !!text(data(p).standards?.principles) },
    { id: 'naming', title: 'Add naming rules', body: 'One rule per kind of name: prefix · casing · suffix, with a good and a bad example.', section: 'naming', target: 'add', done: (p) => codingList(p, 'naming').length > 0, action: { label: 'Insert C# code names', examples: 'naming' } },
    { id: 'test', title: 'Test the rules', body: 'Type names into the Rule tester. Every rule must pass its good example and fail its bad one.', section: 'naming', target: 'view-codingNaming', done: (p) => codingList(p, 'naming').some((r) => text(r.example)) && exampleIssues(p).length === 0 },
    { id: 'style', title: 'Set the code style', body: 'Indentation, braces and analyzers. Whatever the IDE enforces never needs a review comment.', section: 'style', target: 'field-analyzers', done: (p) => !!(data(p).style?.indent || text(data(p).style?.analyzers)) },
    { id: 'folders', title: 'Lay out Assets/', body: 'Build the folder tree: what goes where, and which folders nobody edits by hand.', section: 'folders', target: 'add', done: (p) => codingList(p, 'folders').length > 0, action: { label: 'Insert the _Project layout', examples: 'folders' } },
    { id: 'place', title: 'Give every module a folder', body: 'Link folders to Technical Architecture modules. The Folder tree lists modules that still have none.', section: 'folders', target: 'view-codingFolders', done: (p) => codingList(p, 'folders').some((f) => f.module) && (archModules(p).length === 0 || moduleFolders(p).unplaced.length === 0) },
    { id: 'assets', title: 'Avoid merge conflicts', body: 'Rules for prefabs, scenes and ScriptableObjects, with their conflict risk and how you avoid it.', section: 'assetRules', target: 'add', done: (p) => codingList(p, 'assetRules').length > 0, action: { label: 'Insert conflict-safe rules', examples: 'assetRules' } },
    { id: 'branches', title: 'Draw the branch flow', body: 'Each branch type with its source and merge targets. Branch flow marks loose ends; try a branch name.', section: 'branches', target: 'view-codingGit', done: (p) => branchFlow(p).length > 0 && !branchFlow(p).some((r) => r.issues.includes('noTarget') || r.issues.includes('missingRef')), action: { label: 'Insert a branch model', examples: 'branches' } },
    {
      id: 'git',
      title: 'Commits and LFS',
      body: 'Pick a commit format and the Git LFS patterns for binary files.',
      section: 'git',
      target: 'field-lfs',
      done: (p) => !!data(p).git?.commitFormat && Array.isArray(data(p).git?.lfs) && data(p).git.lfs.length > 0,
      action: {
        label: 'Use Conventional Commits + LFS for art and audio',
        run: (p) => {
          const g = ensureForm(p, 'git')
          if (!g.commitFormat) g.commitFormat = 'Conventional Commits'
          if (!text(g.commitExample)) g.commitExample = 'feat(npc): add hunger decay'
          const lfs: string[] = Array.isArray(g.lfs) ? g.lfs : (g.lfs = [])
          for (const x of ['*.psd', '*.png', '*.tga', '*.fbx', '*.wav', '*.ogg', '*.mp4']) if (!lfs.includes(x)) lfs.push(x)
        },
      },
    },
    { id: 'review', title: 'Agree on the review', body: 'List what a reviewer checks and how each rule is enforced. The Enforcement board shows what a tool already catches.', section: 'review', target: 'view-codingReview', done: (p) => enforcementRows(p).some((r) => r.section === 'review' && r.automated), action: { label: 'Insert a Unity review checklist', examples: 'review' } },
  ],
  examples: [csharpExample, assetNamesExample, foldersExample, assetRulesExample, gitFlowExample, trunkExample, reviewExample],
  concepts: {
    naming: { title: 'A name rule has three parts', body: 'Prefix, casing and suffix. “I” + PascalCase makes IDamageable; “_” + camelCase makes _hunger. A good and a bad example prove the rule says what you mean.', diagram: 'nameAnatomy' },
    folders: { title: 'Folders follow the modules', body: 'One folder with an .asmdef per Architecture module keeps compile times short and makes a wrong dependency a compile error instead of a review comment.', diagram: 'folderTree' },
    assetRules: { title: 'Unity assets merge badly', body: 'Scenes and prefabs are long YAML files: two people editing one file means a conflict. Split them (nested prefabs, additive scenes) or lock them.', diagram: 'mergeConflict' },
    branches: { title: 'Branches flow back', body: 'Every short-lived branch starts from one branch and merges back into one or more. A branch that merges nowhere is work that never ships.', diagram: 'branchLanes' },
    review: { title: 'Catch it as early as possible', body: 'The IDE flags a rule while you type, an analyzer at compile, CI on push, a person in review. Each step right is slower and easier to miss.', diagram: 'shiftLeft' },
  },
  empty: {
    naming: 'Naming rules say how each kind of name is built, so code reads the same everywhere.',
    folders: 'Folders say where every file goes in Assets/.',
    assetRules: 'Asset rules keep prefabs, scenes and ScriptableObjects tidy and conflict-free.',
    branches: 'Branch types say where work starts and where it merges back.',
    review: 'Review checks say what a reviewer looks at, and which ones a tool already catches.',
  },
}
