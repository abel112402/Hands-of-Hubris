import { hiddenGroups } from './groupFilter'
import type { CatalogItem, CollectionSection, Entity, Project } from './model/types'
import { getModule, getSection } from './modules/registry'

export const ITEMS_DOC = 'design.items'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const asMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {})
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const listOf = (project: Project, docId: string, section: string): Entity[] => {
  const d = project.documents[docId]?.data[section]
  return Array.isArray(d) ? d : []
}
export const itemList = (project: Project, section: string) => listOf(project, ITEMS_DOC, section)
const catalogItems = (project: Project, id: string): CatalogItem[] => project.registry.catalogs[id]?.items ?? []
const label = (e: Entity | undefined) => (e ? String(e.name ?? '') || '(unnamed)' : '⚠ missing')

// ---------- Value ----------

/** × multiplier for a rarity and quality from the value matrix; 1 when unset. */
export function multiplier(project: Project, rarity?: string, quality?: string): number {
  if (!rarity || !quality) return 1
  const v = project.documents[ITEMS_DOC]?.data.multipliers?.cells?.[`${rarity}|${quality}`]
  return isNum(v) ? v : 1
}

/** Base value × rarity/quality multiplier; null without a base value. */
export function finalValue(project: Project, item: Entity | undefined, quality?: string): number | null {
  if (!item || !isNum(item.value)) return null
  return item.value * multiplier(project, item.rarity, quality ?? item.quality)
}

/** An item's value at every rarity × quality, for comparing where it would sit. */
export function valueGrid(project: Project, item: Entity) {
  const rarities = catalogItems(project, 'rarities')
  const qualities = catalogItems(project, 'qualities')
  return {
    rarities,
    qualities,
    cells: Object.fromEntries(
      rarities.flatMap((r) => qualities.map((q) => [`${r.id}|${q.id}`, isNum(item.value) ? item.value * multiplier(project, r.id, q.id) : null])),
    ) as Record<string, number | null>,
  }
}

// ---------- Crafting ----------

export const recipesFor = (project: Project, itemId: string) => itemList(project, 'recipes').filter((r) => r.result === itemId)
const outputQty = (r: Entity) => (isNum(r.outputQty) && r.outputQty > 0 ? r.outputQty : 1)

export type CraftNode = {
  kind: 'item' | 'resource'
  id: string
  label: string
  qty: number
  recipe?: Entity
  station?: string
  children: CraftNode[]
  cycle?: boolean
}

/** Ingredient tree for `qty` of an item, through the first recipe of each item, down to raw resources and uncraftable items. */
export function craftTree(project: Project, itemId: string, qty = 1, path: string[] = []): CraftNode {
  const items = new Map(itemList(project, 'items').map((i) => [i.id, i]))
  const stations = new Map(itemList(project, 'stations').map((s) => [s.id, s]))
  const resources = new Map(catalogItems(project, 'resources').map((r) => [r.id, r.label]))
  const build = (id: string, q: number, seen: string[]): CraftNode => {
    const node: CraftNode = { kind: 'item', id, label: label(items.get(id)), qty: q, children: [] }
    if (seen.includes(id)) return { ...node, cycle: true }
    const recipe = recipesFor(project, id)[0]
    if (!recipe) return node
    const runs = q / outputQty(recipe)
    node.recipe = recipe
    node.station = recipe.station ? label(stations.get(recipe.station)) : undefined
    for (const [ing, n] of Object.entries(asMap(recipe.ingredients))) if (isNum(n) && n > 0) node.children.push(build(ing, n * runs, [...seen, id]))
    for (const [res, n] of Object.entries(asMap(recipe.resources)))
      if (isNum(n) && n > 0) node.children.push({ kind: 'resource', id: res, label: resources.get(res) ?? res, qty: n * runs, children: [] })
    return node
  }
  return build(itemId, qty, path)
}

export type RawCost = { resources: Record<string, number>; items: Record<string, number>; depth: number; stations: string[]; cycle: boolean }

/** Totals of a craft tree: raw resources, uncraftable items, chain depth, stations used, and whether it loops. */
export function rawCost(project: Project, itemId: string, qty = 1): RawCost {
  const out: RawCost = { resources: {}, items: {}, depth: 0, stations: [], cycle: false }
  const walk = (n: CraftNode, depth: number) => {
    if (n.cycle) out.cycle = true
    if (n.station && !out.stations.includes(n.station)) out.stations.push(n.station)
    if (n.recipe) out.depth = Math.max(out.depth, depth + 1)
    if (n.kind === 'resource') out.resources[n.id] = (out.resources[n.id] ?? 0) + n.qty
    else if (!n.recipe && depth > 0) out.items[n.id] = (out.items[n.id] ?? 0) + n.qty
    n.children.forEach((c) => walk(c, depth + 1))
  }
  walk(craftTree(project, itemId, qty), 0)
  return out
}

