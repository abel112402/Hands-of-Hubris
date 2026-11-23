import { createProject } from '../../src/core/model/project'
import { MODULES, ensureDocument } from '../../src/core/modules/registry'
import { mapNav } from '../../src/core/location/analysis'
import { generateMap } from '../../src/core/location/generate'
import { linkBack, wayOut } from '../../src/core/location/links'
import { nearestOpen, reachable } from '../../src/core/location/nav'
import type { Entity, Project } from '../../src/core/model/types'

/**
 * The small, structured 3D reference plan of plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md § 4 (first vertical slice):
 * one walkable place, a third-person player, one item to pick up, one quest that needs it with a one-time reward,
 * and a save of position, inventory and quest state. Built in code so that every value is explicit and reviewable;
 * `tests/referenceSlice3d.test.ts` writes it to `tests/fixtures/reference-slice-3d.hohplan.json`.
 *
 * Only fields the planner has today are filled. What the slice needs but the planner cannot express yet is listed
 * in KNOWN_GAPS — later phases turn those into typed data and update this builder, never silently.
 */
export const REFERENCE_NAME = 'Reference Slice 3D'
const AT = '2026-11-21T00:00:00.000Z'

export const IDS = {
  location: 'refLocYard',
  itemKey: 'refItemKey',
  itemCoin: 'refItemCoin',
  itemPolished: 'refItemPol',
  itemStick: 'refItemStick',
  itemTypeWeapon: 'refTypeWpn',
  enemy: 'refEnemyRat',
  enemySpawn: 'refObjRat',
  loot: 'refLootRat',
  keeper: 'refCharKeep',
  npcSpawn: 'refObjKeep',
  choiceHelp: 'refChHelp',
  choiceRefuse: 'refChRefuse',
  lineGreet: 'refLnGreet',
  lineHelp: 'refLnHelp',
  lineRefuse: 'refLnRefuse',
  cave: 'refLocCave',
  stairs: 'refObjStairs',
  caveCoin: 'refObjCaveCoin',
  ratRun: 'refObjRatRun',
  merchant: 'refMerchPed',
  merchantSpot: 'refObjPeddler',
  dayPhase: 'refPhDay',
  nightPhase: 'refPhNight',
  recipe: 'refRcpPol',
  schemaRecipe: 'refSchRcp',
  itemType: 'refTypeKey',
  itemTypeCurrency: 'refTypeCur',
  quest: 'refQuestKey',
  objective: 'refObjKey',
  schemaItem: 'refSchItem',
  format: 'format-so',
  module: 'refModGame',
  scene: 'refSceneYd',
  hud: 'refScrHud',
  start: 'refObjStart',
  pickup: 'refObjKey',
} as const

/** What the first slice needs but the current planner / IR cannot state as data (phase 0 baseline). */
export const KNOWN_GAPS = [
  'The first slice is playable from the plan (phases 7–12) and checked by the Unity gate (phase 13); crafting (phase 14), a melee encounter (phase 15) an NPC conversation with a choice (phase 16) a second location, the cave under the well, with stairs both ways (phase 18), a patrolling rat (phase 19), and levels, a peddler and day and night (phase 20) are in it.',
] as const

const set = (p: Project, doc: string, section: string, value: unknown) => {
  p.documents[doc].data[section] = value
}

