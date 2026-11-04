import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { coverage, ITEMS_DOC } from '../../core/items'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import { TYPE_PROFILE_SEED } from '../design'

const doc = (p: Project): Record<string, any> => p.documents[ITEMS_DOC]?.data ?? {}
const list = (p: Project, section: string): Entity[] => (Array.isArray(doc(p)[section]) ? doc(p)[section] : [])
const catalog = (p: Project, id: string) => p.registry.catalogs[id]?.items ?? []
const ensureList = (p: Project, section: string): Entity[] => {
  const d = p.documents[ITEMS_DOC]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}
const r2 = (n: number) => Math.round(n * 100) / 100

/** Adds one entry per catalog item that has none yet (matched by the ref field). */
const createMissing = (section: string, catalogId: string, field: string, extra: (i: number, n: number) => Record<string, unknown> = () => ({})) => (p: Project) => {
  const target = ensureList(p, section)
  const items = catalog(p, catalogId)
  items.forEach((item, i) => {
    if (!target.some((e) => e[field] === item.id)) target.push({ id: makeId(), name: item.label, [field]: item.id, ...extra(i, items.length) })
  })
}

/** Default type profiles for every catalog type that has none; unknown custom types get no groups. */
export const createTypeProfiles = (p: Project) => {
  const target = ensureList(p, 'types')
  for (const t of catalog(p, 'itemTypes')) {
    if (target.some((e) => e.type === t.id)) continue
    const seed = TYPE_PROFILE_SEED.find((s) => s.type === t.id)
    target.push({ id: makeId(), ...(seed ?? {}), name: t.label, type: t.id })
  }
}

// ---------- Examples ----------

const multiplierPreset = (id: string, title: string, description: string, f: (r: number, q: number) => number): GuideExample => ({
  id,
  section: 'multipliers',
  title,
  description,
  preview: 'multiplier',
  apply: (p) => {
    const d = p.documents[ITEMS_DOC]?.data
    if (!d) return
    const cells: Record<string, number> = (d.multipliers ??= { cells: {} }).cells ?? (d.multipliers.cells = {})
    catalog(p, 'rarities').forEach((r, ri) => catalog(p, 'qualities').forEach((q, qi) => void (cells[`${r.id}|${q.id}`] = r2(f(ri, qi)))))
  },
})

type ChainItem = { key: string; name: string; type: string; value: number; extra?: Record<string, unknown> }
type ChainRecipe = { result: string; output?: number; items?: Record<string, number>; resources?: Record<string, number> }
type Chain = { station: string; items: ChainItem[]; recipes: ChainRecipe[] }

const CHAINS: Record<string, Chain> = {
  wood: {
    station: 'Workbench',
    items: [
      { key: 'plank', name: 'Plank', type: 'resource-item', value: 2, extra: { stack: 50, weight: 0.5 } },
      { key: 'handle', name: 'Wooden handle', type: 'resource-item', value: 5, extra: { stack: 20, weight: 0.3 } },
      { key: 'hatchet', name: 'Hatchet', type: 'tool', value: 25, extra: { weight: 1.5, durability: 100, toolPower: 1, harvests: ['wood'] } },
    ],
    recipes: [
      { result: 'plank', output: 2, resources: { wood: 2 } },
      { result: 'handle', items: { plank: 2 } },
      { result: 'hatchet', items: { handle: 1, plank: 3 } },
    ],
  },
  stone: {
    station: 'Mason’s bench',
    items: [
      { key: 'block', name: 'Stone block', type: 'resource-item', value: 3, extra: { stack: 40, weight: 2 } },
      { key: 'whetstone', name: 'Whetstone', type: 'tool', value: 12, extra: { weight: 0.5, durability: 30, toolPower: 1 } },
      { key: 'wall', name: 'Stone wall', type: 'building-item', value: 40, extra: { weight: 10 } },
    ],
    recipes: [
      { result: 'block', resources: { stone: 3 } },
      { result: 'whetstone', items: { block: 1 } },
      { result: 'wall', items: { block: 8 } },
    ],
  },
  ore: {
    station: 'Forge',
    items: [
      { key: 'ingot', name: 'Metal ingot', type: 'resource-item', value: 8, extra: { stack: 20, weight: 1 } },
      { key: 'blade', name: 'Iron blade', type: 'resource-item', value: 22, extra: { stack: 5, weight: 1.5 } },
      { key: 'sword', name: 'Iron sword', type: 'weapon', value: 70, extra: { weight: 3, durability: 200, damage: 12, equipSlot: 'Main hand' } },
    ],
    recipes: [
      { result: 'ingot', resources: { ore: 2 } },
      { result: 'blade', items: { ingot: 2 } },
      { result: 'sword', items: { blade: 1, ingot: 1 } },
    ],
  },
}