/** Value of what a recipe makes against the value of its item ingredients (raw resources carry no item value). */
export function valueAdded(project: Project, recipe: Entity): { output: number; input: number; ratio: number } | null {
  const items = new Map(itemList(project, 'items').map((i) => [i.id, i]))
  const out = finalValue(project, items.get(recipe.result))
  const parts = Object.entries(asMap(recipe.ingredients)).filter(([, n]) => isNum(n) && n > 0)
  if (out === null || !parts.length) return null
  let input = 0
  for (const [id, n] of parts) {
    const v = finalValue(project, items.get(id))
    if (v === null) return null
    input += v * n
  }
  const output = out * outputQty(recipe)
  return { output, input, ratio: input > 0 ? output / input : Infinity }
}

// ---------- Where items come from and go ----------

export type ItemLink = { kind: string; docId: string; sectionId: string; label: string }

/** Every place an item can be obtained from, across modules. */
export function itemSources(project: Project, itemId: string): ItemLink[] {
  const out: ItemLink[] = []
  const add = (kind: string, docId: string, sectionId: string, e: Entity) => out.push({ kind, docId, sectionId, label: label(e) })
  for (const r of itemList(project, 'recipes')) if (r.result === itemId) add('crafted', ITEMS_DOC, 'recipes', r)
  for (const t of itemList(project, 'loot')) if (itemId in asMap(t.weights) || ids(t.guaranteed).includes(itemId)) add('loot', ITEMS_DOC, 'loot', t)
  for (const m of listOf(project, 'design.trade', 'merchants')) if (ids(m.goods).includes(itemId)) add('sold', 'design.trade', 'merchants', m)
  for (const c of listOf(project, 'design.player', 'casts')) if (ids(c.startGear).includes(itemId)) add('starting gear', 'design.player', 'casts', c)
  const hero = project.documents['design.player']?.data.hero
  if (hero && ids(hero.startItems).includes(itemId)) out.push({ kind: 'starting item', docId: 'design.player', sectionId: 'hero', label: 'The hero' })
  for (const o of listOf(project, 'design.world', 'outposts')) if (ids(o.rewardRefs).includes(itemId)) add('reward', 'design.world', 'outposts', o)
  for (const f of listOf(project, 'design.factions', 'factions')) if (ids(f.unlocks).includes(itemId)) add('faction unlock', 'design.factions', 'factions', f)
  // A resource item is produced by Town buildings that output the resource of the same name.
  const item = itemList(project, 'items').find((i) => i.id === itemId)
  const res = item && catalogItems(project, 'resources').find((r) => r.label.toLowerCase() === String(item.name ?? '').toLowerCase())
  if (res) for (const b of listOf(project, 'design.town', 'buildings')) if (isNum(asMap(b.outputs)[res.id]) && asMap(b.outputs)[res.id] > 0) add('town output', 'design.town', 'buildings', b)
  return out
}

/** Every place an item is consumed or referenced as useful. */
export function itemUses(project: Project, itemId: string): ItemLink[] {
  const out: ItemLink[] = []
  for (const r of itemList(project, 'recipes')) if (itemId in asMap(r.ingredients)) out.push({ kind: 'ingredient', docId: ITEMS_DOC, sectionId: 'recipes', label: label(r) })
  for (const s of listOf(project, 'design.player', 'survival')) if (ids(s.restoreItems).includes(itemId)) out.push({ kind: 'restores', docId: 'design.player', sectionId: 'survival', label: label(s) })
  for (const m of listOf(project, 'design.trade', 'merchants')) if (ids(m.goods).includes(itemId)) out.push({ kind: 'traded', docId: 'design.trade', sectionId: 'merchants', label: label(m) })
  return out
}

/** Type profile of an item, if its type has one. */
export const profileOf = (project: Project, item: Entity) => itemList(project, 'types').find((t) => t.type === item.type)

/** True when the item's type uses any active field group (combat, use, build, tool): it is useful by itself. */
export const selfUsable = (project: Project, item: Entity) => {
  const p = profileOf(project, item)
  return !!p && !!(p.combat || p.use || p.build || p.tool)
}

// ---------- Coverage and tiers ----------

