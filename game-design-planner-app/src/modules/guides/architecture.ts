import { ARCH_DOC, archList, dependencies, dependencyCycles, DATA_DOC } from '../../core/architecture'
import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { DEFAULT_LAYERS } from '../technical'

const data = (p: Project): Record<string, any> => {
  if (!p.documents[ARCH_DOC]) p.documents[ARCH_DOC] = { moduleVersion: 2, data: {} }
  return p.documents[ARCH_DOC].data
}
const ensureList = (p: Project, section: string, doc: Record<string, any> = data(p)): Entity[] => {
  if (!Array.isArray(doc[section])) doc[section] = []
  return doc[section]
}
const byName = (list: Entity[], name: string) => list.find((e) => String(e.name ?? '').toLowerCase() === name.toLowerCase())
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Adds the default layers that are missing (matched by name); returns name → id. */
const ensureLayers = (p: Project) => {
  const layers = ensureList(p, 'layers')
  for (const l of DEFAULT_LAYERS) if (!byName(layers, l.name)) layers.push({ id: makeId(), name: l.name, order: l.order, description: l.description })
  return (name: string) => byName(layers, name)!.id
}

const MODULES: [string, string, string, string[]][] = [
  ['Core.Events', 'Core', 'Typed event bus and ScriptableObject channels.', []],
  ['Core.Data', 'Core', 'Loads and validates data assets; id registry.', ['Core.Events']],
  ['Persistence.Save', 'Persistence', 'Serialises world state; versioned migrations.', ['Core.Data', 'Core.Events']],
  ['Simulation.Town', 'Simulation', 'Buildings, production, stock.', ['Core.Data', 'Core.Events']],
  ['Simulation.Npc', 'Simulation', 'Needs, jobs, schedules, relationships.', ['Core.Data', 'Core.Events', 'Simulation.Town']],
  ['Gameplay.Player', 'Gameplay', 'Hero stats, skills, inventory.', ['Core.Data', 'Core.Events']],
  ['UI.Hud', 'UI', 'HUD, town overview, NPC sheet.', ['Core.Events', 'Gameplay.Player', 'Simulation.Town', 'Simulation.Npc']],
  ['Tools.Debug', 'Tools', 'Cheat console and simulation inspectors.', ['Simulation.Town', 'Simulation.Npc', 'Gameplay.Player']],
]

/** Adds the colony-sim module set (missing names only, with layers); returns name → id. */
const ensureModules = (p: Project) => {
  const layer = ensureLayers(p)
  const modules = ensureList(p, 'modules')
  for (const [name, l, responsibility] of MODULES) if (!byName(modules, name)) modules.push({ id: makeId(), name, layer: layer(l), assembly: `HoH.${name}`, responsibility, dependsOn: [] })
  const id = (name: string) => byName(modules, name)!.id
  for (const [name, , , deps] of MODULES) {
    const m = byName(modules, name)!
    if (!Array.isArray(m.dependsOn) || m.dependsOn.length === 0) m.dependsOn = deps.map(id)
  }
  return id
}

const stackExample: GuideExample = {
  id: 'arch-unity-stack',
  section: 'stack',
  title: 'Unity URP stack',
  description: 'Unity 6 LTS, the Universal Render Pipeline, Addressables, the Input System and Jobs + Burst for the simulation.',
  preview: 'archStack',
  apply: (p) => {
    const stack = ensureList(p, 'stack')
    const mods = archList(p, 'modules')
    const used = (...names: string[]) => names.map((n) => byName(mods, n)?.id).filter((x): x is string => !!x)
    const add = (e: Record<string, unknown>) => {
      if (!byName(stack, String(e.name))) stack.push({ id: makeId(), ...e })
    }
    add({ name: 'Unity 6 LTS', category: 'Engine', version: '6000.0 LTS', purpose: 'Engine and editor.', risk: 'Low' })
    add({ name: 'Universal Render Pipeline', category: 'Render pipeline', version: '17.x', purpose: 'Scalable rendering for PC and Steam Deck.', risk: 'Low' })
    add({ name: 'Addressables', category: 'Package', purpose: 'Async loading of data assets and scenes.', usedBy: used('Core.Data'), risk: 'Medium' })
    add({ name: 'Input System', category: 'Package', purpose: 'Rebindable input, gamepad support.', usedBy: used('UI.Hud', 'Gameplay.Player'), risk: 'Low' })
    add({ name: 'Jobs + Burst', category: 'Package', purpose: 'Parallel NPC need and pathfinding updates.', usedBy: used('Simulation.Npc'), risk: 'Medium' })
  },
}

