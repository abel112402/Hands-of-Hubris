import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { estimateTown, TOWN_DOC } from '../../core/town'

const data = (p: Project): Record<string, any> => p.documents[TOWN_DOC]?.data ?? {}
const list = (p: Project, section: string): Entity[] => {
  const value = data(p)[section]
  return Array.isArray(value) ? value : []
}
const ensureList = (p: Project, section: string): Entity[] => {
  const d = data(p)
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const resourceId = (p: Project, label: string) => {
  let catalog = p.registry.catalogs.resources
  if (!catalog) catalog = p.registry.catalogs.resources = { label: 'Resources', items: [] }
  const found = catalog.items.find((item) => item.label.toLowerCase() === label.toLowerCase())
  if (found) return found.id
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  catalog.items.push({ id, label })
  return id
}

const ensureBase = (p: Project, name: string) => {
  const bases = ensureList(p, 'bases')
  let base = bases.find((item) => item.name === name)
  if (!base) {
    base = { id: makeId(), name, type: name === 'Town hub' ? 'Settlement' : 'Outpost', capacity: 100, resupply: 'Manual' }
    bases.push(base)
  }
  return base
}

const buildingsExample: GuideExample = {
  id: 'town-production-chain',
  section: 'buildings',
  title: 'Starter production chain',
  description: 'A lumber camp feeds a sawmill, while a farm supplies food. The resource-flow view shows per-time-unit balance.',
  preview: 'townFlow',
  apply: (p) => {
    const wood = resourceId(p, 'Wood')
    const planks = resourceId(p, 'Planks')
    const food = resourceId(p, 'Food')
    ensureList(p, 'buildings').push(
      { id: makeId(), name: 'Lumber camp', category: 'Production', count: 1, cycle: 2, outputs: wood ? { [wood]: 6 } : {}, workersRequired: 3 },
      { id: makeId(), name: 'Sawmill', category: 'Production', count: 1, cycle: 2, inputs: wood ? { [wood]: 4 } : {}, outputs: planks ? { [planks]: 3 } : {}, workersRequired: 4 },
      { id: makeId(), name: 'Farm', category: 'Production', count: 2, cycle: 4, outputs: food ? { [food]: 8 } : {}, workersRequired: 4 },
    )
  },
}

const basesExample: GuideExample = {
  id: 'town-hub-outpost',
  section: 'bases',
  title: 'Hub and frontier outpost',
  description: 'A stocked settlement and a smaller outpost establish real endpoints for logistics routes.',
  preview: 'townNetwork',
  apply: (p) => {
    const wood = resourceId(p, 'Wood')
    const food = resourceId(p, 'Food')
    const hub = ensureBase(p, 'Town hub')
    const outpost = ensureBase(p, 'Frontier outpost')
    Object.assign(hub, { startStock: { ...(wood ? { [wood]: 40 } : {}), ...(food ? { [food]: 20 } : {}) }, minStock: food ? { [food]: 5 } : {}, targetStock: food ? { [food]: 15 } : {} })
    Object.assign(outpost, { startStock: wood ? { [wood]: 10 } : {}, minStock: wood ? { [wood]: 3 } : {}, targetStock: wood ? { [wood]: 8 } : {} })
  },
}

const routeExample: GuideExample = {
  id: 'town-supply-route',
  section: 'routes',
  title: 'Outpost supply route',
  description: 'A two-trip-per-day wagon moves wood and food from the town hub to the frontier outpost.',
  preview: 'townNetwork',
  apply: (p) => {
    const hub = ensureBase(p, 'Town hub')
    const outpost = ensureBase(p, 'Frontier outpost')
    const wood = resourceId(p, 'Wood')
    const food = resourceId(p, 'Food')
    ensureList(p, 'routes').push({
      id: makeId(),
      name: 'Frontier supply',
      fromBase: hub.id,
      toBase: outpost.id,
      cargo: [wood, food].filter((id): id is string => !!id),
      quantity: { ...(wood ? { [wood]: 8 } : {}), ...(food ? { [food]: 6 } : {}) },
      transport: 'Wagon',
      capacity: 10,
      frequency: 2,
      travelTime: 3,
      risk: 'Low',
      priority: 1,
    })
  },
}

export const TOWN_GUIDE: ModuleGuide = {
  map: {
    width: 1120,
    height: 390,
    nodes: [
      { id: 'bases', label: 'Bases & warehouses', x: 30, y: 35, section: 'bases' },
      { id: 'buildings', label: 'Buildings', x: 240, y: 35, section: 'buildings' },
      { id: 'flow', label: 'Resource flow', x: 450, y: 35, section: 'flow' },
      { id: 'economy', label: 'Economy model', x: 660, y: 35, section: 'economy' },
      { id: 'commands', label: 'Player commands', x: 870, y: 35, section: 'commands' },
      { id: 'routes', label: 'Logistics routes', x: 240, y: 155, section: 'routes' },
      { id: 'morale', label: 'Morale thresholds', x: 450, y: 155, section: 'morale' },
      { id: 'factors', label: 'Morale factors', x: 660, y: 155, section: 'factors' },
      { id: 'extensibility', label: 'Extensibility', x: 870, y: 155, section: 'extensibility' },
      { id: 'world', label: 'World & Biomes', x: 240, y: 285, doc: 'design.world' },
      { id: 'npc', label: 'NPC System', x: 450, y: 285, doc: 'design.npc' },
      { id: 'trade', label: 'Trade & Economy', x: 660, y: 285, doc: 'design.trade' },
    ],
    edges: [
      { from: 'bases', to: 'routes', label: 'connect' },
      { from: 'buildings', to: 'flow', label: 'produce / consume' },
      { from: 'buildings', to: 'economy', label: 'staff & house' },
      { from: 'flow', to: 'routes', label: 'supply cargo' },
      { from: 'economy', to: 'trade', label: 'prices' },
      { from: 'routes', to: 'world', label: 'cross biomes' },
      { from: 'buildings', to: 'npc', label: 'employ' },
      { from: 'morale', to: 'factors', label: 'thresholds' },
      { from: 'factors', to: 'npc', label: 'affect groups' },
      { from: 'commands', to: 'buildings', label: 'build / assign' },
    ],
  },
  steps: [
    { id: 'bases', title: 'Choose your bases', body: 'Create a settlement or warehouse and any remote outposts. Starting stock gives the estimate an initial reserve.', section: 'bases', target: 'add', done: (p) => list(p, 'bases').length > 0, action: { label: 'Insert a hub and outpost', examples: 'bases' } },
    { id: 'buildings', title: 'Plan the buildings', body: 'Add housing, production and services. Planned count, cycle and worker demand feed the estimate.', section: 'buildings', target: 'add', done: (p) => list(p, 'buildings').length > 0, action: { label: 'Insert a starter chain', examples: 'buildings' } },
    { id: 'rates', title: 'Trace resource rates', body: 'Open Resource flow to compare the rates supplied and consumed by each building; select a building to edit it.', section: 'buildings', target: 'view-townFlow', done: (p) => list(p, 'buildings').some((b) => Object.keys(b.outputs ?? {}).length || Object.keys(b.inputs ?? {}).length) },
    { id: 'flow', title: 'Connect the resource chain', body: 'Use the graph to show where resources go: producers, consumers, markets and transport links. Keep it aligned with building inputs and outputs.', section: 'flow', done: (p) => Array.isArray(data(p).flow?.edges) && data(p).flow.edges.length > 0 },
    { id: 'economy', title: 'Set the planning clock', body: 'Name a time unit and choose a horizon. Population, stock runway, workforce and route capacity are estimates, not a gameplay simulation.', section: 'economy', target: 'field-horizon', done: (p) => typeof data(p).economy?.horizon === 'number' },
    { id: 'routes', title: 'Connect the logistics network', body: 'Assign real base endpoints and set cargo, trip capacity and frequency. The network view highlights routes whose requested rate exceeds capacity.', section: 'routes', target: 'view-townNetwork', done: (p) => list(p, 'routes').length > 0, action: { label: 'Insert a supply route', examples: 'routes' } },
    { id: 'commands', title: 'Define player control', body: 'Record which commands the player can issue, their targets, costs, priorities and execution time.', section: 'commands', target: 'add', done: (p) => list(p, 'commands').length > 0 },
    { id: 'morale', title: 'Set morale consequences', body: 'Define thresholds first, then connect factors and remedies so shortages have explicit outcomes.', section: 'morale', target: 'add', done: (p) => list(p, 'morale').length > 0 },
    { id: 'review', title: 'Review town pressure', body: 'Return to the estimate and check resource runway, workforce shortage, storage and overloaded routes together.', section: 'buildings', target: 'view-economy', done: (p) => estimateTown(p).resources.length > 0 },
  ],
  examples: [buildingsExample, basesExample, routeExample],
  concepts: {
    buildings: { title: 'Production is a rate', body: 'Inputs and outputs are quantities per cycle, scaled by building count and cycle length. Compare their rates over the same named time unit before tuning stock or routes.', diagram: 'sourceSink' },
    routes: { title: 'Capacity is a rate too', body: 'A route moves capacity per trip multiplied by trips per time unit. Endpoints must reference real bases; the map and estimate reveal disconnected or overloaded plans.', diagram: 'pipeline' },
    morale: { title: 'Needs lead to outcomes', body: 'A morale factor changes a group over time; thresholds describe what the resulting value does. Pair a pressure with a remedy and the consequence it prevents.', diagram: 'decay' },
  },
  empty: {
    bases: 'Bases are the actual stock-holding endpoints used by logistics routes.',
    buildings: 'Buildings define production, consumption, housing and workforce demand.',
    flow: 'The graph shows how resources move between buildings, people, markets and transport.',
    commands: 'Commands describe the actions the player can take to manage the settlement.',
    routes: 'Routes move cargo between bases and expose capacity and risk.',
    morale: 'Thresholds define what happens when town morale reaches critical values.',
    factors: 'Factors explain why morale changes and which groups or remedies are involved.',
  },
}