export type Coverage = { types: CatalogItem[]; rarities: CatalogItem[]; counts: Record<string, number>; untyped: number; holes: { type: CatalogItem; rarity: CatalogItem }[] }

/**
 * Items per type × rarity. A hole is a rarity with no items between the lowest and highest rarity a type already uses.
 */
export function coverage(project: Project): Coverage {
  const types = catalogItems(project, 'itemTypes')
  const rarities = catalogItems(project, 'rarities')
  const counts: Record<string, number> = {}
  let untyped = 0
  for (const i of itemList(project, 'items')) {
    if (!i.type || !i.rarity) untyped++
    else counts[`${i.type}|${i.rarity}`] = (counts[`${i.type}|${i.rarity}`] ?? 0) + 1
  }
  const holes: Coverage['holes'] = []
  for (const t of types) {
    const used = rarities.map((r, i) => (counts[`${t.id}|${r.id}`] ? i : -1)).filter((i) => i >= 0)
    if (used.length < 2) continue
    for (let i = Math.min(...used) + 1; i < Math.max(...used); i++) if (!counts[`${t.id}|${rarities[i].id}`]) holes.push({ type: t, rarity: rarities[i] })
  }
  return { types, rarities, counts, untyped, holes }
}

/** Rarity tiers whose drop weight rises or whose multiplier falls with rarity, and matrix rows/columns that fall. */
export function tierProblems(project: Project): string[] {
  const out: string[] = []
  const rarities = catalogItems(project, 'rarities')
  const qualities = catalogItems(project, 'qualities')
  const tiers = rarities.map((r) => itemList(project, 'rarityTiers').find((t) => t.rarity === r.id)).filter((t): t is Entity => !!t)
  const check = (key: string, rising: boolean, what: string) => {
    const vals = tiers.filter((t) => isNum(t[key]))
    for (let i = 1; i < vals.length; i++)
      if (rising ? vals[i][key] < vals[i - 1][key] : vals[i][key] > vals[i - 1][key]) out.push(`${what} of ${label(vals[i])} ${rising ? 'falls' : 'rises'} after ${label(vals[i - 1])}`)
  }
  check('dropWeight', false, 'drop weight')
  check('statMultiplier', true, 'stat multiplier')
  const cells = project.documents[ITEMS_DOC]?.data.multipliers?.cells ?? {}
  const cell = (r: string, q: string) => cells[`${r}|${q}`]
  for (const r of rarities) {
    const row = qualities.map((q) => cell(r.id, q.id)).filter(isNum)
    if (row.some((v, i) => i > 0 && v < row[i - 1])) out.push(`value multiplier falls with better quality for ${r.label}`)
  }
  for (const q of qualities) {
    const col = rarities.map((r) => cell(r.id, q.id)).filter(isNum)
    if (col.some((v, i) => i > 0 && v < col[i - 1])) out.push(`value multiplier falls with higher rarity for ${q.label}`)
  }
  return out
}

// ---------- Loot ----------

export type LootRow = { item: Entity | undefined; id: string; weight: number; perRoll: number; perDrop: number; expected: number; killsFor50: number | null; killsFor90: number | null; guaranteed: boolean }
export type LootOdds = { rolls: number; total: number; rows: LootRow[]; rarityMix: { rarity: CatalogItem | null; share: number }[] }

const killsFor = (p: number, target: number) => (p >= 1 ? 1 : p <= 0 ? null : Math.ceil(Math.log(1 - target) / Math.log(1 - p)))

/** Chance per item for one drop of a table (rolls with replacement), expected count, and kills needed for 50% / 90%. */
export function lootOdds(project: Project, table: Entity, rollsOverride?: number): LootOdds {
  const items = new Map(itemList(project, 'items').map((i) => [i.id, i]))
  const weights = Object.entries(asMap(table.weights)).filter(([, w]) => isNum(w) && w > 0)
  const total = weights.reduce((s, [, w]) => s + w, 0)
  const rolls = rollsOverride ?? (isNum(table.rolls) ? table.rolls : 1)
  const guaranteed = new Set(ids(table.guaranteed))
  const rows: LootRow[] = weights.map(([id, w]) => {
    const perRoll = total > 0 ? w / total : 0
    const perDrop = guaranteed.has(id) ? 1 : 1 - Math.pow(1 - perRoll, rolls)
    return { item: items.get(id), id, weight: w, perRoll, perDrop, expected: rolls * perRoll + (guaranteed.has(id) ? 1 : 0), killsFor50: killsFor(perDrop, 0.5), killsFor90: killsFor(perDrop, 0.9), guaranteed: guaranteed.has(id) }
  })
  for (const id of guaranteed)
    if (!weights.some(([w]) => w === id)) rows.push({ item: items.get(id), id, weight: 0, perRoll: 0, perDrop: 1, expected: 1, killsFor50: 1, killsFor90: 1, guaranteed: true })
  const rarities = catalogItems(project, 'rarities')
  const mix = new Map<string, number>()
  for (const r of rows) if (r.perRoll > 0) mix.set(r.item?.rarity ?? '', (mix.get(r.item?.rarity ?? '') ?? 0) + r.perRoll)
  return {
    rolls,
    total,
    rows: rows.sort((a, b) => b.perDrop - a.perDrop),
    rarityMix: [...mix].map(([id, share]) => ({ rarity: rarities.find((r) => r.id === id) ?? null, share })),
  }
}