/** Adds a station, three items and their recipes for one raw material. Resources not in the catalog are skipped. */
function insertChain(p: Project, material = 'wood') {
  const chain = CHAINS[material] ?? CHAINS.wood
  const stations = ensureList(p, 'stations')
  let station = stations.find((s) => String(s.name).toLowerCase() === chain.station.toLowerCase())
  if (!station) stations.push((station = { id: makeId(), name: chain.station, tier: 1 }))
  const items = ensureList(p, 'items')
  const common = catalog(p, 'rarities')[0]?.id
  const normal = catalog(p, 'qualities')[1]?.id ?? catalog(p, 'qualities')[0]?.id
  const ids: Record<string, string> = {}
  for (const it of chain.items) {
    const existing = items.find((i) => String(i.name).toLowerCase() === it.name.toLowerCase())
    if (existing) ids[it.key] = existing.id
    else {
      const id = makeId()
      ids[it.key] = id
      items.push({ id, name: it.name, type: it.type, value: it.value, ...(common ? { rarity: common } : {}), ...(normal ? { quality: normal } : {}), ...it.extra })
    }
  }
  const known = new Set(catalog(p, 'resources').map((r) => r.id))
  const recipes = ensureList(p, 'recipes')
  chain.recipes.forEach((rc, i) => {
    const resources = Object.fromEntries(Object.entries(rc.resources ?? {}).filter(([id]) => known.has(id)))
    recipes.push({
      id: makeId(),
      name: chain.items.find((x) => x.key === rc.result)!.name,
      result: ids[rc.result],
      ...(rc.output ? { outputQty: rc.output } : {}),
      ingredients: Object.fromEntries(Object.entries(rc.items ?? {}).map(([k, n]) => [ids[k], n])),
      ...(Object.keys(resources).length ? { resources } : {}),
      station: station!.id,
      tier: i + 1,
    })
  })
}

const DEFAULT_WEIGHTS = [100, 40, 10, 3, 1]

/** A loot table for a source, weighted by rarity from the rarity tiers (or a default curve), limited to the lowest `maxRarity + 1` rarities. */
function insertLoot(p: Project, source: string | undefined, preset: { name: string; rolls: number; maxRarity: number; guaranteeBest?: boolean }) {
  const rarities = catalog(p, 'rarities')
  const tiers = list(p, 'rarityTiers')
  const weightOf = (rarityId: string | undefined) => {
    const idx = rarities.findIndex((r) => r.id === rarityId)
    const tier = tiers.find((t) => t.rarity === rarityId)
    if (typeof tier?.dropWeight === 'number') return tier.dropWeight
    return DEFAULT_WEIGHTS[Math.max(0, idx)] ?? 1
  }
  const pool = list(p, 'items').filter((i) => {
    const idx = rarities.findIndex((r) => r.id === i.rarity)
    return idx >= 0 && idx <= preset.maxRarity
  })
  const weights = Object.fromEntries(pool.map((i) => [i.id, weightOf(i.rarity)]))
  const best = preset.guaranteeBest ? [...pool].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0] : undefined
  const sourceName = [...sources(p)].find((s) => s.id === source)?.label
  ensureList(p, 'loot').push({
    id: makeId(),
    name: `${sourceName ? `${sourceName} – ` : ''}${preset.name}`,
    ...(source ? { sources: [source] } : {}),
    rolls: preset.rolls,
    weights,
    ...(best ? { guaranteed: [best.id] } : {}),
  })
}