const layersExample: GuideExample = {
  id: 'arch-default-layers',
  section: 'layers',
  title: 'Classic layered stack',
  description: 'Core, Persistence, Simulation, Gameplay, UI and Tools, lowest first. Tools sits on top, so it may use every layer.',
  preview: 'archLayers',
  apply: (p) => void ensureLayers(p),
}

const modulesExample: GuideExample = {
  id: 'arch-colony-modules',
  section: 'modules',
  title: 'Colony-sim modules',
  description: 'Eight assemblies from Core.Events to Tools.Debug with one-way dependencies; adds the default layers if they are missing.',
  preview: 'archLayers',
  apply: (p) => void ensureModules(p),
}

const channelsExample: GuideExample = {
  id: 'arch-event-channels',
  section: 'channels',
  title: 'Core event channels',
  description: 'Need changed, stock changed, tick completed and save requested: the simulation tells the UI and saving what happened without referencing them.',
  preview: 'archMessages',
  apply: (p) => {
    const id = ensureModules(p)
    const channels = ensureList(p, 'channels')
    const add = (name: string, kind: string, pub: string[], sub: string[], frequency: string, payload: string) => {
      if (!byName(channels, name)) channels.push({ id: makeId(), name, kind, publishers: pub.map(id), subscribers: sub.map(id), frequency, payload })
    }
    add('NeedChanged', 'Event bus', ['Simulation.Npc'], ['UI.Hud', 'Simulation.Town'], 'Per tick', 'NpcId, NeedId, value')
    add('StockChanged', 'Event bus', ['Simulation.Town'], ['UI.Hud'], 'Per tick', 'ResourceId, amount')
    add('TickCompleted', 'Event bus', ['Simulation.Town'], ['Simulation.Npc', 'Tools.Debug'], 'Per tick', 'tick number')
    add('SaveRequested', 'ScriptableObject channel', ['UI.Hud'], ['Persistence.Save'], 'Per player action', 'slot')
  },
}

const extensionsExample: GuideExample = {
  id: 'arch-data-extensions',
  section: 'extensionPoints',
  title: 'Data-driven content',
  description: 'ScriptableObject definitions for items, buildings, needs and recipes, data assets for enemies and scripts for quests, so every Data-driven schema has a way in.',
  preview: 'archCoverage',
  apply: (p) => {
    const id = ensureModules(p)
    if (!p.documents[DATA_DOC]) p.documents[DATA_DOC] = { moduleVersion: 1, data: {} }
    const schemas = ensureList(p, 'schemas', p.documents[DATA_DOC].data)
    const schema = (name: string) => {
      let s = byName(schemas, name)
      if (!s) schemas.push((s = { id: makeId(), name, format: 'ScriptableObject' }))
      return s.id
    }
    const points = ensureList(p, 'extensionPoints')
    const add = (name: string, host: string, kind: string, of: string[], how: string) => {
      if (!byName(points, name)) points.push({ id: makeId(), name, host: id(host), kind, schemas: of.map(schema), how })
    }
    add('Content definitions', 'Core.Data', 'ScriptableObject', ['Item', 'Building', 'NPC need', 'Recipe'], 'Create a new definition asset in the matching folder; the registry picks it up by id.')
    add('Enemy archetypes', 'Core.Data', 'Data asset', ['Enemy'], 'Add an enemy asset with stats and a behaviour preset.')
    add('Quest scripts', 'Gameplay.Player', 'Mod script', ['Quest'], 'Write a quest graph asset; steps call registered actions.')
  },
}

const systemsExample: GuideExample = {
  id: 'arch-town-ticks',
  section: 'systems',
  title: 'Town simulation ticks',
  description: 'Needs, production, NPC decisions, pathfinding and prices at different rates, with cheaper rules for 4 far bases.',
  preview: 'archTicks',
  apply: (p) => {
    const id = ensureModules(p)
    const d = data(p)
    if (!d.simulation || typeof d.simulation !== 'object') d.simulation = {}
    if (typeof d.simulation.farInstances !== 'number') d.simulation.farInstances = 4
    const systems = ensureList(p, 'systems')
    const add = (name: string, module: string, every: number, costMs: number, extra: Record<string, unknown> = {}) => {
      if (!byName(systems, name)) systems.push({ id: makeId(), name, module: id(module), every, costMs, thread: 'Main thread', order: systems.length + 1, ...extra })
    }
    add('Need decay', 'Simulation.Npc', 1, 0.4, { farEvery: 10, farCostMs: 0.1 })
    add('Production', 'Simulation.Town', 5, 0.8, { farEvery: 20, farCostMs: 0.3 })
    add('NPC decisions', 'Simulation.Npc', 2, 1.2, { thread: 'Jobs / Burst' })
    add('Pathfinding', 'Simulation.Npc', 1, 0.6, { thread: 'Async' })
    add('Price update', 'Simulation.Town', 50, 2)
  },
}