export function buildReferenceSlice(): Project {
  const p = createProject(REFERENCE_NAME, false)
  p.meta.createdAt = AT
  p.meta.updatedAt = AT
  let n = 0
  const makeId = () => `refGen${String(++n).padStart(2, '0')}`
  for (const m of MODULES) ensureDocument(p, m, makeId, false)

  // Technical › Data-driven Design: one Item schema in a native data asset, snake_case IDs.
  set(p, 'technical.dataDriven', 'formats', [
    { id: IDS.format, name: 'Native data asset', editedIn: 'Engine editor', merge: 'Merges poorly', loadsAt: 'Runtime', moddable: false, whenToUse: 'ScriptableObject per record.' },
  ])
  set(p, 'technical.dataDriven', 'schemas', [
    { id: IDS.schemaItem, name: 'Item', required: ['name: string', 'icon: Sprite', 'value: int', 'stackSize: int'], optional: ['description: text'], idPrefix: 'item.', format: IDS.format, source: 'Items — Items & Crafting', moddable: false },
    { id: IDS.schemaRecipe, name: 'Recipe', required: ['name: string', 'result: Item', 'outputQty: int'], idPrefix: 'rcp.', format: IDS.format, source: 'Recipes — Items & Crafting', moddable: false },
  ])
  set(p, 'technical.dataDriven', 'ids', { casing: 'snake_case', example: 'item.brass_key', resolution: 'ID string', stability: 'IDs never change; renames only change display names.', notes: '' })

  // Design › Items & Crafting: the key to pick up and the coin reward.
  set(p, 'design.items', 'model', { currency: 'Coins', weightUnit: 'kg', defaultStack: 1, durability: '', valueNotes: '' })
  set(p, 'design.items', 'types', [
    { id: IDS.itemType, name: 'Key item', type: 'Quest', build: '', usage: 'Opens or completes something; never sold.' },
    { id: IDS.itemTypeCurrency, name: 'Currency', type: 'Currency', build: '', usage: 'Counted, not carried in slots.' },
    { id: IDS.itemTypeWeapon, name: 'Weapon', type: 'Weapon', build: '', usage: 'Held to fight.' },
  ])
  set(p, 'design.items', 'items', [
    { id: IDS.itemKey, name: 'Brass Key', type: IDS.itemType, value: 0, stack: 1, weight: 0.1, description: 'Lies by the well in the Keeper’s Yard.' },
    { id: IDS.itemCoin, name: 'Coin', type: IDS.itemTypeCurrency, value: 1, stack: 999, weight: 0 },
    { id: IDS.itemStick, name: 'Stick', type: IDS.itemTypeWeapon, value: 4, stack: 1, weight: 0.5, damage: 6, attackSpeed: 2, equipSlot: 'Main hand', description: 'A stout stick from the yard.' },
    { id: IDS.itemPolished, name: 'Polished Key', type: IDS.itemType, value: 5, stack: 1, weight: 0.1, description: 'The brass key, polished with two coins’ worth of care.' },
  ])
  // Phase 14: one recipe made of items, unlocked by the quest.
  // Phase 15: the rat always drops a coin.
  set(p, 'design.items', 'loot', [{ id: IDS.loot, name: 'Rat drop', sources: [IDS.enemy], guaranteed: [IDS.itemCoin] }])
  // Design › Combat: one melee enemy, the default damage formula.
  set(p, 'design.combat', 'enemies', [{ id: IDS.enemy, name: 'Yard Rat', role: 'Swarm', tier: 1, hp: 20, damage: 3, attackRate: 1, speed: 2, armor: 10, aggression: 'Territorial', sight: 6, giveUp: 10, xp: 5 }])
  set(p, 'design.items', 'recipes', [{ id: IDS.recipe, name: 'Polished Key', result: IDS.itemPolished, outputQty: 1, ingredients: { [IDS.itemKey]: 1, [IDS.itemCoin]: 2 }, unlockedBy: [IDS.quest] }])
  set(p, 'design.items', 'inventory', { slots: 8, weightLimit: 0, hotbar: 0, encumbrance: '', notes: 'No weight limit in the slice.' })

  // Design › World: one walkable location with a generated map.
  const yard: Entity = { id: IDS.location, name: 'Keeper’s Yard', type: 'Village', size: 'Small', walls: 'None', water: 'Well', population: 0, landmarks: [], description: 'A small fenced yard around a well; the player starts at the gate.' }
  set(p, 'design.world', 'locations', [yard])
  const map = generateMap(p, yard, 20261121)
  if (!map) throw new Error('The Village generator made no map')
  // Placements (phase 2): the player starts at the gate, the key lies by the well. Pinned, so a regeneration keeps them.
  const objects = Object.values(map.layers).flatMap((l) => l.objects)
  const near = (kind: string) => objects.find((o) => o.kind === kind) ?? { x: map.w / 2, y: map.h / 2 }
  const gate = near('gate')
  const well = near('well')
  const layer = Object.values(map.layers).at(-1)!
  layer.objects.push(
    { id: IDS.start, kind: 'marker', x: gate.x, y: gate.y, w: 18, h: 18, label: 'Player start', props: { type: 'npc' }, pinned: true, spawn: { role: 'player' } },
    { id: IDS.pickup, kind: 'marker', x: well.x + 24, y: well.y, w: 18, h: 18, label: 'Brass Key', props: { type: 'merchant' }, pinned: true, spawn: { role: 'item', refId: IDS.itemKey, count: 1 } },
  )
  // Phase 15: a rat on walkable ground, 15–25 m from the start and the key (beyond its 8 m aggro radius), so it only
  // fights when the player goes to it. The first such cell in row order: deterministic for the fixed seed.
  const nav = mapNav(map)
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) / nav.cell
  let rat: { x: number; y: number } | undefined
  for (let r = 1; r < nav.rows - 1 && !rat; r++)
    for (let c = 1; c < nav.cols - 1 && !rat; c++) {
      const at = { x: (c + 0.5) * nav.cell, y: (r + 0.5) * nav.cell }
      const open = [-1, 0, 1].every((dr) => [-1, 0, 1].every((dc) => nav.cost[(r + dr) * nav.cols + (c + dc)] > 0))
      if (open && dist(at, gate) >= 15 && dist(at, gate) <= 25 && dist(at, well) >= 15) rat = at
    }
  if (!rat) throw new Error('No walkable place for the rat')
  // Phase 19: the rat patrols a short run from its spawn: two more open cells about 3 m away, 3 m apart from each other.
  const openAt = (c: number, r: number) => c > 0 && r > 0 && c < nav.cols - 1 && r < nav.rows - 1 && [-1, 0, 1].every((dr) => [-1, 0, 1].every((dc) => nav.cost[(r + dr) * nav.cols + (c + dc)] > 0))
  const runPoints: { x: number; y: number }[] = [rat]
  for (let r = 1; r < nav.rows - 1 && runPoints.length < 3; r++)
    for (let c = 1; c < nav.cols - 1 && runPoints.length < 3; c++) {
      const at = { x: (c + 0.5) * nav.cell, y: (r + 0.5) * nav.cell }
      if (openAt(c, r) && dist(at, rat) >= 2.5 && dist(at, rat) <= 3.5 && runPoints.every((q) => dist(at, q) >= 2.5)) runPoints.push(at)
    }
  if (runPoints.length < 3) throw new Error('No open run for the rat')
  layer.objects.push({ id: IDS.ratRun, kind: 'road', x: rat.x, y: rat.y, rank: 'alley', label: 'Rat run', pinned: true, points: runPoints.map((q) => [q.x, q.y] as [number, number]) })
  layer.objects.push({ id: IDS.enemySpawn, kind: 'marker', x: rat.x, y: rat.y, w: 18, h: 18, label: 'Yard Rat', props: { type: 'enemy' }, pinned: true, spawn: { role: 'enemy', refId: IDS.enemy, route: IDS.ratRun } })
  // Phase 16: the keeper stands 4–6 m from the start, out of interaction reach of the start and the key, far from the rat.
  const keyAt = { x: well.x + 24, y: well.y }
  let keeper: { x: number; y: number } | undefined
  for (let r = 1; r < nav.rows - 1 && !keeper; r++)
    for (let c = 1; c < nav.cols - 1 && !keeper; c++) {
      const at = { x: (c + 0.5) * nav.cell, y: (r + 0.5) * nav.cell }
      const open = [-1, 0, 1].every((dr) => [-1, 0, 1].every((dc) => nav.cost[(r + dr) * nav.cols + (c + dc)] > 0))
      if (open && dist(at, gate) >= 4 && dist(at, gate) <= 6 && dist(at, keyAt) >= 4 && dist(at, rat) >= 12) keeper = at
    }
  if (!keeper) throw new Error('No walkable place for the keeper')
  layer.objects.push({ id: IDS.npcSpawn, kind: 'marker', x: keeper.x, y: keeper.y, w: 18, h: 18, label: 'Keeper', props: { type: 'npc' }, pinned: true, spawn: { role: 'npc', refId: IDS.keeper } })
  // Phase 20: the peddler's stall: open ground 6–9 m from the start, at least 4 m from the key, the keeper and the
  // stairs' spot by the well, and 14 m from the rat and its run.
  const stairsNear = { x: well.x, y: well.y }
  let stall: { x: number; y: number } | undefined
  for (let r = 1; r < nav.rows - 1 && !stall; r++)
    for (let c = 1; c < nav.cols - 1 && !stall; c++) {
      const at = { x: (c + 0.5) * nav.cell, y: (r + 0.5) * nav.cell }
      if (openAt(c, r) && dist(at, gate) >= 6 && dist(at, gate) <= 9 && dist(at, keyAt) >= 4 && dist(at, keeper) >= 4 && dist(at, stairsNear) >= 7 && runPoints.every((q) => dist(at, q) >= 14)) stall = at
    }
  if (!stall) throw new Error('No place for the peddler')
  layer.objects.push({ id: IDS.merchantSpot, kind: 'marker', x: stall.x, y: stall.y, w: 18, h: 18, label: 'Peddler', props: { type: 'merchant' }, pinned: true, spawn: { role: 'merchant', refId: IDS.merchant } })
  yard.map = map

  // Phase 18: a second location. Stairs by the well lead down into the Old Well Cave; its way out leads back up. The
  // stairs stand on walkable ground 3–6 m from the well, out of interaction reach of the key, the keeper and the start,
  // far from the rat. A Coin pile lies deep in the cave, on ground reachable from the way in.
  let stairs: { x: number; y: number } | undefined
  for (let r = 1; r < nav.rows - 1 && !stairs; r++)
    for (let c = 1; c < nav.cols - 1 && !stairs; c++) {
      const at = { x: (c + 0.5) * nav.cell, y: (r + 0.5) * nav.cell }
      const open = [-1, 0, 1].every((dr) => [-1, 0, 1].every((dc) => nav.cost[(r + dr) * nav.cols + (c + dc)] > 0))
      if (open && dist(at, well) >= 3 && dist(at, well) <= 6 && dist(at, keyAt) >= 4 && dist(at, keeper) >= 4 && dist(at, gate) >= 4 && dist(at, rat) >= 12) stairs = at
    }
  if (!stairs) throw new Error('No walkable place for the stairs')
  layer.objects.push({ id: IDS.stairs, kind: 'stairs', x: stairs.x, y: stairs.y, w: 16, h: 16, label: 'Stairs down', pinned: true, link: { locationId: IDS.cave } })
  const cave: Entity = { id: IDS.cave, name: 'Old Well Cave', type: 'Cave', size: 'Small', parent: IDS.location, chambers: 2, caveLocks: 0, caveWater: 'None', description: 'A dry cave under the well; stairs lead back up to the yard.' }
  ;(p.documents['design.world'].data.locations as Entity[]).push(cave)
  const caveMap0 = generateMap(p, cave, 20261122)
  if (!caveMap0) throw new Error('The Cave generator made no map')
  const caveMap = linkBack(p, cave, caveMap0)
  const way = wayOut(caveMap)
  if (way?.link?.locationId !== IDS.location) throw new Error('The cave has no way back to the yard')
  const caveNav = mapNav(caveMap)
  const inside = reachable(caveNav, [way.x, way.y])
  const wayCell = nearestOpen(caveNav, [way.x, way.y])
  const wayAt = { x: ((wayCell % caveNav.cols) + 0.5) * caveNav.cell, y: (Math.floor(wayCell / caveNav.cols) + 0.5) * caveNav.cell }
  let pile: { x: number; y: number } | undefined
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue
    const at = { x: ((i % caveNav.cols) + 0.5) * caveNav.cell, y: (Math.floor(i / caveNav.cols) + 0.5) * caveNav.cell }
    if (Math.hypot(at.x - wayAt.x, at.y - wayAt.y) / caveNav.cell >= 10 && (!pile || Math.hypot(at.x - wayAt.x, at.y - wayAt.y) < Math.hypot(pile.x - wayAt.x, pile.y - wayAt.y))) pile = at
  }
  if (!pile) throw new Error('No place for the cave coins')
  Object.values(caveMap.layers).at(-1)!.objects.push({ id: IDS.caveCoin, kind: 'marker', x: pile.x, y: pile.y, w: 18, h: 18, label: 'Coins', props: { type: 'merchant' }, pinned: true, spawn: { role: 'item', refId: IDS.itemCoin, count: 3 } })
  cave.map = caveMap
  // Generating the cave read the yard map through mapOf, which caches by object; a fresh object keeps tests that edit
  // the yard map in place seeing their edits.
  yard.map = { ...map }

  // Design › Player Character: third-person, stated in the only fields that exist today.
  set(p, 'design.player', 'hero', { fantasy: 'A caretaker', background: '', personality: '', start: 'At the gate of the Keeper’s Yard.', startItems: [] })
  set(p, 'design.player', 'controls', { input: '3D, third-person; keyboard & mouse; context-sensitive interact key.', camera: 'Third-person follow camera behind and above the player.', moveSpeed: 4.5, cameraDistance: 4, cameraHeight: 2, interactRange: 2, attackRange: 1.5 })
  // Phase 15: health for combat (Player Character › Survival stats).
  set(p, 'design.player', 'survival', [{ id: 'refSurvHp', name: 'Health', stat: 'health', max: 30 }])

  // Design › UI/UX: controls and a HUD with the quest tracker.
  const ctl = (id: string, name: string, category: string, key: string, drives?: string) => ({ id, name, category, rebindable: true, key, ...(drives && { drives }) })
  set(p, 'design.ui', 'controls', [
    ctl('refCtlFwd', 'Move forward', 'Movement', 'W', 'Move forward'),
    ctl('refCtlBack', 'Move back', 'Movement', 'S', 'Move back'),
    ctl('refCtlLeft', 'Move left', 'Movement', 'A', 'Move left'),
    ctl('refCtlRght', 'Move right', 'Movement', 'D', 'Move right'),
    ctl('refCtlUse', 'Interact', 'System', 'E', 'Interact'),
    ctl('refCtlInv', 'Inventory', 'Menus', 'I'),
    ctl('refCtlCraft', 'Crafting', 'Menus', 'C', 'Open crafting'),
    ctl('refCtlAtk', 'Attack', 'Combat', 'F', 'Attack'),
    ctl('refCtlQSave', 'Quick save', 'System', 'F5', 'Quick save'),
    ctl('refCtlQLoad', 'Quick load', 'System', 'F9', 'Quick load'),
    ctl('refCtlPaus', 'Pause', 'Menus', 'Escape'),
  ])
  set(p, 'design.ui', 'input', { notes: '', devices: ['Keyboard & mouse'], rebinding: false, holdToggle: false })
  set(p, 'design.ui', 'screens', [
    {
      id: IDS.hud,
      name: 'HUD',
      kind: 'HUD',
      entry: true,
      layout: {
        elements: [
          { id: 'refElQuest', kind: 'questTracker', x: 1504, y: 40, w: 380, h: 110, bind: { source: 'quest' } },
          { id: 'refElCoins', kind: 'counter', x: 40, y: 40, w: 200, h: 40, bind: { source: 'item', id: IDS.itemCoin } },
          { id: 'refElHp', kind: 'statBar', x: 40, y: 100, w: 260, h: 28, bind: { source: 'survivalStat', id: 'health' } },
          { id: 'refElBag', kind: 'grid', x: 40, y: 840, w: 512, h: 200, bind: { source: 'inventory' }, props: { rows: 2, cols: 4 } },
        ],
      },
      states: ['default'],
      purpose: 'Shows the current quest objective, the coins and the 8 inventory slots.',
    },
  ])

  // Design › Story & Quests: one quest whose objective is getting the key.
  set(p, 'design.story', 'quests', [
    {
      id: IDS.quest,
      name: 'Find the brass key',
      type: 'Main',
      estMinutes: 2,
      objectives: [{ id: IDS.objective, text: 'Pick up the Brass Key', done: false }],
      collectItems: { [IDS.itemKey]: 1 },
      rewardItems: { [IDS.itemCoin]: 5 },
      rewardXp: 10,
      rewardMoney: 5,
      minLevel: 1,
      locations: [IDS.location],
      conditions: 'Active from the start.',
      rewards: '5 Coins, 10 XP and 5 money, once.',
      consequences: '',
    },
  ])
  set(p, 'design.story', 'questGraph', { nodes: [{ id: 'refQgKey', label: 'Find the brass key', kind: 'Quest', refId: IDS.quest, x: 40, y: 40 }], edges: [] })

  // Technical › Architecture and Save System: one gameplay module, one scene, three saved parts.
  set(p, 'technical.architecture', 'modules', [
    { id: IDS.module, name: 'Gameplay', layer: '', assembly: 'ReferenceSlice.Gameplay', responsibility: 'Player, interaction, inventory, quests.', dependsOn: [] },
  ])
  // Phase 16: the keeper, a decision with two options, and the conversation (typed Dialogue lines).
  set(p, 'design.story', 'characters', [{ id: IDS.keeper, name: 'Keeper', role: 'Quest giver', importance: 'Supporting', voice: 'Dry, kind, short sentences.' }])
  set(p, 'design.story', 'choices', [
    { id: IDS.choiceHelp, name: 'Help the keeper', decision: 'Keeper’s request', leadsTo: [], blocks: [] },
    { id: IDS.choiceRefuse, name: 'Refuse the keeper', decision: 'Keeper’s request', leadsTo: [], blocks: [] },
  ])
  set(p, 'design.story', 'dialogueLines', [
    { id: IDS.lineGreet, name: 'Greeting', speaker: IDS.keeper, text: 'Lost something? The old key went down by the well.' },
    { id: IDS.lineHelp, name: 'Help', speaker: IDS.keeper, after: IDS.lineGreet, option: 'I will find it.', text: 'Good. Here, for your trouble.', choice: IDS.choiceHelp, giveItems: { [IDS.itemCoin]: 2 } },
    { id: IDS.lineRefuse, name: 'Refuse', speaker: IDS.keeper, after: IDS.lineGreet, option: 'Not my problem.', text: 'Suit yourself.', choice: IDS.choiceRefuse },
  ])
  // Phase 20: levels by XP, a wallet and a peddler, day and night.
  set(p, 'design.player', 'leveling', { levelCap: 5, xpFormula: '10 * level', skillPointsPerLevel: 1, startSkillPoints: 0, statPointsPerLevel: 2 })
  set(p, 'design.trade', 'money', { startingMoney: 10, walletCap: 999 })
  set(p, 'design.trade', 'merchants', [{ id: IDS.merchant, name: 'Peddler', type: 'Wandering', goods: [IDS.itemStick], buys: [IDS.itemType], markup: 1.5, buyback: 0.5, gold: 20 }])
  set(p, 'design.timeWeather', 'time', { dayLength: 4 })
  set(p, 'design.timeWeather', 'dayPhases', [
    { id: IDS.dayPhase, name: 'Day', start: 6, duration: 12, visibility: 100, monsterStrength: 1 },
    { id: IDS.nightPhase, name: 'Night', start: 18, duration: 12, visibility: 35, monsterStrength: 1.5 },
  ])
  set(p, 'technical.architecture', 'scenes', [{ id: IDS.scene, name: 'Keeper’s Yard', kind: 'Gameplay', loadOrder: 0, loads: [], next: [] }])
  // Technical Architecture › Playable prototype: the explicit profile and the systems of the first slice.
  set(p, 'technical.architecture', 'prototype', {
    dimension: '3D',
    perspective: 'Third-person',
    renderPipeline: 'URP',
    platform: 'Windows',
    movement: true,
    interaction: true,
    inventory: true,
    quests: true,
    saveLoad: true,
    crafting: true,
    combat: true,
    dialogue: true,
    progression: true,
    trade: true,
    time: true,
    weapon: IDS.itemStick,
    locations: [IDS.location, IDS.cave],
    scene: IDS.scene,
  })
  set(p, 'technical.save', 'save', { requirements: 'One manual slot.', format: 'Compressed JSON', versioning: 'Save version with migrations.', autosave: '', performance: '', version: 1, manualSlots: 1, autoSlots: 0 })
  set(p, 'technical.save', 'parts', [
    { id: 'refSpPlayr', name: 'Player', module: IDS.module, since: 1, notes: 'Position and facing.', state: 'Player position' },
    { id: 'refSpInv', name: 'Inventory', module: IDS.module, since: 1, notes: 'Item IDs and amounts.', state: 'Inventory' },
    { id: 'refSpQuest', name: 'Quest log', module: IDS.module, since: 1, notes: 'Quest state and rewards given.', state: 'Quests' },
    { id: 'refSpCombat', name: 'Combat', module: IDS.module, since: 1, notes: 'Health, defeated and looted enemies.', state: 'Combat' },
    { id: 'refSpDialog', name: 'Dialogue', module: IDS.module, since: 1, notes: 'Dialogue options already picked.', state: 'Dialogue' },
    { id: 'refSpLevel', name: 'Progression', module: IDS.module, since: 1, notes: 'XP, level, points.', state: 'Progression' },
    { id: 'refSpTrade', name: 'Trade', module: IDS.module, since: 1, notes: 'Money and the peddler’s purse.', state: 'Trade' },
    { id: 'refSpTime', name: 'Time', module: IDS.module, since: 1, notes: 'Hour and day.', state: 'Time' },
  ])
  return p
}
