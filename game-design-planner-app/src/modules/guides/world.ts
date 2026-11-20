import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'
import {
  addBorders,
  atlasModel,
  biomeList,
  biomesWithoutEnemies,
  biomesWithoutEntry,
  biomesWithoutZone,
  biomeThreat,
  placeUnplaced,
  touchingWithoutBorder,
  unlockPath,
  WORLD_DOC,
  worldList,
} from '../../core/world'
import { cachedMapChecks, currentMap, hasHandEdits, locationsOf, unmappedLocations } from '../../core/location/analysis'
import { generateMap } from '../../core/location/generate'
import { getLocationType } from '../../core/location/registry'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''

const ensure = (p: Project, docId: string, section: string): Entity[] => {
  const d = p.documents[docId]?.data
  if (!d) return []
  if (!Array.isArray(d[section])) d[section] = []
  return d[section]
}

type BiomeSpec = {
  key: string
  name: string
  role: string
  color: string
  levels: [number, number]
  zone: [number, number, number, number]
  borders?: string[]
  atmosphere: string
  hazards: string
  /** A guardian boss living in the biome named by `in`; beating it opens this biome. */
  gate?: { boss: string; in: string; hp: number; damage: number }
  /** A faction gate described in the entry notes (factions are not created by the example). */
  faction?: string
  pois?: string[]
}

/**
 * Adds the biomes whose names are not there yet, with a zone each on the map sketch, borders between new biomes,
 * and a guardian boss in Combat for each boss gate. Existing biomes, zones and bosses are never changed.
 */
function addWorld(p: Project, specs: BiomeSpec[]) {
  const list = ensure(p, WORLD_DOC, 'biomes')
  const made = new Map<string, Entity>()
  for (const s of specs) {
    if (list.some((b) => String(b.name ?? '').toLowerCase() === s.name.toLowerCase())) continue
    const b: Entity = {
      id: makeId(),
      name: s.name,
      role: s.role,
      color: s.color,
      levelMin: s.levels[0],
      levelMax: s.levels[1],
      atmosphere: s.atmosphere,
      hazards: s.hazards,
      entryType: s.role === 'Starter' ? 'None' : s.gate ? 'Boss' : s.faction ? 'Faction' : 'None',
      ...(s.faction ? { entry: `Needs standing with ${s.faction}.` } : {}),
      ...(s.pois ? { pois: s.pois } : {}),
    }
    list.push(b)
    made.set(s.key, b)
  }
  const d = p.documents[WORLD_DOC]?.data
  if (d && (!d.map || !Array.isArray(d.map.items))) d.map = { items: [] }
  const bosses = p.documents['design.combat'] ? ensure(p, 'design.combat', 'bosses') : null
  for (const s of specs) {
    const b = made.get(s.key)
    if (!b) continue
    const [x, y, w, h] = s.zone
    d?.map.items.push({ id: makeId(), kind: 'Biome zone', label: b.name, refId: b.id, x, y, w, h })
    const near = (s.borders ?? []).map((k) => made.get(k)?.id).filter((x): x is string => !!x)
    if (near.length) b.neighbors = near
    const host = s.gate && made.get(s.gate.in)
    if (s.gate && host && bosses) {
      const boss: Entity = { id: makeId(), name: s.gate.boss, biome: host.id, hp: s.gate.hp, damage: s.gate.damage, attackRate: 1 }
      bosses.push(boss)
      host.bosses = [...(Array.isArray(host.bosses) ? host.bosses : []), boss.id]
      b.entryBosses = [boss.id]
    }
  }
}

const worldExample = (id: string, title: string, description: string, specs: BiomeSpec[]): GuideExample => ({
  id,
  section: 'biomes',
  title,
  description: `${description} Adds biomes, map zones and borders (and guardian bosses in Combat); one undo removes it all.`,
  preview: 'worldAtlas',
  apply: (p) => addWorld(p, specs),
})