/** Deterministic example drops: `n` openings of a table, counting each item (seeded LCG, so the same result each time). */
export function simulateLoot(table: Entity, n: number, rollsOverride?: number, seed = 7): Record<string, number> {
  const weights = Object.entries(asMap(table.weights)).filter(([, w]) => isNum(w) && w > 0)
  const total = weights.reduce((s, [, w]) => s + w, 0)
  const rolls = rollsOverride ?? (isNum(table.rolls) ? table.rolls : 1)
  const counts: Record<string, number> = {}
  let s = seed >>> 0
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let k = 0; k < n; k++) {
    for (const id of ids(table.guaranteed)) counts[id] = (counts[id] ?? 0) + 1
    for (let r = 0; r < rolls && total > 0; r++) {
      let x = rand() * total
      for (const [id, w] of weights) {
        x -= w
        if (x < 0) {
          counts[id] = (counts[id] ?? 0) + 1
          break
        }
      }
    }
  }
  return counts
}

// ---------- Checks used by hints ----------

export function recipeProblems(project: Project) {
  const recipes = itemList(project, 'recipes')
  const hasStations = itemList(project, 'stations').length > 0
  const tierOf = (itemId: string) => recipesFor(project, itemId).map((r) => r.tier).find(isNum)
  return {
    noResult: recipes.filter((r) => !r.result),
    noIngredients: recipes.filter((r) => !Object.keys(asMap(r.ingredients)).length && !Object.keys(asMap(r.resources)).length),
    noStation: hasStations ? recipes.filter((r) => !r.station) : [],
    cycles: recipes.filter((r) => r.result && rawCost(project, r.result).cycle),
    tierInversions: recipes.filter((r) => isNum(r.tier) && Object.keys(asMap(r.ingredients)).some((id) => (tierOf(id) ?? -Infinity) > r.tier)),
  }
}

export function lootProblems(project: Project) {
  const items = new Set(itemList(project, 'items').map((i) => i.id))
  return itemList(project, 'loot').filter((t) => {
    const noSource = !ids(t.sources).length
    const noWeights = !Object.values(asMap(t.weights)).some((w) => isNum(w) && w > 0) && !ids(t.guaranteed).length
    const zero = isNum(t.rolls) && t.rolls === 0
    const missing = ids(t.guaranteed).some((id) => !items.has(id))
    return noSource || noWeights || zero || missing
  })
}

const filled = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length)

/** Items with values in field groups their type profile does not use (e.g. damage on a decoration). */
export function typeFieldMismatches(project: Project): { item: Entity; groups: string[] }[] {
  const mod = getModule(ITEMS_DOC)
  const sec = mod && (getSection(mod, project.registry, 'items') as CollectionSection | undefined)
  if (!sec || sec.kind !== 'collection') return []
  return itemList(project, 'items')
    .map((item) => {
      const hidden = hiddenGroups(project, ITEMS_DOC, sec, item)
      const groups = [...hidden].filter((g) => sec.fields.some((f) => f.group === g && filled(item[f.key])))
      return { item, groups }
    })
    .filter((x) => x.groups.length > 0)
}

/** Items no source provides, and plain items nothing uses. */
export function orphanItems(project: Project) {
  const items = itemList(project, 'items')
  return {
    noSource: items.filter((i) => itemSources(project, i.id).length === 0),
    unused: items.filter((i) => profileOf(project, i) && !selfUsable(project, i) && itemUses(project, i.id).length === 0),
  }
}

export function basicsMissing(project: Project) {
  return itemList(project, 'items').filter((i) => {
    const p = profileOf(project, i)
    if (!p) return false
    if (i.type === 'resource-item' && !isNum(i.stack)) return true
    return (p.combat || p.tool) && (!isNum(i.weight) || !isNum(i.durability))
  })
}