const sources = (p: Project) => {
  const of = (docId: string, section: string, kind: string) => {
    const d = p.documents[docId]?.data[section]
    return (Array.isArray(d) ? d : []).map((e: Entity) => ({ id: e.id, label: `${String(e.name ?? '') || '(unnamed)'} (${kind})` }))
  }
  return [...of('design.combat', 'enemies', 'enemy'), ...of('design.combat', 'bosses', 'boss')]
}

const lootParam = { key: 'source', label: 'Dropped by', options: (p: Project) => [{ id: '', label: '— no source yet —' }, ...sources(p)] }

export const ITEM_EXAMPLES: GuideExample[] = [
  multiplierPreset('mult-linear', 'Linear', 'Each rarity adds ×0.5, each quality step ×0.25. Easy to reason about.', (r, q) => 1 + 0.5 * r + 0.25 * q),
  multiplierPreset('mult-steep', 'Steep rarity (recommended)', 'Rarity multiplies by about 1.8 per tier, so legendaries are worth ~10×; quality adds 25% per step.', (r, q) => Math.pow(1.8, r) * (1 + 0.25 * q)),
  multiplierPreset('mult-flat-quality', 'Rarity first, quality small', 'Rarity drives value; quality only nudges it (±20%).', (r, q) => (1 + 0.75 * r) * (0.8 + 0.1 * q)),
  {
    id: 'types-default',
    section: 'types',
    title: 'Default type profiles',
    description: 'Weapons and armor use combat fields, consumables use effect fields, building items use building fields, tools use tool fields.',
    preview: 'typeProfiles',
    apply: createTypeProfiles,
  },
  {
    id: 'chain-starter',
    section: 'recipes',
    title: 'Starter crafting chain',
    description: 'A station, two intermediate items and a finished product with quantities, made from one raw material.',
    param: { key: 'material', label: 'Raw material', options: () => [{ id: 'wood', label: 'Wood → hatchet' }, { id: 'stone', label: 'Stone → wall' }, { id: 'ore', label: 'Ore → iron sword' }] },
    preview: 'recipes',
    apply: (p, material) => insertChain(p, material),
  },
  {
    id: 'loot-trash',
    section: 'loot',
    title: 'Common enemy',
    description: 'One roll from the two most common rarities.',
    param: lootParam,
    preview: 'lootOdds',
    apply: (p, s) => insertLoot(p, s || undefined, { name: 'common drop', rolls: 1, maxRarity: 1 }),
  },
  {
    id: 'loot-elite',
    section: 'loot',
    title: 'Elite enemy',
    description: 'Two rolls, up to the fourth rarity.',
    param: lootParam,
    preview: 'lootOdds',
    apply: (p, s) => insertLoot(p, s || undefined, { name: 'elite drop', rolls: 2, maxRarity: 3 }),
  },
  {
    id: 'loot-boss',
    section: 'loot',
    title: 'Boss chest',
    description: 'Three rolls over every rarity, and the most valuable item always drops.',
    param: lootParam,
    preview: 'lootOdds',
    apply: (p, s) => insertLoot(p, s || undefined, { name: 'boss chest', rolls: 3, maxRarity: 99, guaranteeBest: true }),
  },
]

// ---------- Guide ----------

const covered = (p: Project, section: string, catalogId: string, field: string) =>
  catalog(p, catalogId).length > 0 && catalog(p, catalogId).every((c) => list(p, section).some((e) => e[field] === c.id))