const TIERED: BiomeSpec[] = [
  { key: 'm', name: 'Greenhollow', role: 'Starter', color: '#53c28b', levels: [1, 4], zone: [40, 220, 220, 200], borders: ['f', 'c'], atmosphere: 'Soft meadows around the first camp.', hazards: 'None by day; wolves at night.', pois: ['Ruined mill', 'First camp'] },
  { key: 'f', name: 'Thornwood', role: 'Early', color: '#2f8f5b', levels: [4, 8], zone: [270, 60, 230, 220], borders: ['s'], atmosphere: 'Dense forest, dappled light.', hazards: 'Thorn thickets slow movement.', gate: { boss: 'Old Boar', in: 'm', hp: 400, damage: 12 } },
  { key: 'c', name: 'Saltcoast', role: 'Early', color: '#4f9cf9', levels: [5, 9], zone: [270, 300, 230, 220], borders: ['s'], atmosphere: 'Windswept dunes and tide pools.', hazards: 'Tides cut off paths.', faction: 'the Fisher Guild' },
  { key: 's', name: 'Ashen Mire', role: 'Mid', color: '#a38b5b', levels: [9, 14], zone: [510, 160, 220, 260], borders: ['p'], atmosphere: 'A swamp under falling ash.', hazards: 'Poison gas pockets.', gate: { boss: 'Briar Matron', in: 'f', hp: 1800, damage: 28 } },
  { key: 'p', name: 'Frostpeak', role: 'Late', color: '#9fd3ff', levels: [14, 20], zone: [740, 60, 220, 240], borders: ['v'], atmosphere: 'Glaciers and thin air.', hazards: 'Cold drains stamina.', gate: { boss: 'Mire Hydra', in: 's', hp: 5200, damage: 55 } },
  { key: 'v', name: 'Hubris Spire', role: 'Final', color: '#e5707e', levels: [20, 25], zone: [740, 330, 220, 250], atmosphere: 'A tower of fused hands.', hazards: 'Corruption field.', gate: { boss: 'Frost Wyrm', in: 'p', hp: 12000, damage: 90 } },
]

const HUB: BiomeSpec[] = [
  { key: 'h', name: 'The Crossroads', role: 'Starter', color: '#53c28b', levels: [1, 5], zone: [390, 230, 220, 180], borders: ['n', 'e', 's', 'w'], atmosphere: 'A trading town at the centre of the world.', hazards: 'None.', pois: ['Market', 'Notice board'] },
  { key: 'n', name: 'Northern Taiga', role: 'Early', color: '#2f8f5b', levels: [5, 10], zone: [390, 20, 220, 200], atmosphere: 'Pines and snow.', hazards: 'Blizzards.', faction: 'the Rangers' },
  { key: 'e', name: 'Eastern Steppe', role: 'Early', color: '#f2c94c', levels: [5, 10], zone: [620, 230, 220, 180], atmosphere: 'Endless grass.', hazards: 'No cover from raiders.', faction: 'the Horse Clans' },
  { key: 's', name: 'Southern Jungle', role: 'Mid', color: '#53a06b', levels: [10, 15], zone: [390, 420, 220, 200], atmosphere: 'Steaming canopy.', hazards: 'Disease.', gate: { boss: 'Steppe Khan', in: 'e', hp: 2200, damage: 30 } },
  { key: 'w', name: 'Western Wastes', role: 'Late', color: '#f97b4f', levels: [15, 22], zone: [160, 230, 220, 180], atmosphere: 'Red rock and ruins.', hazards: 'Heat.', gate: { boss: 'Jungle Queen', in: 's', hp: 6000, damage: 60 } },
]

const CORRIDOR: BiomeSpec[] = [
  { key: 'a', name: 'Lowlands', role: 'Starter', color: '#53c28b', levels: [1, 5], zone: [30, 200, 220, 240], borders: ['b'], atmosphere: 'Farmland in the valley.', hazards: 'None.' },
  { key: 'b', name: 'Foothills', role: 'Early', color: '#4f9cf9', levels: [5, 10], zone: [260, 200, 220, 240], borders: ['c'], atmosphere: 'Rolling hills and mines.', hazards: 'Rockfalls.', gate: { boss: 'Bandit Chief', in: 'a', hp: 600, damage: 15 } },
  { key: 'c', name: 'High Pass', role: 'Mid', color: '#f2c94c', levels: [10, 16], zone: [490, 200, 220, 240], borders: ['d'], atmosphere: 'A narrow pass under cliffs.', hazards: 'Avalanches.', gate: { boss: 'Mine Golem', in: 'b', hp: 2500, damage: 35 } },
  { key: 'd', name: 'Summit', role: 'Final', color: '#e5707e', levels: [16, 22], zone: [720, 200, 240, 240], atmosphere: 'The roof of the world.', hazards: 'Thin air.', gate: { boss: 'Pass Warden', in: 'c', hp: 8000, damage: 70 } },
]