const scenesExample: GuideExample = {
  id: 'arch-boot-scenes',
  section: 'scenes',
  title: 'Bootstrap to world',
  description: 'A bootstrap scene brings up core services, a persistent scene keeps the simulation alive, then main menu, world and an additive HUD.',
  preview: 'archBoot',
  apply: (p) => {
    const id = ensureModules(p)
    const scenes = ensureList(p, 'scenes')
    const add = (name: string, kind: string, loadOrder: number, loads: string[], loadSeconds: number) => {
      let s = byName(scenes, name)
      if (!s) scenes.push((s = { id: makeId(), name, kind, loadOrder, loads: loads.map(id), loadSeconds, next: [] }))
      return s
    }
    const boot = add('Bootstrap', 'Bootstrap', 0, ['Core.Events', 'Core.Data', 'Persistence.Save'], 1.5)
    add('Persistent systems', 'Persistent', 1, ['Simulation.Town', 'Simulation.Npc'], 0.8)
    const menu = add('Main menu', 'Level', 2, [], 0.5)
    const world = add('World', 'Level', 3, ['Gameplay.Player'], 4)
    add('HUD', 'Additive UI', 3, ['UI.Hud'], 0.3)
    const link = (s: Entity, to: Entity) => {
      if (!Array.isArray(s.next)) s.next = []
      if (!s.next.includes(to.id)) s.next.push(to.id)
    }
    link(boot, menu)
    link(menu, world)
    link(world, menu)
  },
}