export const ITEMS_GUIDE: ModuleGuide = {
  map: {
    width: 790,
    height: 330,
    nodes: [
      { id: 'rarityTiers', label: 'Rarity tiers', section: 'rarityTiers', x: 10, y: 14 },
      { id: 'qualityTiers', label: 'Quality tiers', section: 'qualityTiers', x: 220, y: 14 },
      { id: 'multipliers', label: 'Value multiplier', section: 'multipliers', x: 430, y: 14 },
      { id: 'trade', label: 'Trade', doc: 'design.trade', x: 640, y: 14 },
      { id: 'types', label: 'Item types', section: 'types', x: 10, y: 102 },
      { id: 'items', label: 'Items', section: 'items', x: 220, y: 102 },
      { id: 'inventory', label: 'Inventory', section: 'inventory', x: 430, y: 102 },
      { id: 'player', label: 'Player', doc: 'design.player', x: 640, y: 102 },
      { id: 'town', label: 'Town', doc: 'design.town', x: 10, y: 190 },
      { id: 'stations', label: 'Stations', section: 'stations', x: 220, y: 190 },
      { id: 'recipes', label: 'Recipes', section: 'recipes', x: 430, y: 190 },
      { id: 'loot', label: 'Loot tables', section: 'loot', x: 640, y: 190 },
      { id: 'world', label: 'World', doc: 'design.world', x: 430, y: 278 },
      { id: 'combat', label: 'Combat', doc: 'design.combat', x: 640, y: 278 },
    ],
    edges: [
      { from: 'rarityTiers', to: 'multipliers', label: 'rows' },
      { from: 'qualityTiers', to: 'multipliers', label: 'columns' },
      { from: 'multipliers', to: 'items', label: 'final value' },
      { from: 'types', to: 'items', label: 'field groups' },
      { from: 'items', to: 'inventory', label: 'carried in' },
      { from: 'items', to: 'trade', label: 'sold by' },
      { from: 'items', to: 'player', label: 'gear, restore' },
      { from: 'town', to: 'stations', label: 'building' },
      { from: 'stations', to: 'recipes', label: 'crafted at' },
      { from: 'recipes', to: 'items', label: 'makes' },
      { from: 'loot', to: 'items', label: 'drops' },
      { from: 'combat', to: 'loot', label: 'dropped by' },
      { from: 'world', to: 'loot', label: 'outposts' },
    ],
  },
  steps: [
    {
      id: 'rarity',
      title: 'Define rarity tiers',
      body: 'One tier per rarity, with a drop weight (falling) and a stat multiplier (rising). The Rarity curve view checks the shape.',
      section: 'rarityTiers',
      target: 'add',
      done: (p) => covered(p, 'rarityTiers', 'rarities', 'rarity'),
      action: { label: 'Create one per rarity', run: createMissing('rarityTiers', 'rarities', 'rarity', (i) => ({ dropWeight: DEFAULT_WEIGHTS[i] ?? 1, statMultiplier: r2(1 + 0.25 * i) })) },
    },
    {
      id: 'quality',
      title: 'Define quality tiers',
      body: 'One tier per quality: its stat multiplier and how players get it (crafting skill, loot roll).',
      section: 'qualityTiers',
      target: 'add',
      done: (p) => covered(p, 'qualityTiers', 'qualities', 'quality'),
      action: { label: 'Create one per quality', run: createMissing('qualityTiers', 'qualities', 'quality', (i, n) => ({ statMultiplier: r2(0.8 + (0.4 * i) / Math.max(1, n - 1)) })) },
    },
    {
      id: 'multipliers',
      title: 'Fill the value multiplier',
      body: 'Each cell multiplies an item’s base value for that rarity and quality. Start from a preset and tune.',
      section: 'multipliers',
      target: 'examples',
      done: (p) => {
        const need = catalog(p, 'rarities').length * catalog(p, 'qualities').length
        return need > 0 && Object.keys(doc(p).multipliers?.cells ?? {}).length >= need / 2
      },
      action: { label: 'Pick a preset…', examples: 'multipliers' },
    },
    {
      id: 'types',
      title: 'Set up item types',
      body: 'Say which field groups each type uses, so a log never shows damage fields and a sword never shows building fields.',
      section: 'types',
      target: 'add',
      done: (p) => covered(p, 'types', 'itemTypes', 'type'),
      action: { label: 'Create default profiles', run: createTypeProfiles },
    },
    {
      id: 'items',
      title: 'Add items',
      body: 'Add at least ten items across three or more types, each with a type, rarity, base value and weight.',
      section: 'items',
      target: 'add',
      done: (p) => list(p, 'items').length >= 10 && new Set(list(p, 'items').map((i) => i.type).filter(Boolean)).size >= 3,
    },
    {
      id: 'coverage',
      title: 'Check coverage for gaps',
      body: 'The Coverage view shows items per type and rarity. Outlined cells are gaps between rarities a type already uses.',
      section: 'items',
      target: 'view-itemCoverage',
      done: (p) => list(p, 'items').length >= 5 && coverage(p).holes.length === 0,
    },
    {
      id: 'stations',
      title: 'Add crafting stations',
      body: 'Name the stations recipes need and link each to the Town building that provides it.',
      section: 'stations',
      target: 'add',
      done: (p) => list(p, 'stations').some((s) => s.building),
    },
    {
      id: 'recipes',
      title: 'Write recipes with quantities',
      body: 'Each recipe makes an item from items and raw resources, with quantities, at a station. Insert a starter chain to see the idea.',
      section: 'recipes',
      target: 'examples',
      done: (p) => list(p, 'recipes').filter((r) => r.result && (Object.keys(r.ingredients ?? {}).length || Object.keys(r.resources ?? {}).length)).length >= 3,
      action: { label: 'Insert a starter chain…', examples: 'recipes' },
    },
    {
      id: 'tree',
      title: 'Inspect a crafting tree',
      body: 'Open the Crafting tree for your most advanced item: is the raw cost sensible, is the chain too deep, does crafting add value? Tick this step by hand.',
      section: 'recipes',
      target: 'view-craftTree',
    },
    {
      id: 'loot',
      title: 'Create loot tables',
      body: 'Give each enemy type or chest a table with rolls and item weights, then read the chances in Loot odds.',
      section: 'loot',
      target: 'examples',
      done: (p) => list(p, 'loot').some((t) => (t.sources ?? []).length && Object.keys(t.weights ?? {}).length),
      action: { label: 'Insert a loot preset…', examples: 'loot' },
    },
  ],
  examples: ITEM_EXAMPLES,
  concepts: {
    multipliers: {
      title: 'How an item’s value is computed',
      body: 'Every item has a base value. Its rarity and quality pick one cell of this matrix, and the base value is multiplied by it. Rarer and better items should therefore never be worth less.',
      diagram: 'value',
    },
    types: {
      title: 'Why item types have profiles',
      body: 'A profile says which field groups a type uses. The same inspector then shows combat fields for a sword, effect fields for a potion and building fields for a wall; the rest stays out of the way.',
      diagram: 'typeProfile',
    },
    recipes: {
      title: 'Reading a crafting chain',
      body: 'Recipes turn raw resources into intermediate items and those into products. Quantities multiply along the chain, so a few extra planks per step add up. The Crafting tree adds up the raw cost and compares the product’s value with its ingredients.',
      diagram: 'craftChain',
    },
    loot: {
      title: 'From weights to drop chances',
      body: 'Weights are relative: chance per roll = weight ÷ total weight. A table rolled several times gives more chances, and the chance over many kills grows towards certainty. Loot odds shows how many kills it takes.',
      diagram: 'lootRoll',
    },
  },
  empty: {
    rarityTiers: 'Rarity tiers say how often each rarity drops and how much stronger it is.',
    qualityTiers: 'Quality tiers say how much better a well-made item is and how players get one.',
    types: 'Type profiles decide which fields each kind of item shows. Start from the defaults.',
    items: 'Items are everything the player can hold, craft, place, wear or sell.',
    stations: 'Stations are where crafting happens; link each to a Town building.',
    recipes: 'Recipes turn resources and items into new items. A starter chain shows how quantities work.',
    loot: 'Loot tables say what enemies and chests drop, and how often.',
  },
}