const biomes = biomeList
const nonStarters = (p: Project) => biomes(p).filter((b) => b.role !== 'Starter')

/**
 * Adds one location with its inputs and a map generated from them with a fixed seed, so the preview and the
 * inserted result are the same map. Skipped when a location of that name exists.
 */
function addLocation(p: Project, seed: number, input: (p: Project) => Record<string, unknown> & { name: string }) {
  const list = ensure(p, WORLD_DOC, 'locations')
  const fields = input(p)
  if (list.some((l) => String(l.name ?? '').toLowerCase() === fields.name.toLowerCase())) return
  const location: Entity = { id: makeId(), ...fields }
  const map = generateMap(p, location, seed)
  list.push(map ? { ...location, map } : location)
}
/** Ids of Town buildings with these names, for landmark fields; buildings that are not there are skipped. */
const townBuildings = (p: Project, names: string[]): string[] => {
  const all: Entity[] = p.documents['design.town']?.data.buildings ?? []
  return names.flatMap((n) => all.filter((b) => b.name === n).map((b) => b.id)).slice(0, names.length)
}
const locationExample = (id: string, title: string, description: string, seed: number, input: (p: Project) => Record<string, unknown> & { name: string }): GuideExample => ({
  id,
  section: 'locations',
  title,
  description: `${description} Adds one location with its map; one undo removes it.`,
  preview: 'locationMap',
  apply: (p) => addLocation(p, seed, input),
})