export const ARCHITECTURE_GUIDE: ModuleGuide = {
  map: {
    width: 1050,
    height: 330,
    nodes: [
      { id: 'principles', label: 'Goals & principles', x: 30, y: 35, section: 'principles' },
      { id: 'stack', label: 'Technology stack', x: 240, y: 35, section: 'stack' },
      { id: 'layers', label: 'Layers', x: 450, y: 35, section: 'layers' },
      { id: 'modules', label: 'Modules', x: 660, y: 35, section: 'modules' },
      { id: 'dependencies', label: 'External systems', x: 870, y: 35, section: 'dependencies' },
      { id: 'dataDriven', label: 'Data-driven Design', x: 30, y: 145, doc: DATA_DOC },
      { id: 'extensionPoints', label: 'Extension points', x: 240, y: 145, section: 'extensionPoints' },
      { id: 'channels', label: 'Channels', x: 450, y: 145, section: 'channels' },
      { id: 'systems', label: 'Simulation systems', x: 660, y: 145, section: 'systems' },
      { id: 'performance', label: 'Performance', x: 870, y: 145, doc: 'technical.performance' },
      { id: 'scenes', label: 'Scenes & lifecycle', x: 450, y: 255, section: 'scenes' },
      { id: 'simulation', label: 'Simulation settings', x: 660, y: 255, section: 'simulation' },
      { id: 'town', label: 'Town Management', x: 870, y: 255, doc: 'design.town' },
    ],
    edges: [
      { from: 'principles', to: 'stack', label: 'choose' },
      { from: 'principles', to: 'layers', label: 'rules' },
      { from: 'stack', to: 'modules', label: 'used by' },
      { from: 'layers', to: 'modules', label: 'place' },
      { from: 'modules', to: 'dependencies', label: 'externals' },
      { from: 'modules', to: 'channels', label: 'publish / listen' },
      { from: 'modules', to: 'extensionPoints', label: 'host' },
      { from: 'dataDriven', to: 'extensionPoints', label: 'schemas' },
      { from: 'modules', to: 'systems', label: 'tick' },
      { from: 'simulation', to: 'systems', label: 'rate & budget' },
      { from: 'systems', to: 'performance', label: 'frame budget' },
      { from: 'systems', to: 'town', label: 'simulate' },
      { from: 'modules', to: 'scenes', label: 'initialised by' },
    ],
  },
  steps: [
    { id: 'goals', title: 'Write the goals', body: 'Two or three principles the architecture must protect, e.g. “add content without touching core code”.', section: 'principles', target: 'field-goals', done: (p) => !!text(data(p).principles?.goals) },
    { id: 'stack', title: 'List the stack', body: 'Engine, render pipeline and key packages, with version and risk.', section: 'stack', target: 'add', done: (p) => archList(p, 'stack').length > 0, action: { label: 'Insert a Unity URP stack', examples: 'stack' } },
    { id: 'layers', title: 'Agree on layers', body: 'Order the layers lowest first. A module may only depend on its own and lower layers, unless a layer lists an exception.', section: 'layers', target: 'view-archLayerStack', done: (p) => archList(p, 'layers').length > 0, action: { label: 'Insert the classic layers', examples: 'layers' } },
    { id: 'modules', title: 'Add the modules', body: 'One entry per assembly, with its layer and responsibility.', section: 'modules', target: 'add', done: (p) => archList(p, 'modules').length > 0, action: { label: 'Insert colony-sim modules', examples: 'modules' } },
    { id: 'deps', title: 'Draw dependencies', body: 'Tick cells in the Dependency matrix: each row depends on the ticked columns.', section: 'modules', target: 'view-archMatrix', done: (p) => archList(p, 'modules').some((m) => Array.isArray(m.dependsOn) && m.dependsOn.length > 0) },
    { id: 'clean', title: 'Keep dependencies pointing down', body: 'The Layer diagram turns upward dependencies red and cycles amber. Break them with a channel or by moving code down a layer.', section: 'modules', target: 'view-archLayers', done: (p) => dependencies(p).length > 0 && !dependencies(p).some((d) => d.issue === 'upward') && dependencyCycles(p).length === 0 },
    { id: 'channels', title: 'Decouple with channels', body: 'List the events and services modules talk through. Message flow shows who publishes and who listens.', section: 'channels', target: 'view-archMessages', done: (p) => archList(p, 'channels').length > 0, action: { label: 'Insert core event channels', examples: 'channels' } },
    { id: 'extensions', title: 'Open the extension points', body: 'For each Data-driven schema, say how new entries get in without code. Coverage shows the gaps.', section: 'extensionPoints', target: 'view-archExtensions', done: (p) => archList(p, 'extensionPoints').some((x) => Array.isArray(x.schemas) && x.schemas.length > 0), action: { label: 'Insert data-driven extensions', examples: 'extensionPoints' } },
    { id: 'ticks', title: 'Budget the simulation', body: 'Add the systems that run on the tick with a cost per run. Tick schedule compares them with the frame budget; try the what-if sliders.', section: 'systems', target: 'view-archTicks', done: (p) => archList(p, 'systems').some((s) => typeof s.costMs === 'number'), action: { label: 'Insert town simulation ticks', examples: 'systems' } },
    { id: 'scenes', title: 'Plan the boot', body: 'Start with a Bootstrap scene, give scenes a load order and the modules they bring up.', section: 'scenes', target: 'view-archBoot', done: (p) => archList(p, 'scenes').some((s) => s.kind === 'Bootstrap'), action: { label: 'Insert bootstrap to world', examples: 'scenes' } },
  ],
  examples: [stackExample, layersExample, modulesExample, channelsExample, extensionsExample, systemsExample, scenesExample],
  concepts: {
    layers: { title: 'Dependencies point down', body: 'Lower layers know nothing about higher ones. When Core needs to tell UI something, it raises an event instead of calling it, so UI can change without touching Core.', diagram: 'layerRule' },
    modules: { title: 'Reading the dependency matrix', body: 'Each row is a module, each tick a module it uses. A tick that points up a layer, or two modules that tick each other, is the first thing to fix.', diagram: 'dsmGrid' },
    channels: { title: 'Publish, don’t call', body: 'A publisher raises an event on a channel; any number of listeners react. Neither side references the other, which breaks cycles and keeps layers clean.', diagram: 'pubSub' },
    extensionPoints: { title: 'Content goes in through a plug', body: 'An extension point is the one place new content enters: drop in an asset, the registry finds it. Every content schema should have one.', diagram: 'extensionPlug' },
    systems: { title: 'Cost per second, worst tick per frame', body: 'Average cost = cost × ticks per second ÷ “every N ticks”. But on the tick where everything runs, the whole cost lands in one frame: stagger heavy systems.', diagram: 'tickBudget' },
    scenes: { title: 'Bootstrap first, then layers of scenes', body: 'A bootstrap scene starts core services once; persistent scenes keep the simulation alive while levels and UI load on top.', diagram: 'bootChain' },
  },
  empty: {
    stack: 'The engine, render pipeline and packages the game is built on.',
    layers: 'Layers set which way dependencies may point.',
    modules: 'Modules are the assemblies the code is split into.',
    channels: 'Channels are the events and services modules talk through.',
    extensionPoints: 'Extension points are where new content enters without code changes.',
    systems: 'Systems run on the simulation tick; their cost decides the frame budget.',
    scenes: 'Scenes and their load order define how the game starts and moves between areas.',
  },
}