export const WORLD_GUIDE: ModuleGuide = {
  map: {
    width: 800,
    height: 250,
    nodes: [
      { id: 'combat', label: 'Combat', doc: 'design.combat', x: 10, y: 14 },
      { id: 'story', label: 'Story & Quests', doc: 'design.story', x: 10, y: 102 },
      { id: 'factions', label: 'Factions', doc: 'design.factions', x: 10, y: 190 },
      { id: 'exploration', label: 'World structure', section: 'exploration', x: 220, y: 14 },
      { id: 'biomes', label: 'Biomes', section: 'biomes', x: 220, y: 102 },
      { id: 'time', label: 'Time & Weather', doc: 'design.timeWeather', x: 220, y: 190 },
      { id: 'progression', label: 'Progression graph', section: 'progression', x: 430, y: 14 },
      { id: 'map', label: 'Map sketch', section: 'map', x: 430, y: 102 },
      { id: 'outposts', label: 'Outposts', section: 'outposts', x: 430, y: 190 },
      { id: 'town', label: 'Town', doc: 'design.town', x: 640, y: 190 },
      { id: 'locations', label: 'Locations', section: 'locations', x: 640, y: 102 },
    ],
    edges: [
      { from: 'combat', to: 'biomes', label: 'enemies, boss gates' },
      { from: 'story', to: 'biomes', label: 'quest gates' },
      { from: 'factions', to: 'biomes', label: 'faction gates' },
      { from: 'time', to: 'biomes', label: 'weather' },
      { from: 'exploration', to: 'map', label: 'scale' },
      { from: 'biomes', to: 'progression', label: 'drawn as' },
      { from: 'biomes', to: 'map', label: 'zones' },
      { from: 'biomes', to: 'outposts', label: 'garrisons' },
      { from: 'outposts', to: 'town', label: 'founds' },
      { from: 'town', to: 'locations', label: 'landmarks' },
    ],
  },
  steps: [
    {
      id: 'tiers',
      title: 'Add biomes across the role tiers',
      body: 'At least a Starter, something in the middle and a Final biome. An example world is a quick start.',
      section: 'biomes',
      target: 'add',
      done: (p) => biomes(p).some((b) => b.role === 'Starter') && biomes(p).some((b) => b.role === 'Final') && biomes(p).length >= 3,
      action: { label: 'Insert example world…', examples: 'biomes' },
    },
    {
      id: 'levels',
      title: 'Give each biome a player level range',
      body: 'The level the player should be on arrival. The Threat view draws it as a band next to enemy strength.',
      section: 'biomes',
      target: 'field-levelMin',
      done: (p) => biomes(p).length > 0 && biomes(p).every((b) => isNum(b.levelMin)),
    },
    {
      id: 'colors',
      title: 'Pick a colour per biome',
      body: 'Colours make the Atlas and Dossier readable at a glance. Without one, the role tier colour is used.',
      section: 'biomes',
      target: 'field-color',
      done: (p) => biomes(p).length > 0 && biomes(p).every((b) => filled(b.color)),
    },
    {
      id: 'entry',
      title: 'Set how the player gets into each biome',
      body: 'Link the quest, faction or boss that opens it under Entry. This is the authoritative unlock rule.',
      section: 'biomes',
      target: 'field-entryType',
      done: (p) => nonStarters(p).length > 0 && biomesWithoutEntry(p).length === 0,
    },
    {
      id: 'path',
      title: 'Check the unlock path',
      body: 'Every biome should open in some wave. Fix gates that sit inside the biome they open or in a later biome.',
      section: 'biomes',
      target: 'view-unlockPath',
      done: (p) => {
        const u = unlockPath(p)
        return u.links.some((l) => l.from) && u.locked.length === 0 && !u.links.some((l) => l.inside || l.backward)
      },
    },
    {
      id: 'map',
      title: 'Place every biome on the map',
      body: 'Each biome gets a zone on the map sketch. One click lays out the missing ones in role columns; drag them into shape in Map sketch.',
      section: 'biomes',
      target: 'view-worldAtlas',
      done: (p) => biomes(p).length > 0 && biomesWithoutZone(p).length === 0,
      action: { label: 'Place unplaced biomes', run: (p) => placeUnplaced(p, makeId) },
    },
    {
      id: 'borders',
      title: 'Record which biomes border each other',
      body: 'Borders show travel routes on the Atlas. Zones that touch on the map can be recorded in one click.',
      section: 'biomes',
      target: 'field-neighbors',
      done: (p) => atlasModel(p).borders.length > 0,
      action: { label: 'Record touching borders', run: (p) => addBorders(p, touchingWithoutBorder(p)) },
    },
    {
      id: 'content',
      title: 'Fill each biome with enemies',
      body: 'Set the Biome field on Combat enemies, or list them here. The Coverage view shows every remaining gap.',
      section: 'biomes',
      target: 'view-biomeCoverage',
      done: (p) => biomes(p).length > 0 && biomesWithoutEnemies(p).length === 0,
    },
    {
      id: 'threat',
      title: 'Make threat rise with the tiers',
      body: 'In the Threat view, median enemy strength should climb from Starter to Final without dips or sudden spikes.',
      section: 'biomes',
      target: 'view-biomeThreat',
      done: (p) => {
        const rows = biomeThreat(p).filter((r) => r.median !== null)
        return rows.length >= 2 && rows.every((r) => !r.flag)
      },
    },
    {
      id: 'outposts',
      title: 'Add outposts to capture',
      body: 'Give each outpost a biome, defenders and a reward; they show on the biome’s Dossier.',
      section: 'outposts',
      target: 'add',
      done: (p) => worldList(p, 'outposts').some((o) => o.biome && (o.rewardRefs?.length || filled(o.reward))),
    },
    {
      id: 'locations',
      title: 'Add the places the player visits',
      body: 'One entry per city, village, dungeon, cave or dwelling. Pick the type first: it decides which inputs apply. An example is a quick start.',
      section: 'locations',
      target: 'add',
      done: (p) => locationsOf(p).some((l) => getLocationType(l.type)),
      action: { label: 'Insert example location…', examples: 'locations' },
    },
    {
      id: 'maps',
      title: 'Generate a map for each location',
      body: 'Open Map and press Generate map. Change the inputs or the seed and generate again until the place fits; ↻ rerolls a single layer.',
      section: 'locations',
      target: 'view-locationMap',
      done: (p) => locationsOf(p).some((l) => getLocationType(l.type)) && unmappedLocations(p).length === 0,
    },
    {
      id: 'handEdit',
      title: 'Adjust a map by hand',
      body: 'Click something on the map and drag it, or add an object. What you touch is pinned: it stays when its layer is regenerated.',
      section: 'locations',
      target: 'view-locationMap',
      done: (p) => locationsOf(p).some(hasHandEdits),
    },
    {
      id: 'linkedMap',
      title: 'Put a place inside another',
      body: 'Select a house, landmark or cellar door on a map and press Create linked map: a floor plan or dungeon opens, its entrance on the matching side. Double-click to go in, use the breadcrumb to come out.',
      section: 'locations',
      target: 'view-locationMap',
      done: (p) => locationsOf(p).some((l) => l.parent && currentMap(l)),
    },
    {
      id: 'worldMap',
      title: 'Draw the whole world',
      body: 'Add a location of type World and generate its map: the land is shared out among your biomes, and every place that is not inside another one gets a site you can click to open.',
      section: 'locations',
      target: 'view-locationMap',
      done: (p) => locationsOf(p).some((l) => l.type === 'World' && currentMap(l)),
      action: { label: 'Insert example location…', examples: 'locations' },
    },
    {
      id: 'playable',
      title: 'Make every map playable',
      body: 'The Checks box under the layers lists rooms or creatures nobody can reach, locks that cannot be opened, broken house rules and links that went stale. Fix them by hand or reroll the layer; the hints panel shows the same.',
      section: 'locations',
      target: 'view-locationMap',
      done: (p) => {
        const mapped = locationsOf(p).filter((l) => currentMap(l))
        return mapped.length > 0 && mapped.every((l) => cachedMapChecks(l, currentMap(l)!, p).length === 0)
      },
    },
  ],
  examples: [
    worldExample('tiered', 'Six-biome tiered world', 'Starter meadow, two Early biomes (one boss-gated, one faction-gated), a Mid swamp, a Late peak and the Final spire, each opened by the guardian of the previous one.', TIERED),
    worldExample('hub', 'Hub and spokes', 'A central town with four regions around it: two faction-gated, then a chain of boss gates outward.', HUB),
    worldExample('corridor', 'Linear corridor', 'Four biomes in a row, each opened by the boss of the one before. Easy to pace, little freedom.', CORRIDOR),
    locationExample('riverVillage', 'Walled river village', 'A palisaded village on a river, with the Tavern and School from the Town planner as landmarks when they exist.', 1207, (p) => ({
      name: 'Oakham',
      type: 'Village',
      size: 'Medium',
      walls: 'Palisade',
      water: 'River',
      population: 140,
      landmarks: townBuildings(p, ['Tavern', 'School']),
      description: 'A farming village at a river crossing.',
    })),
    locationExample('crypt', 'Crypt with a boss room', 'Ten rooms and two secret ones, with traps at the doors. The boss waits in the room farthest from the entrance.', 4410, () => ({
      name: 'The Old Crypt',
      type: 'Dungeon',
      size: 'Medium',
      rooms: 10,
      secretRooms: 2,
      traps: true,
      layoutStyle: 'Rooms and corridors',
      description: 'Burial halls under a ruined chapel.',
    })),
    locationExample('knownLands', 'World map of the setting', 'A continent shared out among your biomes, with a site for every place already in Locations, linked to its map.', 12, () => ({
      name: 'The Known Lands',
      type: 'World',
      size: 'Medium',
      description: 'The whole setting at a glance.',
    })),
    locationExample('cottage', 'Furnished cottage', 'A four-room house with doors, windows and furniture for each room.', 77, () => ({
      name: 'Miller’s cottage',
      type: 'Dwelling',
      footprint: 'House',
      dwellingRooms: 4,
      furnishing: 'Lived-in',
      description: 'A family home by the mill.',
    })),
  ],
  concepts: {
    biomes: {
      title: 'How biomes unlock',
      body: 'Each biome’s entry condition names what opens it. A boss or quest gate is met in some other biome, so it becomes an arrow from that biome. Biomes open in waves: the Starter at the start, then everything whose gates lie in already open biomes. A gate met inside the biome it opens, or only in a locked biome, means the biome never opens.',
      diagram: 'unlockWaves',
    },
    map: {
      title: 'Map sketch and Atlas',
      body: 'The Map sketch holds the shapes: one zone per biome plus capitals, outposts and landmarks. The Biomes › Atlas tab draws the same layout with data layers on top (borders, unlock arrows, threat or coverage colours).',
      diagram: 'atlasLayers',
    },
    locations: {
      title: 'How a location map is built',
      body: 'A map is generated in layers, each drawn from the inputs and from the layers it reads: houses follow roads, trees avoid houses. Rerolling one layer keeps the others and marks the layers that read it as out of date, so nothing is overwritten behind your back. Anything you move, change or add is pinned and survives regeneration. Maps are planning sketches, not level data.',
      diagram: 'mapLayers',
    },
  },
  empty: {
    biomes: 'Biomes are the world’s areas: what lives there, how the player gets in and what it opens next.',
    outposts: 'Outposts are bases the player can capture in a biome, with defenders, a capture method and a reward.',
    locations: 'Locations are the places the player visits: cities, villages, dungeons, caves and dwellings, each with inputs and a generated map you can edit.',
  },
}
