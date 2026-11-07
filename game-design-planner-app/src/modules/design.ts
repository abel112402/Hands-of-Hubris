import { EASIER, HARDER } from '../core/difficulty'
import { DEFAULT_DAMAGE_FORMULA } from '../core/combatFormula'
import type { GraphSource } from '../core/model/types'
import { RESOLUTIONS, SCREEN_KINDS, UI_SYSTEMS } from '../core/ui'
import { QUESTION_AREAS, QUESTION_STATUSES } from '../core/openQuestions'
import { catalog, f, mod, s, section, v } from './helpers'

const FACTIONS = section('factions', 'design.factions')
const BIOMES = section('biomes', 'design.world')
const ITEMS = section('items', 'design.items')

const SCALES = ['Moment-to-moment', 'Short (minutes)', 'Medium (hours / days)', 'Long (campaign)']

const LOOP_SYSTEMS: GraphSource = {
  any: [
    section('buildings', 'design.town'),
    section('items', 'design.items'),
    section('enemies', 'design.combat'),
    section('quests', 'design.story'),
    section('factions', 'design.factions'),
    section('biomes', 'design.world'),
  ],
}

const UNLOCKABLE: GraphSource = { any: [section('skills', 'design.player'), section('items', 'design.items')] }

/** v1 kept characters and unlocks as free-text lists and one "effect on others" number. */
function migrateFactions(data: Record<string, any>) {
  for (const fa of Array.isArray(data.factions) ? data.factions : []) {
    for (const [key, label] of [['characters', 'Characters'], ['unlocks', 'Unlocks']] as const) {
      const old = fa[key]
      if (!Array.isArray(old) || old.length === 0) continue
      fa.legacyNotes = [fa.legacyNotes, `${label}: ${old.join(', ')}`].filter(Boolean).join('\n')
      delete fa[key]
    }
  }
  for (const a of Array.isArray(data.actions) ? data.actions : []) {
    if (a.effectOnOthers !== undefined && a.spilloverDefault === undefined) a.spilloverDefault = a.effectOnOthers
    delete a.effectOnOthers
  }
}

/**
 * v1 kept area, owner and due as free text. Areas that match the list keep their value (else "Other");
 * owners and unparseable dates move into `legacyNotes`, since migrate only sees this document's data.
 */
function migrateOpenQuestions(data: Record<string, any>) {
  for (const q of Array.isArray(data.questions) ? data.questions : []) {
    const notes: string[] = []
    const area = typeof q.area === 'string' ? q.area.trim() : ''
    if (area) {
      const hit = QUESTION_AREAS.find((a) => a.toLowerCase() === area.toLowerCase())
      if (hit) q.area = hit
      else {
        q.area = 'Other'
        notes.push(`Area: ${area}`)
      }
    } else delete q.area
    if (typeof q.owner === 'string') {
      if (q.owner.trim()) notes.push(`Owner: ${q.owner.trim()}`)
      delete q.owner
    }
    if (typeof q.due === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(q.due.trim())) {
      if (q.due.trim()) notes.push(`Due: ${q.due.trim()}`)
      delete q.due
    }
    if (notes.length) q.legacyNotes = [q.legacyNotes, ...notes].filter(Boolean).join('\n')
  }
}

/** v1 had a free-text entry requirement (kept as notes) and its exploration "map" text (now navigation). */
function migrateWorld(data: Record<string, any>) {
  for (const b of Array.isArray(data.biomes) ? data.biomes : []) {
    if (b.entryType === undefined && b.role === 'Starter') b.entryType = 'None'
  }
  const ex = data.exploration
  if (ex && typeof ex === 'object' && ex.navigation === undefined && ex.map) {
    ex.navigation = ex.map
    delete ex.map
  }
}

const BUILDING_CATEGORIES = ['Housing', 'Production', 'Storage', 'Services', 'Defense', 'Culture', 'Infrastructure', 'Other']
const STATUSES = ['Draft', 'Ready for testing', 'Final']
const BASE_TYPES = ['Settlement', 'Warehouse', 'Outpost', 'Market', 'Other']

/** v1 routes named their endpoints as free text; each distinct name becomes a base the route now points at. */
function migrateTown(data: Record<string, any>) {
  if (!Array.isArray(data.routes)) return
  if (!Array.isArray(data.bases)) data.bases = []
  const idOf = (name: string): string => {
    const found = data.bases.find((b: any) => String(b.name).toLowerCase() === name.toLowerCase())
    if (found) return found.id
    const id = `base-${data.bases.length + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    data.bases.push({ id, name })
    return id
  }
  for (const r of data.routes) {
    for (const [old, key] of [['from', 'fromBase'], ['to', 'toBase']] as const) {
      const name = typeof r[old] === 'string' ? r[old].trim() : ''
      if (name && r[key] === undefined) r[key] = idOf(name)
      delete r[old]
    }
  }
}

const SCHEDULES = ['Every N days', 'Moon cycle', 'Random chance', 'Season', 'Story trigger']

/** Default "Times of day" catalog ids a v1 day phase name can match. */
const TIME_OF_DAY_IDS = ['dawn', 'day', 'dusk', 'night']

/**
 * v1 had no links: day phases get their time of day by name, and moon events get a moon-cycle schedule.
 * Every v1 field stays valid, so no text moves.
 */
function migrateTimeWeather(data: Record<string, any>) {
  for (const p of Array.isArray(data.dayPhases) ? data.dayPhases : []) {
    const id = String(p.name ?? '').trim().toLowerCase()
    if (p.timeOfDay === undefined && TIME_OF_DAY_IDS.includes(id)) p.timeOfDay = id
  }
  for (const e of Array.isArray(data.events) ? data.events : []) {
    if (e.schedule !== undefined) continue
    const name = String(e.name ?? '').toLowerCase()
    if (name.includes('blood moon')) Object.assign(e, { schedule: 'Moon cycle', interval: e.interval ?? 3 })
    else if (name.includes('full moon')) Object.assign(e, { schedule: 'Moon cycle', interval: e.interval ?? 1 })
  }
}

const UI_WINDOWS = ['inventory', 'crafting', 'character / skill tree', 'town overview', 'npc sheet', 'trade', 'diplomacy', 'quest log', 'settings']
const CANVAS_KIND: Record<string, string> = { Frame: 'panel', Panel: 'panel', Button: 'button', Text: 'text', Icon: 'icon', List: 'list', Image: 'image', Input: 'input' }

/**
 * v1 kept input and accessibility notes in the principles form and drew every screen on one shared canvas.
 * Notes move to their own forms; known screens get a kind; a canvas Frame whose label names a screen becomes that
 * screen's wireframe: the items fully inside it move into the screen's layout with their ids, scaled from the frame to
 * the default 1920×1080 artboard. Everything else stays on the sketch board.
 */
function migrateUi(data: Record<string, any>) {
  const pr = data.principles
  if (pr && typeof pr === 'object') {
    for (const [from, section] of [['input', 'input'], ['a11y', 'accessibility']] as const) {
      if (!(from in pr)) continue
      if (typeof pr[from] === 'string' && pr[from].trim()) data[section] = { ...(data[section] ?? {}), notes: pr[from] }
      delete pr[from]
    }
  }
  const screens: any[] = Array.isArray(data.screens) ? data.screens : []
  for (const sc of screens) {
    if (sc.kind !== undefined) continue
    const name = String(sc.name ?? '').trim().toLowerCase()
    if (name === 'hud') Object.assign(sc, { kind: 'HUD', entry: true })
    else if (name === 'map') sc.kind = 'Fullscreen menu'
    else if (UI_WINDOWS.includes(name)) sc.kind = 'Window'
  }
  const canvas = data.wireframe
  const items: any[] = Array.isArray(canvas?.items) ? canvas.items : []
  const moved = new Set<string>()
  for (const frame of items.filter((i) => i.kind === 'Frame')) {
    const sc = screens.find((x) => String(x.name ?? '').trim().toLowerCase() === String(frame.label ?? '').trim().toLowerCase())
    if (!sc || sc.layout?.elements?.length || !(frame.w > 0) || !(frame.h > 0)) continue
    const sx = 1920 / frame.w
    const sy = 1080 / frame.h
    const inner = items.filter((i) => i !== frame && !moved.has(i.id) && i.x >= frame.x && i.y >= frame.y && i.x + i.w <= frame.x + frame.w && i.y + i.h <= frame.y + frame.h)
    sc.layout = {
      elements: inner.map((i) => ({
        id: i.id,
        kind: CANVAS_KIND[i.kind] ?? 'panel',
        x: Math.round((i.x - frame.x) * sx),
        y: Math.round((i.y - frame.y) * sy),
        w: Math.round(i.w * sx),
        h: Math.round(i.h * sy),
        ...(i.label && i.label !== i.kind ? { text: i.label } : {}),
      })),
    }
    moved.add(frame.id)
    inner.forEach((i) => moved.add(i.id))
  }
  if (moved.size) canvas.items = items.filter((i) => !moved.has(i.id))
}

export const QUEST_TYPES = ['Main', 'Faction', 'Tavern random', 'Event']
export const ACT_UNITS = ['In-game days', 'Play hours']
export const QUEST_TYPE_SEED = [
  { name: 'Main quest', type: 'Main', purpose: 'Carries the story from act to act.', repeatable: false, rewardScale: 1 },
  { name: 'Faction quest', type: 'Faction', purpose: 'Builds reputation and opens faction content.', repeatable: false, rewardScale: 0.8 },
  { name: 'Tavern job', type: 'Tavern random', purpose: 'Repeatable filler that pays the bills.', repeatable: true, maxActive: 3, rewardScale: 0.3 },
  { name: 'Event quest', type: 'Event', purpose: 'Appears with a special event and expires with it.', repeatable: true, rewardScale: 0.5 },
]

/**
 * v1 kept the narrative style in the overview and choices and endings only as graph boxes.
 * Tone moves to Dialogue; Ending and Choice nodes without a link become entries with the node's id (and the node links to it);
 * a text objective becomes a checklist item. Quest text fields keep their keys.
 */
function migrateStory(data: Record<string, any>) {
  const ov = data.overview
  if (ov && typeof ov === 'object' && 'tone' in ov) {
    if (typeof ov.tone === 'string' && ov.tone.trim()) data.dialogue = { ...(data.dialogue ?? {}), tone: ov.tone }
    delete ov.tone
  }
  for (const q of Array.isArray(data.quests) ? data.quests : []) {
    if (typeof q.objectives === 'string') q.objectives = q.objectives.trim() ? [{ id: `${q.id}-o1`, text: q.objectives, done: false }] : []
  }
  const nodes = Array.isArray(data.questGraph?.nodes) ? data.questGraph.nodes : []
  for (const [kind, section, make] of [
    ['Ending', 'endings', (n: any) => ({ id: n.id, name: n.label || 'Ending', ...(n.notes ? { description: n.notes } : {}) })],
    ['Choice', 'choices', (n: any) => ({ id: n.id, name: n.label || 'Option', decision: n.label || 'Decision', ...(n.notes ? { notes: n.notes } : {}) })],
  ] as const) {
    for (const n of nodes) {
      if (n.kind !== kind || n.refId) continue
      if (!Array.isArray(data[section])) data[section] = []
      if (!data[section].some((e: any) => e.id === n.id)) data[section].push(make(n))
      n.refId = n.id
    }
  }
}

/**
 * v1 had one goods list per merchant, unscoped price rules and text-only currency and balance forms. All text is kept;
 * single goods ids become arrays. Price rules stay unscoped so no price changes silently (trade.ruleScope asks for a scope).
 */
function migrateTrade(data: Record<string, any>) {
  for (const m of Array.isArray(data.merchants) ? data.merchants : []) {
    if (typeof m.goods === 'string') m.goods = m.goods ? [m.goods] : []
  }
}

/** v1 kept drops, boss unlocks / reward / phases and status effects as free text; they move to notes fields. */
function migrateCombat(data: Record<string, any>) {
  const join = (...parts: unknown[]) => parts.filter((x) => typeof x === 'string' && x.trim()).join('\n')
  for (const e of Array.isArray(data.enemies) ? data.enemies : []) {
    if (Array.isArray(e.drops)) {
      const lines = e.drops.filter((x: unknown) => typeof x === 'string' && x.trim())
      if (lines.length) e.legacyNotes = join(e.legacyNotes, `Drops: ${lines.join(', ')}`)
      delete e.drops
    }
  }
  for (const b of Array.isArray(data.bosses) ? data.bosses : []) {
    for (const [from, to] of [['unlocks', 'unlockNotes'], ['reward', 'rewardNotes'], ['phases', 'phaseNotes']] as const) {
      if (typeof b[from] === 'string') {
        if (b[from].trim()) b[to] = join(b[to], b[from])
        delete b[from]
      }
    }
  }
  const sys = data.system
  if (sys && typeof sys === 'object' && typeof sys.status === 'string') {
    sys.statusNotes = join(sys.statusNotes, sys.status)
    delete sys.status
  }
}

/** Default field groups per item type, matched to the default "Item types" catalog ids. */
export const TYPE_PROFILE_SEED = [
  { name: 'Building item', type: 'building-item', build: true, usage: 'Placed in the world to build structures.' },
  { name: 'Resource item', type: 'resource-item', usage: 'Gathered or produced; used as a crafting ingredient.' },
  { name: 'Tool', type: 'tool', tool: true, usage: 'Equipped to gather resources faster or at all.' },
  { name: 'Machine', type: 'machine', build: true, usage: 'Placed to process items automatically.' },
  { name: 'Weapon', type: 'weapon', combat: true, usage: 'Equipped to deal damage.' },
  { name: 'Armor', type: 'armor', combat: true, usage: 'Worn to reduce damage taken.' },
  { name: 'Consumable', type: 'consumable', use: true, usage: 'Used up for an effect: food, drink, potions, buffs and debuffs.' },
  { name: 'Accessory', type: 'accessory', combat: true, use: true, usage: 'Worn for passive bonuses; some are cursed.' },
  { name: 'Decoration', type: 'decoration', build: true, usage: 'Placed for looks and comfort.' },
  { name: 'Beacon', type: 'beacon', use: true, build: true, usage: 'Placed to project an aura or effect around it.' },
  { name: 'Valuable', type: 'valuable', usage: 'Sold for money; some are junk.' },
]

/**
 * v1 kept ingredients without quantities, the station and loot entries as text, and free-text stats and sources.
 * Text that cannot become a link is kept in `legacyNotes` / `notes`.
 */
function migrateItems(data: Record<string, any>) {
  const items: any[] = Array.isArray(data.items) ? data.items : []
  const join = (...parts: unknown[]) => parts.filter((x) => typeof x === 'string' && x.trim()).join('\n')
  for (const it of items) {
    if (typeof it.stats === 'string') {
      it.notes = join(it.notes, it.stats)
      delete it.stats
    }
    if (typeof it.sources === 'string') {
      if (it.sources.trim()) it.legacyNotes = join(it.legacyNotes, `Sources: ${it.sources}`)
      delete it.sources
    }
  }
  const stations: any[] = Array.isArray(data.stations) ? data.stations : (data.stations = [])
  const stationId = (name: string): string => {
    const found = stations.find((s) => String(s.name).toLowerCase() === name.toLowerCase())
    if (found) return found.id
    const id = `station-${stations.length + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    stations.push({ id, name })
    return id
  }
  for (const r of Array.isArray(data.recipes) ? data.recipes : []) {
    if (Array.isArray(r.ingredients)) r.ingredients = Object.fromEntries(r.ingredients.map((id: string) => [id, 1]))
    if (typeof r.station === 'string') {
      const name = r.station.trim()
      if (name) r.station = stationId(name)
      else delete r.station
    }
  }
  const byName = (name: string) => items.find((i) => String(i.name ?? '').trim().toLowerCase() === name.trim().toLowerCase())
  for (const t of Array.isArray(data.loot) ? data.loot : []) {
    const left: string[] = []
    if (typeof t.source === 'string' && t.source.trim()) left.push(`Source: ${t.source}`)
    delete t.source
    if (Array.isArray(t.entries)) {
      const weights: Record<string, number> = { ...(t.weights ?? {}) }
      for (const line of t.entries as unknown[]) {
        const m = /^(.*?)[,:;]\s*([\d.]+)\s*%?\s*$/.exec(String(line ?? '').trim())
        const item = m && byName(m[1])
        if (item && Number.isFinite(Number(m![2]))) weights[item.id] = Number(m![2])
        else if (String(line ?? '').trim()) left.push(String(line))
      }
      if (Object.keys(weights).length) t.weights = weights
      delete t.entries
    }
    if (left.length) t.legacyNotes = join(t.legacyNotes, left.join('\n'))
  }
  const inv = data.inventory
  if (inv && typeof inv === 'object' && typeof inv.slots === 'string') {
    inv.notes = join(inv.notes, inv.slots)
    delete inv.slots
  }
}

/**
 * v1 drew skills as a free graph (kept: nodes become skill entries with the same ids, so faction unlocks still resolve),
 * kept death in the hero form, and stored starting abilities / gear as text and affinity as one faction.
 */
function migratePlayer(data: Record<string, any>) {
  const hero = data.hero
  if (hero && typeof hero === 'object' && typeof hero.death === 'string' && hero.death.trim()) {
    data.death = { ...(data.death ?? {}), penalty: [data.death?.penalty, hero.death].filter(Boolean).join('\n') }
  }
  if (hero && typeof hero === 'object') delete hero.death
  const g = data.skillTree
  if (g && Array.isArray(g.nodes)) {
    const skills: any[] = Array.isArray(data.skills) ? data.skills : []
    const kinds: Record<string, string> = { Passive: 'Passive', Active: 'Active', Spell: 'Spell' }
    for (const n of g.nodes) {
      if (skills.some((sk) => sk.id === n.id)) continue
      skills.push({ id: n.id, name: n.label, ...(n.refId ? { cast: n.refId } : {}), ...(kinds[n.kind] ? { kind: kinds[n.kind] } : {}), ...(n.notes ? { effect: n.notes } : {}) })
    }
    for (const e of Array.isArray(g.edges) ? g.edges : []) {
      const target = skills.find((sk) => sk.id === e.target)
      if (target && skills.some((sk) => sk.id === e.source)) target.requires = [...new Set([...(target.requires ?? []), e.source])]
    }
    data.skills = skills
    delete data.skillTree
  }
  for (const c of Array.isArray(data.casts) ? data.casts : []) {
    if (typeof c.affinity === 'string') c.affinity = c.affinity ? [c.affinity] : []
    for (const [key, label] of [['startAbilities', 'Starting abilities'], ['startGear', 'Starting gear']] as const) {
      const old = c[key]
      if (!Array.isArray(old)) continue
      delete c[key]
      if (!old.length) continue
      c.legacyNotes = [c.legacyNotes, `${label}: ${old.join(', ')}`].filter(Boolean).join('\n')
    }
  }
}

/** v1 kept equipment, mercenaries, AI and generation as four boxes in one "Other" form. */
function migrateNpc(data: Record<string, any>) {
  const misc = data.misc
  if (!misc || typeof misc !== 'object') return
  const move = (from: string, section: string, field: string) => {
    const text = typeof misc[from] === 'string' ? misc[from].trim() : ''
    if (!text) return
    const target = (data[section] && typeof data[section] === 'object' ? data[section] : (data[section] = {})) as Record<string, any>
    target[field] = [target[field], text].filter(Boolean).join('\n')
  }
  move('equipment', 'equipmentRules', 'notes')
  move('mercenaries', 'mercenaries', 'notes')
  move('ai', 'behaviour', 'routine')
  move('generation', 'generation', 'notes')
  delete data.misc
}

const CATEGORIES = ['Combat', 'Survival', 'Economy', 'NPC', 'Other']
const UNITS = ['×', '%', 'absolute', 'seconds', 'other']

const PARAM_SEED = [
  { name: 'Hunger / thirst decay rate', unit: '×', category: 'Survival', direction: HARDER, baseline: 1, min: 0.25, max: 3 },
  { name: 'Enemy HP multiplier', unit: '×', category: 'Combat', direction: HARDER, baseline: 1, min: 0.25, max: 3 },
  { name: 'Enemy damage multiplier', unit: '×', category: 'Combat', direction: HARDER, baseline: 1, min: 0.25, max: 3 },
  { name: 'Corruption growth', unit: '×', category: 'Survival', direction: HARDER, baseline: 1, min: 0.25, max: 3 },
  { name: 'NPC need multiplier', unit: '×', category: 'NPC', direction: HARDER, baseline: 1, min: 0.25, max: 3 },
  { name: 'Morale loss threshold', unit: '%', category: 'Economy', direction: EASIER, baseline: 50, min: 0, max: 100 },
  { name: 'Economy price multiplier', unit: '×', category: 'Economy', direction: HARDER, baseline: 1, min: 0.25, max: 3 },
]

/** v1 had free-text unit and category, and one "rules" form. */
function migrateDifficulty(data: Record<string, any>) {
  if (Array.isArray(data.params)) {
    for (const p of data.params) {
      const unit = String(p.unit ?? '').trim()
      if (unit && !UNITS.includes(unit)) {
        p.notes = [p.notes, `Unit: ${unit}`].filter(Boolean).join('\n')
        p.unit = 'other'
      }
      const cat = String(p.category ?? '').trim()
      if (cat) p.category = CATEGORIES.find((c) => c.toLowerCase() === cat.toLowerCase()) ?? 'Other'
    }
  }
  if (data.rules && typeof data.rules === 'object') {
    data.switching = { ...(data.switching ?? {}), switching: data.rules.switching }
    data.storage = { ...(data.storage ?? {}), storage: data.rules.storage }
    delete data.rules
  }
}

/** v1 stored one free-text "rewards" field per loop. */
function migrateCoreLoop(data: Record<string, any>) {
  if (!Array.isArray(data.loops)) return
  for (const l of data.loops) {
    if (l.rewards !== undefined && l.reward === undefined) l.reward = l.rewards
    delete l.rewards
  }
}

export const designModules = [
  {
    ...mod('design', 'coreLoop', 'Core Loop', 'docs/01_design/core_loop.md', '🔁', 'Gameplay loops across time scales.', [
      s.collection(
        'loops',
        'Loops by time scale',
        'loop',
        [
          f.enm('scale', 'Time scale', SCALES, {
            help: 'Moment-to-moment: seconds (aim, dodge, gather). Short: minutes (gather → craft → survive). Medium: hours / days (base upgrades, expeditions). Long: the whole campaign (factions, bosses, endings).',
            group: 'The loop',
          }),
          // Additive optional fields (cycleMinutes, rewardRefs, pillars): v2 data stays valid, so no version bump or migration.
          f.num('cycleMinutes', 'One cycle takes (real minutes)', {
            min: 0,
            step: 0.1,
            help: 'Rough real play time for one repetition, e.g. 0.1 for a swing, 10 for a gather run, 600 for a campaign arc. The Pacing view compares loops with it.',
            group: 'The loop',
          }),
          f.long('action', 'Player action', { help: 'What does the player actively do in this loop?', placeholder: 'e.g. Gather wood and stone from the surrounding area.', group: 'The loop' }),
          f.long('reward', 'Reward', { help: 'What does the player get, and why does it matter to them?', placeholder: 'e.g. Materials to craft a better axe.', group: 'The loop' }),
          f.multi('rewardRefs', 'Reward is', { any: [catalog('resources'), section('buildings', 'design.town'), ITEMS] }, { help: 'The resources, items or buildings the reward actually is.', group: 'The loop' }),
          f.long('nextDecision', 'Next decision or action', {
            help: 'What new choice does the reward open up? This is what makes the loop repeat.',
            placeholder: 'e.g. Craft the axe now, or save materials for a wall.',
            group: 'The loop',
          }),
          f.long('choiceShift', 'How choices change over time', { help: 'As this loop repeats, what changes about the options or trade-offs the player faces?', group: 'The loop' }),
          f.multi('leadsTo', 'Builds toward (longer loops)', section('loops'), {
            help: 'Which longer loops does repeating this one progress? Only link to a longer time scale.',
            group: 'Links',
          }),
          f.multi('pillars', 'Serves pillars', section('pillars', 'overview.vision'), { help: 'The Vision pillars this loop delivers.', group: 'Links' }),
          f.multi('nodes', 'Diagram nodes', section('loopGraph'), { help: 'The actions, systems and rewards in the loop diagram that make up this loop.', group: 'Links' }),
          f.long('description', 'Notes'),
        ],
        [v.cards(), v.progression('scale', 'leadsTo'), v.loopPacing(), v.kanban('scale'), v.table()],
        {
          exportSplit: {
            field: 'scale',
            headings: ['Moment-to-moment', 'Short-term loop (minutes)', 'Medium-term loop (hours / days)', 'Long-term loop (campaign)'],
          },
        },
      ),
      s.form('rewardsProgression', 'Rewards and progression systems', [
        f.long('rewardsProgression', 'Rewards and progression systems', {
          help: 'What motivates the player, and how do the loops feed each other?',
          placeholder: 'e.g. Gathering feeds crafting; crafting unlocks expeditions; expeditions unlock factions.',
        }),
      ]),
      s.graph('loopGraph', 'Gameplay diagrams', ['Action', 'System', 'Resource', 'Reward', 'Goal'], {
        edgeKinds: ['leads to', 'feeds', 'rewards', 'unlocks'],
        description:
          'Action: something the player does. System: a game system that reacts (link it to a real system below). Resource: something gathered or spent. Reward: what the player gains. Goal: a target worth working toward. Use “feeds” for repeated actions, “rewards” or “leads to” back to an earlier node for a feedback loop, and “unlocks” for gates.',
        nodeSource: LOOP_SYSTEMS,
        links: { section: 'loops', field: 'nodes', label: 'Loops using this node' },
      }),
    ]),
    version: 2,
    migrate: migrateCoreLoop,
  },
  {
    ...mod('design', 'difficulty', 'Difficulty Levels', 'docs/01_design/difficulty.md', '⚖️', 'Parameters scaled by difficulty.', [
      s.form('principles', 'Principles', [
        f.long('principles', 'Principles', {
          help: 'What does difficulty scale: combat, survival, economy, NPC needs? What should it never change?',
          placeholder: 'e.g. Difficulty changes pressure, not the rules; no preset locks content.',
        }),
      ]),
      s.collection(
        'presets',
        'Difficulty presets',
        'preset',
        [
          f.ref('level', 'Level', catalog('difficulties'), { help: 'Which entry of the “Difficulty levels” catalog (Definitions) this describes.' }),
          f.long('intent', 'Intended experience', { help: 'What should this preset feel like?', placeholder: 'e.g. Relaxed; mistakes are forgiven and the story stays in focus.' }),
          f.long('targetPlayer', 'Target player', { help: 'Who is it for?', placeholder: 'e.g. Newcomers to survival games.' }),
        ],
        [v.cards(), v.table()],
        {
          seed: [
            { name: 'Easy', level: 'easy' },
            { name: 'Medium', level: 'medium' },
            { name: 'Hard', level: 'hard' },
          ],
        },
      ),
      s.collection(
        'params',
        'Parameters',
        'parameter',
        [
          f.enm('category', 'Category', CATEGORIES),
          f.enm('unit', 'Unit', UNITS, { help: '× multiplier, % percentage, or an absolute amount. Sets how values are entered and compared.' }),
          f.enm('direction', 'Effect of a higher value', [HARDER, EASIER, 'Neutral'], { help: 'Lets the editor spot unintended difficulty reversals.' }),
          f.num('baseline', 'Baseline', { help: 'The value of the reference / default experience.', step: 0.01 }),
          f.num('min', 'Range min', { help: 'Lowest meaningful value.', step: 0.01 }),
          f.num('max', 'Range max', { help: 'Highest meaningful value.', step: 0.01 }),
          f.bool('exception', 'Intentional exception', { help: 'Tick if this parameter is meant not to follow the harder-is-higher ordering.' }),
          f.long('notes', 'Notes'),
        ],
        [v.table(['category', 'unit', 'direction', 'baseline', 'min', 'max']), v.cards(), v.compare('values', catalog('difficulties'))],
        { seed: PARAM_SEED },
      ),
      s.matrix(
        'values',
        'Parameter values per difficulty',
        section('params'),
        catalog('difficulties'),
        { type: 'number', min: 0, max: 10 },
        {
          description: 'Rows are the parameters above, columns come from the “Difficulty levels” catalog (extendable in Definitions). Each row uses its own range and unit.',
          rowMeta: { unit: 'unit', min: 'min', max: 'max', baseline: 'baseline', notes: 'notes', group: 'category' },
        },
      ),
      s.collection(
        'custom',
        'Custom and accessibility settings',
        'setting',
        [
          f.text('pressure', 'Pressure the player adjusts', { placeholder: 'e.g. Hunger speed' }),
          f.multi('params', 'Parameters it changes', section('params')),
          f.num('min', 'Lowest setting', { step: 0.01 }),
          f.num('max', 'Highest setting', { step: 0.01 }),
          f.long('notes', 'Notes', { help: 'Optional: lets players tune selected pressures without a new fixed preset.' }),
        ],
        [v.table(), v.cards()],
        { description: 'Optional. Selected pressures players can adjust themselves, so you need fewer fixed presets.' },
      ),
      s.form('switching', 'Changing difficulty', [
        f.long('switching', 'Can difficulty be changed during play?'),
        f.long('timing', 'When do changes take effect?', { placeholder: 'e.g. Immediately, or at the next day / save.' }),
        f.long('persistence', 'Is the choice stored per save?'),
        f.long('achievements', 'Effect on achievements'),
        f.long('permadeath', 'Permadeath and other interactions'),
      ]),
      s.form('storage', 'Data storage', [
        f.long('storage', 'Data storage', { help: 'Where the parameters live in data; see the data-driven design document.' }),
      ]),
    ]),
    version: 2,
    migrate: migrateDifficulty,
  },
  {
    ...mod('design', 'factions', 'Factions & Diplomacy', 'docs/01_design/factions_diplomacy.md', '🏛️', 'Factions, relations and consequences.', [
      s.form('overview', 'System overview', [
        f.long('model', 'Reputation model', {
          help: 'How does reputation work? Per faction, per player, shared between factions?',
          placeholder: 'e.g. Each faction tracks one reputation number for the player; it moves through actions and drifts back to neutral.',
        }),
        f.num('scaleMin', 'Scale: lowest value', { help: 'Default -100. Relationship levels and the matrix use this range.' }),
        f.num('scaleMax', 'Scale: highest value', { help: 'Default 100.' }),
        f.num('startValue', 'Starting value', { help: 'Reputation a new game starts with.' }),
        f.text('decay', 'Decay', { placeholder: 'e.g. 1 point per day towards 0' }),
        f.num('allyAt', 'Counts as allied from', { help: 'Matrix values at or above this are “allied” (default 50). Used to check the relationship graph.' }),
        f.num('enemyAt', 'Counts as hostile up to', { help: 'Matrix values at or below this are “hostile” (default -50).' }),
        f.long('changeRules', 'How relationships change', { help: 'Actions, time, events; and how supporting one group affects others.' }),
      ], 'Settle the scale first. The editor is flexible about how many factions there are: add as many as the design needs.'),
      s.collection(
        'factions',
        'Factions',
        'faction',
        [
          f.color('color', 'Color'),
          f.long('history', 'History'),
          f.long('goals', 'Goals and ideology'),
          f.multi('characters', 'Key characters', section('characters', 'design.story'), { help: 'Pick from the characters in Story & Quests.' }),
          f.text('capital', 'Capital'),
          f.long('capitalDescription', 'Capital: mood, services, trade, quests'),
          f.long('playstyle', 'Playstyle focus', { help: 'Which build or playstyle suits this faction?' }),
          f.multi('unlocks', 'Unlockable skills / items', UNLOCKABLE, { help: 'Pick from the skill tree and the item list.' }),
          f.long('unlockConditions', 'Unlock conditions', { placeholder: 'e.g. Reputation 40+ and the “Border Patrol” quest done.' }),
          f.long('legacyNotes', 'Earlier notes', { help: 'Free text carried over from before characters and unlocks became links.' }),
        ],
        [v.cards(), v.table(['name', 'capital', 'goals'])],
      ),
      s.matrix('relations', 'Relationship matrix', section('factions'), section('factions'), { type: 'number', min: -100, max: 100 }, {
        diagonal: false,
        symmetric: true,
        rangeFrom: { section: 'overview', minField: 'scaleMin', maxField: 'scaleMax' },
        description:
          'Reputation: how the row faction regards the column faction. -100 = hostile, 0 = neutral, 100 = allied (or your own scale). Directional: asymmetric pairs are marked for review, not forbidden. This matrix is the authoritative model; the graph below shows named relationships.',
      }),
      s.graph('relationGraph', 'Relationship graph', ['Faction'], {
        nodeSource: section('factions'),
        edgeKinds: ['Ally', 'Enemy', 'Neutral', 'Trade'],
        description: 'Named relationships such as alliances, wars and trade pacts. It is checked against the matrix, but the two are separate data.',
      }),
      s.collection(
        'actions',
        'Actions → reputation effects',
        'action',
        [
          f.ref('faction', 'Faction', section('factions'), { help: 'The faction that cares about this action.' }),
          f.num('effectOnFaction', 'Direct change with this faction', { min: -100, max: 100, help: 'Reputation change with the faction above.' }),
          f.map('spillover', 'Spillover per faction', section('factions'), 100, { min: -100, help: 'Reputation change with each other faction, when it differs from the default.' }),
          f.num('spilloverDefault', 'Default spillover (all others)', { min: -100, max: 100, help: 'Rough estimate applied to every other faction when no per-faction value is set.' }),
          f.long('spilloverWhy', 'Why others react', { help: 'e.g. Supporting the guild antagonizes the crown.' }),
          f.long('description', 'Description'),
        ],
        [v.table(), v.cards()],
      ),
      s.collection(
        'thresholds',
        'Relationship levels and consequences',
        'level',
        [
          f.num('min', 'Min value', { min: -100, max: 100 }),
          f.num('max', 'Max value', { min: -100, max: 100, help: 'Optional. Without it the level runs up to the next level’s minimum.' }),
          f.long('consequences', 'Trade, attacks, quests, biome access'),
        ],
        [v.table(), v.ranges('min', 'max', { section: 'overview', minField: 'scaleMin', maxField: 'scaleMax', fallback: [-100, 100] })],
      ),
      s.collection(
        'endings',
        'Endings',
        'ending',
        [f.multi('factions', 'Involved factions', section('factions')), f.long('conditions', 'Conditions'), f.long('description', 'Description')],
        [v.cards(), v.table()],
      ),
    ]),
    version: 2,
    migrate: migrateFactions,
  },
  {
    ...mod('design', 'world', 'World & Biomes', 'docs/01_design/world_biomes.md', '🌍', 'Biomes, progression, outposts, map.', [
      s.form('exploration', 'World structure and exploration', [
        f.num('mapWidth', 'Map width', { min: 0 }),
        f.num('mapHeight', 'Map height', { min: 0 }),
        f.enm('mapUnit', 'Map unit', ['m', 'km', 'tiles', 'screens']),
        f.num('regions', 'Region count', { min: 0 }),
        f.long('layout', 'Layout overview'),
        f.enm('generationMode', 'Generation', ['Hand-made', 'Procedural', 'Mixed']),
        f.long('generation', 'Generation constraints'),
        f.long('navigation', 'Navigation: fast travel, fog of war, map UI'),
        f.long('map', 'Other map notes'),
      ], 'The sketch below is the spatial layout. Here record scale, generation and navigation.'),
      s.collection(
        'biomes',
        'Biomes',
        'biome',
        [
          f.enm('role', 'Role', ['Starter', 'Early', 'Mid', 'Late', 'Final']),
          f.color('color', 'Color'),
          f.long('atmosphere', 'Atmosphere and visuals'),
          f.multi('resources', 'Resources', catalog('resources')),
          f.long('hazards', 'Environmental hazards / corruption'),
          f.enm('entryType', 'Entry condition', ['None', 'Story', 'Faction', 'Boss', 'Item']),
          f.multi('entryQuests', 'Required quests', section('quests', 'design.story')),
          f.multi('entryFactions', 'Required factions', FACTIONS),
          f.multi('entryBosses', 'Required bosses', section('bosses', 'design.combat')),
          f.long('entry', 'Entry notes'),
          f.bool('optional', 'Optional / intentionally isolated'),
          f.multi('enemies', 'Enemies', section('enemies', 'design.combat')),
          f.multi('bosses', 'Bosses', section('bosses', 'design.combat')),
          f.multi('garrisons', 'Outposts / garrisons', section('outposts')),
          f.list('pois', 'Points of interest'),
        ],
        [v.cards(), v.kanban('role'), v.table(['name', 'role', 'entryType', 'resources'])],
      ),
      s.graph('progression', 'Progression graph', ['Biome', 'Boss', 'Story event', 'Faction gate'], {
        nodeSource: BIOMES,
        edgeSource: { any: [section('quests', 'design.story'), FACTIONS, section('bosses', 'design.combat')] },
        edgeKinds: ['unlocks via story', 'unlocks via faction', 'unlocks via boss'],
        description: 'Visual layer of the unlock path. The entry condition on each biome is authoritative; hints flag disagreements.',
      }),
      s.canvas('map', 'Map sketch', ['Biome zone', 'Capital', 'Outpost', 'Landmark', 'Note'], 'Spatial layout. Link biome zones to biome entries.', {
        zones: { kinds: ['Biome zone'], source: BIOMES },
        scale: { section: 'exploration', widthField: 'mapWidth', heightField: 'mapHeight', unitField: 'mapUnit' },
      }),
      s.collection(
        'outposts',
        'Outposts to capture',
        'outpost',
        [
          f.ref('biome', 'Biome', BIOMES),
          f.multi('defenderRefs', 'Defenders', { any: [section('archetypes', 'design.npc'), section('enemies', 'design.combat')] }),
          f.long('defenders', 'Defender notes'),
          f.enm('method', 'Capture method', ['Military', 'Tactical', 'Diplomatic', 'Mixed']),
          f.multi('rewardRefs', 'Rewards', { any: [catalog('resources'), section('buildings', 'design.town'), ITEMS] }),
          f.long('reward', 'Reward notes'),
          f.long('founding', 'Town founding requirements'),
        ],
        [v.table(['name', 'biome', 'method', 'rewardRefs']), v.cards()],
      ),
    ]),
    version: 2,
    migrate: migrateWorld,
  },
  {
    ...mod('design', 'town', 'Town Management & Logistics', 'docs/01_design/town_management.md', '🏘️', 'Buildings, resource flow, economy, morale.', [
    s.collection(
      'buildings',
      'Buildings',
      'building',
      [
        f.enm('category', 'Category', BUILDING_CATEGORIES),
        f.enm('status', 'Status', STATUSES),
        f.text('function', 'Function'),
        f.num('count', 'Planned count', { min: 0, help: 'How many copies the estimate assumes. Empty counts as 1.' }),
        f.num('capacity', 'Capacity (population housed)', { min: 0 }),
        f.num('storage', 'Storage provided', { min: 0 }),
        f.num('tiers', 'Upgrade tiers', { min: 1 }),
        f.map('cost', 'Build cost', catalog('resources')),
        f.num('buildTime', 'Construction time', { min: 0, help: 'In the same time unit as the economy model.' }),
        f.num('cycle', 'Production cycle (time units)', { min: 0, help: 'Length of one production cycle. Inputs and outputs below are per cycle; empty counts as 1.' }),
        f.map('inputs', 'Inputs per cycle', catalog('resources')),
        f.map('outputs', 'Outputs per cycle', catalog('resources')),
        f.map('wasteOutputs', 'Waste / by-products per cycle', catalog('resources')),
        f.multi('workers', 'Worker professions', catalog('professions')),
        f.num('workersRequired', 'Workers required', { min: 0 }),
        f.num('skillLevel', 'Required skill level', { min: 0 }),
        f.long('efficiencyConditions', 'Conditions affecting efficiency'),
        f.multi('requires', 'Requires buildings', section('buildings')),
        f.multi('upgradesTo', 'Upgrades into', section('buildings')),
        f.long('upgrades', 'Upgrade path (notes)'),
        f.long('unlockedBy', 'Unlocked by'),
      ],
      [v.cards(), v.table(['name', 'category', 'status', 'function', 'count', 'capacity', 'workersRequired', 'inputs', 'outputs', 'cost']), v.economy()],
      {
        seed: [
          { name: 'House', function: 'Housing for NPCs', capacity: 4, category: 'Housing' },
          { name: 'Miner', function: 'Collects and smelts ore', category: 'Production' },
          { name: 'Lumberjack', function: 'Produces wood', category: 'Production' },
          { name: 'Farmer', function: 'Produces food', category: 'Production' },
          { name: 'Tavern', function: 'Entertainment, random quests', category: 'Services' },
          { name: 'School', function: 'Trains young NPCs (needs a teacher)', category: 'Services' },
        ],
      },
    ),
    s.collection(
      'bases',
      'Bases & warehouses',
      'base',
      [
        f.enm('type', 'Type', BASE_TYPES),
        f.num('capacity', 'Storage capacity', { min: 0 }),
        f.map('startStock', 'Starting stock', catalog('resources')),
        f.map('minStock', 'Minimum stock', catalog('resources')),
        f.map('targetStock', 'Target stock', catalog('resources')),
        f.enm('resupply', 'Resupply', ['Automatic', 'Manual', 'None']),
        f.long('rules', 'Storage rules'),
      ],
      [v.table(['name', 'type', 'capacity', 'resupply']), v.cards()],
      { description: 'Places that hold stock and that routes connect. Use them for settlements, depots, outposts or shops, whatever fits the game.' },
    ),
    s.graph('flow', 'Resource flow', ['Building', 'Resource', 'NPC role', 'Market', 'Player'], {
      nodeSource: section('buildings'),
      edgeKinds: ['produces', 'consumes', 'sells to', 'buys from', 'transports'],
    }),
    s.form('economy', 'Economy model', [
      f.text('timeUnit', 'Time unit', { placeholder: 'tick, minute, day…', help: 'Name of the clock the cycles and rates use. Only a label.' }),
      f.num('horizon', 'Estimate horizon (time units)', { min: 1 }),
      f.num('population', 'Assumed population', { min: 0, help: 'Overrides the population housed by buildings in the estimate.' }),
      f.long('moneyFlow', 'Money flow (wages, tax, treasury)'),
      f.num('buyMargin', 'Player buy price multiplier', { min: 0 }),
      f.num('sellMargin', 'Player sell price multiplier', { min: 0 }),
      f.long('indirectAccess', 'Indirect resource access'),
      f.num('storageLimit', 'Default storage limit', { min: 0 }),
      f.long('storageRules', 'Storage rules'),
    ]),
    s.collection(
      'commands',
      'Player commands',
      'command',
      [
        f.long('description', 'Description'),
        f.long('conditions', 'Conditions'),
        f.text('target', 'Target'),
        f.num('priority', 'Priority', { min: 0 }),
        f.map('cost', 'Cost', catalog('resources')),
        f.num('executionTime', 'Execution time', { min: 0 }),
        f.long('effects', 'Effects'),
        f.long('ui', 'UI notes'),
      ],
      [v.cards(), v.table(['name', 'target', 'priority', 'executionTime', 'cost'])],
    ),
    s.collection(
      'routes',
      'Logistics routes',
      'route',
      [
        f.ref('fromBase', 'From', section('bases')),
        f.ref('toBase', 'To', section('bases')),
        f.multi('cargo', 'Cargo', catalog('resources')),
        f.map('quantity', 'Wanted per time unit', catalog('resources')),
        f.text('transport', 'Transport type'),
        f.num('capacity', 'Capacity per trip', { min: 0 }),
        f.num('frequency', 'Trips per time unit', { min: 0 }),
        f.num('travelTime', 'Travel time', { min: 0 }),
        f.map('upkeep', 'Upkeep per time unit', catalog('resources')),
        f.enm('risk', 'Risk level', ['Low', 'Medium', 'High']),
        f.num('priority', 'Priority', { min: 0 }),
        f.long('restrictions', 'Restrictions (region, faction, event…)'),
        f.long('risks', 'Risks'),
      ],
      [v.table(['name', 'fromBase', 'toBase', 'cargo', 'capacity', 'frequency', 'travelTime', 'risk']), v.cards()],
    ),
    s.collection(
      'morale',
      'Morale thresholds',
      'threshold',
      [f.num('value', 'Morale value', { min: 0, max: 100 }), f.enm('effect', 'Effect', ['Bonus', 'None', 'Slowdown', 'Production stops', 'Leave town', 'Rebel']), f.long('notes', 'Notes')],
      [v.table()],
    ),
    s.collection(
      'factors',
      'Morale factors',
      'factor',
      [
        f.enm('kind', 'Kind', ['Food', 'Safety', 'Housing', 'Services', 'Wages', 'Environment', 'Other']),
        f.num('change', 'Morale change', { min: -100, max: 100 }),
        f.enm('duration', 'Duration', ['One-time', 'Gradual', 'Permanent']),
        f.num('durationTime', 'Duration (time units)', { min: 0 }),
        f.multi('groups', 'Affected groups', catalog('professions'), { help: 'Leave empty for the whole population.' }),
        f.ref('need', 'Linked need', section('needRules', 'design.npc')),
        f.enm('consequence', 'Consequence', ['None', 'Slowdown', 'Production stops', 'Leave town', 'Conflict', 'Rebel']),
        f.long('remedy', 'Remedy'),
        f.map('remedyCost', 'Remedy cost', catalog('resources')),
        f.num('remedyTime', 'Remedy time', { min: 0 }),
      ],
      [v.table(['name', 'kind', 'change', 'duration', 'consequence']), v.cards()],
      { description: 'What raises or lowers morale, who it hits, how long it lasts and what follows. Chain a shortage to its consequence here.' },
    ),
    s.form('extensibility', 'Extensibility', [f.long('plan', 'How new needs, stats and functions are added without touching core code')]),
    ]),
    version: 2,
    migrate: migrateTown,
  },
  {
    ...mod('design', 'npc', 'NPC System', 'docs/01_design/npc_system.md', '🧑‍🤝‍🧑', 'Stats, needs, life cycle, work, relationships, events.', [
      s.form('overview', 'Overview', [
        f.long('role', 'Role of NPCs in the game', { help: 'What do NPCs do for the player and the town? What should managing them feel like?', placeholder: 'e.g. Townsfolk are the workforce; keeping their needs met is the main town-management pressure.' }),
        f.num('populationTarget', 'Typical population', { min: 0, help: 'Rough size of a mid-game town; used as context, not a limit.' }),
        f.num('statMin', 'Stat scale: lowest', { help: 'Default 0. Archetype stats, the radar and the stat checks use this range.' }),
        f.num('statMax', 'Stat scale: highest', { help: 'Default 10.' }),
        f.num('maxAge', 'Maximum age', { min: 1, help: 'Default 100. Life stages are checked against 0 … this age.' }),
        f.enm('ageUnit', 'Age unit', ['in-game days', 'in-game years', 'real-time hours']),
        f.num('unitsPerDay', 'Town time units per NPC day', { min: 0, step: 0.01, help: 'Town rates are per its own time unit; needs here are per day. Default 1.' }),
      ], 'Set the scales first: they drive the stat inputs, the radar, the life-stage ranges and the needs balance.'),
      s.collection(
        'statRules',
        'Stats',
        'stat rule',
        [
          f.ref('stat', 'Stat', catalog('npcStats'), { help: 'From the “NPC stats” catalog (Definitions).' }),
          f.long('effect', 'Effect', { placeholder: 'e.g. Raises carry capacity and building speed.' }),
          f.formula('formula', 'Formula', {
            help: 'Use stat names as variables (lower case, “-” becomes “_”), plus level and age, e.g. 10 + strength * 2. The Preview view evaluates it for every archetype.',
          }),
          f.enm('progression', 'How it changes', ['Fixed', 'Grows with work', 'Trained', 'Changes with age', 'Event-driven']),
          f.long('growth', 'Growth details'),
        ],
        [v.table(['name', 'stat', 'formula', 'progression']), v.statPreview('formula', 'stat', { section: 'archetypes', mapField: 'stats' }), v.cards()],
        { description: 'One rule per stat: what it does, its formula and how it develops.' },
      ),
      s.collection(
        'needRules',
        'Needs',
        'need rule',
        [
          f.ref('need', 'Need', catalog('needs'), { help: 'From the “NPC needs” catalog (Definitions).' }),
          f.enm('kind', 'Kind', ['Basic', 'Profession', 'Comfort']),
          f.long('scaling', 'Scales with', { placeholder: 'e.g. Profession, life stage, difficulty multiplier.' }),
          f.ref('resource', 'Satisfied by resource', catalog('resources'), { help: 'Consumed from the town stock. The needs balance compares it with the Town estimate.', group: 'Supply' }),
          f.multi('buildings', 'Satisfied by buildings', section('buildings', 'design.town'), { help: 'Buildings that provide this need as places (e.g. housing).', group: 'Supply' }),
          f.num('perBuilding', 'Places per building', { min: 0, help: 'Empty uses the building’s capacity.', group: 'Supply' }),
          f.num('graceDays', 'Days before consequences', { min: 0, group: 'When unmet' }),
          f.enm('consequence', 'Consequence when unmet', ['Production stops', 'Morale loss', 'Leaves town', 'Rebels', 'Dies'], { group: 'When unmet' }),
          f.num('moraleImpact', 'Morale change per day unmet', { min: -100, max: 100, group: 'When unmet' }),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'need', 'kind', 'resource', 'buildings', 'consequence']), v.cards()],
      ),
      s.collection(
        'archetypes',
        'NPC archetypes',
        'archetype',
        [
          f.ref('profession', 'Profession', catalog('professions'), { group: 'Identity' }),
          f.num('share', 'Share of population (%)', { min: 0, max: 100, help: 'Also the spawn weight for generation.', group: 'Identity' }),
          f.ref('faction', 'Faction', FACTIONS, { group: 'Identity' }),
          f.list('traits', 'Traits', { group: 'Identity' }),
          f.map('stats', 'Stats', catalog('npcStats'), undefined, { rangeFrom: { section: 'overview', minField: 'statMin', maxField: 'statMax' }, group: 'Stats & needs' }),
          f.map('needs', 'Needs per day', catalog('needs'), undefined, { group: 'Stats & needs', help: 'Units per NPC day; for place-based needs such as housing, places per NPC.' }),
          f.ref('home', 'Lives in', section('buildings', 'design.town'), { group: 'Town' }),
          f.multi('workplaces', 'Works in', section('buildings', 'design.town'), { group: 'Town' }),
          f.long('notes', 'Notes'),
        ],
        [v.cards(), v.radar('stats', { section: 'overview', minField: 'statMin', maxField: 'statMax' }), v.table(['name', 'profession', 'share', 'faction', 'home'])],
        { description: 'Stats and needs come from catalogs: add a new stat in Definitions and it appears here, in the radar and in the stat preview.' },
      ),
      s.collection(
        'lifeStages',
        'Life stages',
        'stage',
        [
          f.num('ageFrom', 'Age from', { min: 0 }),
          f.num('ageTo', 'Age to', { min: 0, help: 'Optional. Without it the stage runs up to the next stage’s start.' }),
          f.bool('canWork', 'Can work'),
          f.map('statModifiers', 'Stat modifiers (%)', catalog('npcStats'), undefined, { min: -100 }),
          f.num('needModifier', 'Need modifier (%)', { min: -100 }),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'ageFrom', 'ageTo', 'canWork', 'needModifier']), v.ranges('ageFrom', 'ageTo', { section: 'overview', minField: 'ageMin', maxField: 'maxAge', fallback: [0, 100] })],
      ),
      s.graph('lifecycle', 'Life cycle state machine', ['Start', 'State', 'Event', 'End'], {
        nodeSource: section('lifeStages'),
        edgeSource: section('events'),
        edgeKinds: ['when', 'after time', 'on event'],
        description: 'Start: how an NPC enters (birth, arrival). State: a phase, ideally linked to a life stage. End: death or leaving. Link “on event” connections to the event that causes them.',
      }),
      s.collection(
        'jobs',
        'Work and professions',
        'job',
        [
          f.ref('profession', 'Profession', catalog('professions')),
          f.multi('buildings', 'Works in', section('buildings', 'design.town'), { help: 'Should match the building’s worker professions in Town.' }),
          f.multi('keyStats', 'Key stats', catalog('npcStats')),
          f.formula('efficiency', 'Efficiency formula', { help: 'Same variables as stat formulas, e.g. 0.5 + strength / 20.' }),
          f.ref('minStage', 'Earliest life stage', section('lifeStages')),
          f.num('wage', 'Wage per day', { min: 0 }),
          f.long('training', 'Training (school, apprenticeship)'),
          f.long('assignment', 'How NPCs get assigned'),
        ],
        [v.table(['name', 'profession', 'buildings', 'keyStats', 'efficiency', 'wage']), v.cards()],
      ),
      s.matrix('routine', 'Daily routine', catalog('professions'), catalog('timeOfDay'), { type: 'enum', options: ['Sleep', 'Work', 'Eat', 'Leisure', 'Socialize', 'Patrol', 'Travel', 'Train'] }, {
        description: 'What each profession does at each time of day. Rows and columns come from the “NPC professions” and “Times of day” catalogs.',
      }),
      s.form('relationships', 'Relationships', [
        f.num('scaleMin', 'Affinity: lowest', { help: 'Default -100.' }),
        f.num('scaleMax', 'Affinity: highest', { help: 'Default 100.' }),
        f.num('start', 'Starting affinity'),
        f.text('decay', 'Decay', { placeholder: 'e.g. 1 point per week towards 0' }),
        f.long('changes', 'What changes affinity', { placeholder: 'e.g. Working together, shared meals, insults, gifts.' }),
      ]),
      s.collection(
        'relationLevels',
        'Relationship levels',
        'level',
        [f.num('min', 'Min affinity'), f.num('max', 'Max affinity', { help: 'Optional. Without it the level runs up to the next level’s minimum.' }), f.long('effects', 'Effects')],
        [v.table(), v.ranges('min', 'max', { section: 'relationships', minField: 'scaleMin', maxField: 'scaleMax', fallback: [-100, 100] })],
      ),
      s.collection(
        'bonds',
        'Bonds',
        'bond',
        [
          f.enm('kind', 'Kind', ['Friendship', 'Romance', 'Marriage', 'Family', 'Rivalry', 'Feud']),
          f.ref('requiresLevel', 'Requires level', section('relationLevels')),
          f.bool('exclusive', 'Exclusive (only one at a time)'),
          f.long('effects', 'Effects'),
        ],
        [v.table(), v.cards()],
        { description: 'Named relationships between two NPCs and what forming them requires.' },
      ),
      s.collection(
        'events',
        'Random events',
        'event',
        [
          f.enm('category', 'Category', ['Marriage', 'Romance', 'Friendship', 'Feud', 'Birth', 'Death', 'Illness', 'Accident', 'Arrival', 'Departure', 'Other']),
          f.long('trigger', 'Trigger', { group: 'When' }),
          f.num('chance', 'Chance (%)', { min: 0, max: 100, group: 'When' }),
          f.enm('period', 'Chance per', ['day', 'week', 'season', 'year', 'once'], { group: 'When' }),
          f.num('cooldown', 'Cooldown (days)', { min: 0, group: 'When' }),
          f.multi('participants', 'Archetypes involved', section('archetypes'), { group: 'Who', help: 'Leave empty for anyone.' }),
          f.ref('requiresBond', 'Requires bond', section('bonds'), { group: 'Who' }),
          f.map('statEffects', 'Stat changes', catalog('npcStats'), undefined, { min: -100, group: 'Effect' }),
          f.num('moraleEffect', 'Morale change', { min: -100, max: 100, group: 'Effect' }),
          f.long('effect', 'Other effects', { group: 'Effect' }),
        ],
        [v.kanban('category'), v.table(['name', 'category', 'chance', 'period', 'cooldown', 'moraleEffect'])],
      ),
      s.form('equipmentRules', 'Equipment', [f.long('notes', 'Equipment rules', { help: 'Who equips NPCs, durability, upgrades.' })]),
      s.collection(
        'slots',
        'Equipment slots',
        'slot',
        [f.multi('itemTypes', 'Allowed item types', catalog('itemTypes')), f.multi('professions', 'Only for professions', catalog('professions')), f.long('effects', 'Effects')],
        [v.table(), v.cards()],
      ),
      s.form('mercenaries', 'Mercenary armies', [
        f.long('recruitment', 'Recruitment'),
        f.long('control', 'Control and orders'),
        f.num('upkeep', 'Upkeep per soldier per day', { min: 0 }),
        f.num('maxSize', 'Maximum army size', { min: 0 }),
        f.long('notes', 'Notes'),
      ]),
      s.form('behaviour', 'Behaviour (AI)', [
        f.long('decision', 'Decision model', { placeholder: 'e.g. Utility scores per need; the highest unmet need wins.' }),
        f.long('priorities', 'Need priorities'),
        f.long('routine', 'Daily routine notes', { help: 'The routine matrix above shows the plan per profession; technical details belong in the AI systems document.' }),
      ]),
      s.form('generation', 'Generation, names and appearance', [
        f.long('names', 'Names'),
        f.long('appearance', 'Appearance'),
        f.num('statVariance', 'Stat variance (±)', { min: 0, help: 'How far a generated NPC may differ from its archetype.' }),
        f.long('notes', 'Generation rules', { help: 'Archetype shares act as spawn weights.' }),
      ]),
      s.collection(
        'scenarios',
        'Population scenarios',
        'scenario',
        [
          f.map('population', 'Population per archetype', section('archetypes')),
          f.long('notes', 'Notes'),
        ],
        [v.needsBalance('population'), v.table()],
        { description: 'Check a population mix against the town: daily needs per archetype against the Town estimate. Planning estimate, not a simulation.' },
      ),
    ]),
    version: 2,
    migrate: migrateNpc,
  },
  {
    ...mod('design', 'player', 'Player Character', 'docs/01_design/player_character.md', '🧍', 'Hero, survival, levelling, casts, skills, abilities.', [
      s.form('hero', 'The hero', [
        f.text('fantasy', 'Player fantasy', { help: 'One line: what does playing the hero feel like?', placeholder: 'e.g. A stranded soldier who learns to bend old magic to industrial will.' }),
        f.long('background', 'Background'),
        f.long('personality', 'Personality'),
        f.long('start', 'Starting state', { placeholder: 'e.g. Washed ashore with a broken rifle, half health, no food.' }),
        f.multi('startItems', 'Starting items', ITEMS),
      ]),
      s.collection(
        'survival',
        'Survival stats',
        'stat',
        [
          f.ref('stat', 'Stat', catalog('survivalStats'), { help: 'From the “Survival stats” catalog (Definitions).' }),
          f.num('max', 'Max', { min: 0, group: 'Pacing' }),
          f.num('decay', 'Decay per time unit', { min: 0, step: 0.01, group: 'Pacing' }),
          f.enm('decayUnit', 'Time unit', ['real minute', 'in-game hour'], { group: 'Pacing', help: 'Empty counts as real minutes.' }),
          f.num('criticalAt', 'Critical at', { min: 0, group: 'Pacing', help: 'Value where the low effect starts. Empty counts as 0.' }),
          f.ref('difficultyParam', 'Difficulty parameter', section('params', 'design.difficulty'), { group: 'Pacing', help: 'The Difficulty parameter that multiplies this decay per level.' }),
          f.list('tiers', 'Effect tiers', { group: 'Effects', placeholder: 'e.g. ≤ 30: move 10% slower' }),
          f.long('lowEffect', 'Effect at low value', { group: 'Effects' }),
          f.long('restore', 'Restored by', { group: 'Restore' }),
          f.multi('restoreItems', 'Restoring items', ITEMS, { group: 'Restore' }),
        ],
        [v.table(['name', 'stat', 'max', 'decay', 'decayUnit', 'criticalAt', 'difficultyParam']), v.depletion(), v.cards()],
      ),
      s.form('leveling', 'Levelling', [
        f.num('levelCap', 'Level cap', { min: 1 }),
        f.formula('xpFormula', 'XP needed for the next level', { help: 'Use the variable level, e.g. 100 * level ^ 1.5.' }),
        f.num('skillPointsPerLevel', 'Skill points per level', { min: 0, step: 0.5 }),
        f.num('startSkillPoints', 'Skill points at level 1', { min: 0 }),
        f.num('statPointsPerLevel', 'Stat points per level', { min: 0 }),
        f.long('respec', 'Respec rules'),
      ], 'The curve, the points it gives and the cap together decide how much of each skill tree a player can own.'),
      s.collection(
        'xpSources',
        'XP sources',
        'source',
        [
          f.enm('kind', 'Kind', ['Kill', 'Quest', 'Craft', 'Build', 'Explore', 'Gather', 'Trade', 'Other']),
          f.num('xp', 'XP per action', { min: 0 }),
          f.num('perHour', 'Actions per hour (estimate)', { min: 0, step: 0.1, help: 'Rough rate for a typical player; drives the hours-to-level estimate.' }),
          f.multi('content', 'Linked content', { any: [section('enemies', 'design.combat'), section('quests', 'design.story'), section('recipes', 'design.items')] }),
          f.long('notes', 'Notes'),
        ],
        [v.levelCurve(), v.table(['name', 'kind', 'xp', 'perHour'])],
      ),
      s.collection(
        'casts',
        'Casts',
        'cast',
        [
          f.ref('cast', 'Cast', catalog('casts')),
          f.color('color', 'Color'),
          f.long('playstyle', 'Playstyle'),
          f.enm('primaryResource', 'Primary resource', ['Mana', 'Stamina', 'None']),
          f.multi('startAbilities', 'Starting abilities', section('abilities')),
          f.multi('startGear', 'Starting gear', ITEMS),
          f.multi('affinity', 'Faction affinity', FACTIONS),
          f.long('legacyNotes', 'Earlier notes', { help: 'Free text carried over from before abilities and gear became links.' }),
        ],
        [v.cards(), v.table(['name', 'cast', 'primaryResource', 'startAbilities', 'affinity'])],
      ),
      s.collection(
        'skills',
        'Skills',
        'skill',
        [
          f.ref('cast', 'Cast', catalog('casts')),
          f.enm('kind', 'Kind', ['Passive', 'Active', 'Spell']),
          f.num('tier', 'Tier', { min: 1 }),
          f.num('cost', 'Cost (skill points)', { min: 0 }),
          f.num('requiredLevel', 'Required level', { min: 1 }),
          f.multi('requires', 'Requires', section('skills'), { help: 'Skills that must be learned first.' }),
          f.ref('grants', 'Grants ability', section('abilities')),
          f.long('effect', 'Effect'),
        ],
        [v.skillTree(), v.buildPlanner(), v.table(['name', 'cast', 'kind', 'tier', 'cost', 'requiredLevel', 'requires', 'grants'])],
        { description: 'One entry per skill. The tree draws casts as lanes and tiers as rows; the build planner lets you learn skills at a chosen level.' },
      ),
      s.collection(
        'abilities',
        'Abilities and spells',
        'ability',
        [
          f.ref('cast', 'Cast', catalog('casts')),
          f.enm('kind', 'Kind', ['Active', 'Spell', 'Passive']),
          f.num('mana', 'Resource cost', { min: 0, help: 'Mana or stamina, per the cast’s primary resource.' }),
          f.num('cooldown', 'Cooldown (s)', { min: 0 }),
          f.num('castTime', 'Cast time (s)', { min: 0, step: 0.1 }),
          f.num('range', 'Range', { min: 0 }),
          f.ref('damageType', 'Damage type', catalog('damageTypes')),
          f.formula('formula', 'Effect formula', { help: 'Variables: level and any you choose; test values are set in the formula section.' }),
          f.long('description', 'Description'),
        ],
        [v.table(['name', 'cast', 'kind', 'mana', 'cooldown', 'castTime', 'damageType']), v.cards()],
      ),
      s.formulas('xp', 'Other formulas', 'Damage scaling, regeneration and other formulas. The XP curve itself is set in Levelling.'),
      s.form('controls', 'Controls and camera', [f.long('input', 'Input schemes'), f.long('camera', 'Camera')]),
      s.collection(
        'actions',
        'Input actions',
        'action',
        [f.text('keyboard', 'Keyboard / mouse'), f.text('gamepad', 'Gamepad'), f.text('context', 'Context'), f.bool('rebindable', 'Rebindable')],
        [v.table()],
      ),
      s.form('death', 'Death and respawn', [
        f.long('penalty', 'Penalty'),
        f.long('respawn', 'Respawn point'),
        f.long('itemLoss', 'Item loss and corpse run'),
        f.long('permadeath', 'Permadeath', { help: 'Which difficulty presets use it; see the Difficulty document.' }),
      ]),
    ]),
    version: 2,
    migrate: migratePlayer,
  },
  {
    ...mod('design', 'items', 'Items & Crafting', 'docs/01_design/items_crafting.md', '🎒', 'Item model, rarity and quality, types, recipes, loot, inventory.', [
      s.form('model', 'Item model', [
        f.text('currency', 'Value unit', { placeholder: 'e.g. silver shillings' }),
        f.text('weightUnit', 'Weight unit', { placeholder: 'e.g. kg' }),
        f.num('defaultStack', 'Default stack size', { min: 1 }),
        f.long('durability', 'Durability model', { placeholder: 'e.g. Tools and weapons lose 1 durability per use; repair at a workbench.' }),
        f.long('valueNotes', 'How value works', { help: 'The editor computes final value = base value × the rarity × quality multiplier below.' }),
      ], 'Common rules every item follows. Item-specific numbers go on the items themselves.'),
      s.collection(
        'rarityTiers',
        'Rarity tiers',
        'rarity tier',
        [
          f.ref('rarity', 'Rarity', catalog('rarities'), { help: 'From the “Item rarities” catalog (Definitions).' }),
          f.color('color', 'Color'),
          f.num('statMultiplier', 'Stat multiplier (×)', { min: 0, step: 0.05 }),
          f.num('dropWeight', 'Drop weight (occurrence)', { min: 0, help: 'Relative weight: 100 for common and 1 for legendary means legendary is 100 times rarer.' }),
          f.long('effect', 'Effect on properties'),
        ],
        [v.table(['name', 'rarity', 'statMultiplier', 'dropWeight']), v.rarityCurve()],
      ),
      s.collection(
        'qualityTiers',
        'Quality tiers',
        'quality tier',
        [
          f.ref('quality', 'Quality', catalog('qualities')),
          f.num('statMultiplier', 'Stat multiplier (×)', { min: 0, step: 0.05 }),
          f.long('obtained', 'How it is obtained', { placeholder: 'e.g. Craft skill roll; loot rolls one tier lower.' }),
          f.long('effect', 'Effect on properties'),
        ],
        [v.table(['name', 'quality', 'statMultiplier'])],
      ),
      s.matrix('multipliers', 'Value multiplier: rarity × quality', catalog('rarities'), catalog('qualities'), { type: 'number', min: 0, max: 100 }, {
        description: 'Each cell multiplies an item’s base value (× multiplier; empty counts as 1). Values should grow to the right and downward.',
      }),
      s.collection(
        'types',
        'Item types',
        'type profile',
        [
          f.ref('type', 'Type', catalog('itemTypes')),
          f.bool('combat', 'Uses combat fields'),
          f.bool('use', 'Uses consumable / effect fields'),
          f.bool('build', 'Uses building fields'),
          f.bool('tool', 'Uses tool fields'),
          f.long('usage', 'Usage'),
          f.list('examples', 'Examples'),
        ],
        [v.table(['name', 'type', 'combat', 'use', 'build', 'tool']), v.cards()],
        {
          description: 'Which field groups each item type uses. Items only show the groups their type uses; the rest stay under “Other fields”.',
          seed: TYPE_PROFILE_SEED,
        },
      ),
      s.collection(
        'items',
        'Items',
        'item',
        [
          f.ref('type', 'Type', catalog('itemTypes'), { group: 'Identity' }),
          f.ref('rarity', 'Rarity', catalog('rarities'), { group: 'Identity' }),
          f.ref('quality', 'Default quality', catalog('qualities'), { group: 'Identity' }),
          f.list('tags', 'Tags', { group: 'Identity' }),
          f.num('value', 'Base value', { min: 0, group: 'Common' }),
          f.num('weight', 'Weight', { min: 0, step: 0.1, group: 'Common' }),
          f.num('stack', 'Max stack', { min: 1, group: 'Common' }),
          f.num('durability', 'Durability', { min: 0, group: 'Common' }),
          f.num('damage', 'Damage', { min: 0, group: 'Combat' }),
          f.ref('damageType', 'Damage type', catalog('damageTypes'), { group: 'Combat' }),
          f.num('attackSpeed', 'Attacks per second', { min: 0, step: 0.05, group: 'Combat' }),
          f.num('armor', 'Armor', { min: 0, group: 'Combat' }),
          f.map('resistances', 'Resistances (%)', catalog('damageTypes'), 100, { group: 'Combat' }),
          f.enm('equipSlot', 'Equip slot', ['Main hand', 'Off hand', 'Two hands', 'Head', 'Body', 'Legs', 'Feet', 'Accessory', 'Tool belt'], { group: 'Combat' }),
          f.long('effect', 'Effect', { group: 'Use' }),
          f.map('restores', 'Restores', catalog('survivalStats'), undefined, { group: 'Use', help: 'Amount restored per survival stat (Player Character).' }),
          f.num('duration', 'Duration (s)', { min: 0, group: 'Use' }),
          f.num('cooldown', 'Cooldown (s)', { min: 0, group: 'Use' }),
          f.ref('places', 'Places building', section('buildings', 'design.town'), { group: 'Build' }),
          f.long('placement', 'Placement rules', { group: 'Build' }),
          f.num('toolPower', 'Tool power / tier', { min: 0, group: 'Tool' }),
          f.multi('harvests', 'Harvests', catalog('resources'), { group: 'Tool' }),
          f.long('description', 'Description (in-game text)'),
          f.long('notes', 'Other stats and notes'),
          f.long('legacyNotes', 'Earlier notes', { help: 'Free text carried over from before sources were computed from links.' }),
        ],
        [v.table(['name', 'type', 'rarity', 'quality', 'value', 'weight', 'stack']), v.itemCoverage(), v.valuePreview(), v.cards(), v.kanban('rarity')],
        { groupFilter: { field: 'type', profiles: { section: 'types', key: 'type' }, groups: { Combat: 'combat', Use: 'use', Build: 'build', Tool: 'tool' } } },
      ),
      s.collection(
        'stations',
        'Crafting stations',
        'station',
        [
          f.ref('building', 'Town building', section('buildings', 'design.town')),
          f.num('tier', 'Tier', { min: 0 }),
          f.long('unlock', 'Unlock'),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'building', 'tier']), v.cards()],
      ),
      s.collection(
        'recipes',
        'Recipes',
        'recipe',
        [
          f.ref('result', 'Result', ITEMS),
          f.num('outputQty', 'Output quantity', { min: 1, help: 'Empty counts as 1.' }),
          f.map('ingredients', 'Ingredients (item × quantity)', ITEMS, undefined, { min: 0 }),
          f.map('resources', 'Raw resources (× quantity)', catalog('resources'), undefined, { min: 0 }),
          f.ref('station', 'Station', section('stations')),
          f.num('tier', 'Tier', { min: 0 }),
          f.num('craftTime', 'Craft time (s)', { min: 0 }),
          f.ref('requiresSkill', 'Requires skill', section('skills', 'design.player')),
          f.multi('unlockedBy', 'Unlocked by', { any: [section('quests', 'design.story'), FACTIONS, section('skills', 'design.player')] }),
          f.long('unlock', 'Unlock notes'),
        ],
        [v.table(['name', 'result', 'outputQty', 'ingredients', 'resources', 'station', 'tier']), v.craftTree(), v.cards()],
        { description: 'Quantities matter: the crafting tree and the value checks use them.' },
      ),
      s.graph('recipeGraph', 'Crafting sketch (free diagram)', ['Item', 'Resource', 'Station'], {
        nodeSource: ITEMS,
        edgeKinds: ['crafted into', 'requires station'],
        description: 'Optional free sketch. The Crafting tree view under Recipes is drawn from the recipe data and is the source of truth.',
      }),
      s.form('inventory', 'Inventory and storage', [
        f.num('slots', 'Inventory slots', { min: 0 }),
        f.num('weightLimit', 'Carry weight limit', { min: 0 }),
        f.num('hotbar', 'Hotbar slots', { min: 0 }),
        f.long('encumbrance', 'Over the weight limit'),
        f.long('notes', 'Storage rules', { help: 'Chests, warehouses (Town bases), stack limits.' }),
      ]),
      s.collection(
        'loot',
        'Loot tables',
        'loot table',
        [
          f.multi('sources', 'Dropped by', { any: [section('enemies', 'design.combat'), section('bosses', 'design.combat'), BIOMES, section('outposts', 'design.world')] }),
          f.num('rolls', 'Rolls per drop', { min: 0, help: 'How many times the table is rolled each time it drops. Empty counts as 1.' }),
          f.map('weights', 'Item weights', ITEMS, undefined, { min: 0, help: 'Relative weights: chance per roll = weight ÷ sum of weights.' }),
          f.multi('guaranteed', 'Always drops', ITEMS),
          f.long('notes', 'Notes'),
          f.long('legacyNotes', 'Earlier notes'),
        ],
        [v.table(['name', 'sources', 'rolls', 'guaranteed']), v.lootOdds(), v.cards()],
      ),
    ]),
    version: 2,
    migrate: migrateItems,
  },
  {
    ...mod('design', 'combat', 'Combat, Enemies & Bosses', 'docs/01_design/combat_enemies.md', '⚔️', 'Combat model, damage, enemies, variants, bosses and sieges.', [
      s.form('system', 'Combat system', [
        f.long('model', 'Real-time / action, aiming, dodge, block'),
        f.long('statusNotes', 'Status effect rules', { help: 'General rules; individual effects are listed below.' }),
      ]),
      s.collection(
        'statusEffects',
        'Status effects',
        'status effect',
        [
          f.ref('damageType', 'Damage type', catalog('damageTypes')),
          f.num('tickDamage', 'Damage per tick', { min: 0 }),
          f.num('tickInterval', 'Tick interval (s)', { min: 0, step: 0.1 }),
          f.num('duration', 'Duration (s)', { min: 0, step: 0.1 }),
          f.num('maxStacks', 'Max stacks', { min: 1 }),
          f.num('slow', 'Slow (%)', { min: 0, max: 100 }),
          f.multi('cleansedBy', 'Cleansed by', ITEMS),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'damageType', 'tickDamage', 'tickInterval', 'duration', 'maxStacks', 'slow']), v.cards()],
      ),
      s.form('damageModel', 'Damage and defense model', [
        f.formula('damageFormula', 'Damage per hit', {
          help: `Variables: attack, armor, resist (%), crit (1 or the crit multiplier). Empty uses ${DEFAULT_DAMAGE_FORMULA}.`,
          placeholder: DEFAULT_DAMAGE_FORMULA,
        }),
        f.num('critChance', 'Crit chance (%)', { min: 0, max: 100 }),
        f.num('critMultiplier', 'Crit multiplier (×)', { min: 1, step: 0.1 }),
        f.ref('hpParam', 'Difficulty parameter for enemy HP', section('params', 'design.difficulty')),
        f.ref('damageParam', 'Difficulty parameter for enemy damage', section('params', 'design.difficulty')),
        f.bool('useNightStrength', 'Apply night monster strength (Time & Weather)'),
        f.long('notes', 'Notes'),
      ], 'This formula is applied to every enemy, boss and loadout in the views below.'),
      s.formulas('damage', 'Other formulas', 'Scaling and other formulas that are not the damage formula itself.'),
      s.collection(
        'enemies',
        'Enemies',
        'enemy',
        [
          f.ref('biome', 'Biome', BIOMES, { group: 'Identity' }),
          f.enm('role', 'Role', ['Swarm', 'Brute', 'Ranged', 'Caster', 'Elite', 'Support'], { group: 'Identity' }),
          f.num('tier', 'Tier', { min: 1, group: 'Identity' }),
          f.num('hp', 'HP', { min: 0, group: 'Stats' }),
          f.num('damage', 'Damage per hit', { min: 0, group: 'Stats' }),
          f.num('attackRate', 'Attacks per second', { min: 0, step: 0.05, group: 'Stats' }),
          f.num('speed', 'Speed', { min: 0, group: 'Stats' }),
          f.num('armor', 'Armor', { min: 0, group: 'Stats' }),
          f.ref('damageType', 'Deals damage type', catalog('damageTypes'), { group: 'Stats' }),
          f.map('resistances', 'Resistances (%)', catalog('damageTypes'), 100, { min: -100, group: 'Stats', help: 'Negative values are weaknesses (take extra damage).' }),
          f.multi('weaknesses', 'Weaknesses', catalog('damageTypes'), { group: 'Stats' }),
          f.enm('aggression', 'Aggression', ['Passive', 'Territorial', 'Hunter'], { group: 'Behavior' }),
          f.text('pattern', 'Attack pattern', { group: 'Behavior', placeholder: 'e.g. Charges, then three quick swipes' }),
          f.long('behavior', 'Behavior notes (AI)', { group: 'Behavior' }),
          f.bool('nightVariant', 'Has night variant', { group: 'Behavior' }),
          f.num('xp', 'XP reward', { min: 0, group: 'Reward' }),
          f.long('legacyNotes', 'Earlier notes', { group: 'Reward', help: 'Free text carried over, e.g. old drop lists. Drops now come from Items › Loot tables.' }),
        ],
        [v.table(['name', 'biome', 'role', 'hp', 'damage', 'attackRate', 'armor']), v.threatCurve(), v.weaknessMatrix(), v.cards()],
      ),
      s.collection(
        'bosses',
        'Bosses',
        'boss',
        [
          f.ref('biome', 'Biome', BIOMES, { group: 'Identity' }),
          f.long('arena', 'Arena', { group: 'Identity' }),
          f.num('hp', 'HP', { min: 0, group: 'Stats' }),
          f.num('damage', 'Damage per hit', { min: 0, group: 'Stats' }),
          f.num('attackRate', 'Attacks per second', { min: 0, step: 0.05, group: 'Stats' }),
          f.num('armor', 'Armor', { min: 0, group: 'Stats' }),
          f.ref('damageType', 'Deals damage type', catalog('damageTypes'), { group: 'Stats' }),
          f.map('resistances', 'Resistances (%)', catalog('damageTypes'), 100, { min: -100, group: 'Stats' }),
          f.multi('unlockRefs', 'Unlocks', { any: [BIOMES, section('skills', 'design.player'), ITEMS] }, { group: 'Progress' }),
          f.multi('rewardItems', 'Reward items', ITEMS, { group: 'Progress' }),
          f.num('xp', 'XP reward', { min: 0, group: 'Progress' }),
          f.long('unlockNotes', 'Unlock notes', { group: 'Progress' }),
          f.long('rewardNotes', 'Reward notes', { group: 'Progress' }),
          f.long('phaseNotes', 'Phase notes', { help: 'Free text; structured phases are in Boss phases.' }),
        ],
        [v.cards(), v.phaseBars(), v.table(['name', 'biome', 'hp', 'damage', 'attackRate', 'armor'])],
      ),
      s.collection(
        'phases',
        'Boss phases',
        'phase',
        [
          f.ref('boss', 'Boss', section('bosses')),
          f.num('hpFrom', 'From HP (%)', { min: 0, max: 100 }),
          f.num('hpTo', 'To HP (%)', { min: 0, max: 100 }),
          f.long('mechanics', 'Mechanics'),
          f.list('attacks', 'Attacks'),
          f.multi('adds', 'Adds (summoned enemies)', section('enemies')),
          f.num('damageMult', 'Damage ×', { min: 0, step: 0.05 }),
          f.long('transition', 'Transition'),
        ],
        [v.phaseBars(), v.table(['name', 'boss', 'hpFrom', 'hpTo', 'damageMult'])],
        { description: 'Each phase covers a slice of the boss’s HP, from 100% down to 0%.' },
      ),
      s.graph('bossPhases', 'Boss phase sketch (free diagram)', ['Phase', 'Attack', 'Transition'], {
        edgeKinds: ['when HP <', 'after', 'on event'],
        description: 'Optional free sketch. Boss phases above are the structured data the checks use.',
      }),
      s.collection(
        'variants',
        'Night and event variants',
        'variant',
        [
          f.ref('base', 'Base enemy', section('enemies')),
          f.multi('when', 'Appears during', { any: [section('dayPhases', 'design.timeWeather'), section('events', 'design.timeWeather')] }),
          f.num('hpMult', 'HP ×', { min: 0, step: 0.05 }),
          f.num('damageMult', 'Damage ×', { min: 0, step: 0.05 }),
          f.long('behavior', 'Extra behavior'),
        ],
        [v.table(['name', 'base', 'when', 'hpMult', 'damageMult']), v.cards()],
        { description: 'Stronger or changed enemies at night, on Full moon, Blood moon and similar events.' },
      ),
      s.collection(
        'loadouts',
        'Test loadouts',
        'loadout',
        [
          f.ref('cast', 'Cast', section('casts', 'design.player')),
          f.num('level', 'Level', { min: 1 }),
          f.ref('weapon', 'Weapon', ITEMS, { help: 'Uses the item’s damage, damage type and attacks per second.' }),
          f.multi('abilities', 'Abilities', section('abilities', 'design.player'), { help: 'Their damage comes from a numeric effect formula (variable level).' }),
          f.multi('armorItems', 'Armor and accessories', ITEMS),
          f.num('hp', 'HP', { min: 0, help: 'Empty uses the Player’s Health max.' }),
        ],
        [v.combatSandbox(), v.table(['name', 'cast', 'level', 'weapon', 'hp'])],
        { description: 'Player setups to test fights against. They are design probes, not game data.' },
      ),
      s.form('siege', 'NPC combat and sieges', [
        f.multi('defenders', 'Defenders', { any: [section('archetypes', 'design.npc'), section('enemies')] }),
        f.num('waves', 'Waves per siege', { min: 0 }),
        f.num('waveSize', 'Enemies per wave', { min: 0 }),
        f.long('mercenaries', 'Mercenary armies'),
        f.long('notes', 'Notes'),
      ]),
    ]),
    version: 2,
    migrate: migrateCombat,
  },
  {
    ...mod('design', 'timeWeather', 'Time, Weather & Events', 'docs/01_design/time_weather_events.md', '🌙', 'Day cycle, seasons, weather, special events and how they combine.', [
      s.form('time', 'Time system', [
        f.num('dayLength', 'Day length (real minutes)', { min: 0, help: 'Real minutes for one full in-game day; the day clock converts phases to real time with it.' }),
        f.num('daysPerYear', 'Days per year', { min: 1 }),
        f.num('moonCycle', 'Moon cycle (days)', { min: 1, help: 'Moon-cycle events repeat this often.' }),
        f.ref('startSeason', 'Starting season', section('seasons')),
        f.long('calendar', 'Calendar notes'),
      ], 'Set the clock first: day length, year length and the moon cycle drive the day clock and the year strip.'),
      s.collection(
        'seasons',
        'Seasons',
        'season',
        [
          f.num('order', 'Order', { min: 1 }),
          f.num('days', 'Days', { min: 1 }),
          f.color('color', 'Color'),
          f.map('modifiers', 'World modifiers (×)', catalog('worldModifiers'), undefined, { help: 'Multipliers while this season lasts. Add modifiers in Definitions › World modifiers.' }),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'order', 'days']), v.yearStrip()],
      ),
      s.collection(
        'dayPhases',
        'Day and night',
        'phase',
        [
          f.num('start', 'Start (hour)', { min: 0, max: 24, step: 0.5 }),
          f.num('duration', 'Duration (hours)', { min: 0, max: 24, step: 0.5 }),
          f.ref('timeOfDay', 'Time of day', catalog('timeOfDay'), { help: 'Links this phase to NPC routines and music, which use the “Times of day” catalog.' }),
          f.num('visibility', 'Visibility (%)', { min: 0, max: 100 }),
          f.num('monsterStrength', 'Monster strength (×)', { min: 0, step: 0.05 }),
          f.map('modifiers', 'World modifiers (×)', catalog('worldModifiers')),
          f.color('color', 'Color'),
          f.long('notes', 'Effects on survival / NPC routines'),
        ],
        [v.dayClock(), v.table(['name', 'start', 'duration', 'timeOfDay', 'visibility', 'monsterStrength'])],
      ),
      s.collection(
        'weather',
        'Weather',
        'weather',
        [
          f.multi('biomes', 'Biomes', BIOMES),
          f.num('frequency', 'Frequency (%)', { min: 0, max: 100, help: 'Share of time this weather holds in its biomes; the rest is clear.' }),
          f.multi('seasons', 'Seasons', section('seasons'), { help: 'Empty means all year.' }),
          f.num('duration', 'Typical duration (in-game hours)', { min: 0 }),
          f.num('visibility', 'Visibility (%)', { min: 0, max: 100 }),
          f.num('monsterStrength', 'Monster strength (×)', { min: 0, step: 0.05 }),
          f.map('modifiers', 'World modifiers (×)', catalog('worldModifiers')),
          f.long('effects', 'Other effects'),
        ],
        [v.table(['name', 'biomes', 'frequency', 'seasons', 'visibility']), v.biomeWeather(), v.cards()],
      ),
      s.collection(
        'events',
        'Special events',
        'event',
        [
          f.enm('schedule', 'Schedule', SCHEDULES, { group: 'When' }),
          f.num('interval', 'Every … days / cycles', { min: 1, group: 'When', help: 'Every N days, or every Nth moon cycle.' }),
          f.num('offset', 'First on day', { min: 0, group: 'When' }),
          f.num('chance', 'Chance per day (%)', { min: 0, max: 100, step: 0.1, group: 'When' }),
          f.ref('season', 'Season', section('seasons'), { group: 'When' }),
          f.ref('storyTrigger', 'Story trigger', section('quests', 'design.story'), { group: 'When' }),
          f.long('trigger', 'Trigger notes', { group: 'When' }),
          f.num('duration', 'Duration (days)', { min: 0, step: 0.5, group: 'When' }),
          f.num('monsterStrength', 'Monster strength (×)', { min: 0, step: 0.05, group: 'Effect' }),
          f.num('visibility', 'Visibility (%)', { min: 0, max: 100, group: 'Effect' }),
          f.map('modifiers', 'World modifiers (×)', catalog('worldModifiers'), undefined, { group: 'Effect' }),
          f.long('rules', 'Rule changes', { group: 'Effect' }),
          f.num('priority', 'Priority', { min: 0, group: 'Combining', help: 'Higher wins when events conflict.' }),
          f.bool('stacks', 'Stacks with other events', { group: 'Combining' }),
          f.multi('rewardItems', 'Reward items', ITEMS, { group: 'Rewards' }),
          f.long('rewards', 'Rewards / risks', { group: 'Rewards' }),
        ],
        [v.cards(), v.yearStrip(), v.conditions(), v.table(['name', 'schedule', 'interval', 'chance', 'duration', 'priority'])],
        { seed: [{ name: 'Full moon', schedule: 'Moon cycle', interval: 1, duration: 1 }, { name: 'Blood moon', schedule: 'Moon cycle', interval: 3, duration: 1, monsterStrength: 1.5 }, { name: 'Holiday', schedule: 'Every N days', interval: 120, offset: 60, duration: 2 }] },
      ),
      s.form('eventSystem', 'Event system', [
        f.long('priority', 'Priority rules', { placeholder: 'e.g. Story events beat moon events; the higher priority decides conflicting rules.' }),
        f.long('stacking', 'Stacking', { placeholder: 'e.g. Multipliers of stacking events multiply; non-stacking events wait.' }),
        f.long('combination', 'With weather and night'),
        f.long('technical', 'Technical notes', { help: 'How the event manager is built; see Technical documents.' }),
      ]),
    ]),
    version: 2,
    migrate: migrateTimeWeather,
  },
  {
    ...mod('design', 'trade', 'Trade & Economy', 'docs/01_design/trade_economy.md', '💰', 'Currencies, merchants, pricing and the money balance.', [
      s.form(
        'currency',
        'Currency',
        [
          f.long('currencies', 'Currency notes', { placeholder: 'e.g. Silver is the everyday coin; gold only in capitals; factions pay in scrip.' }),
          f.num('startingMoney', 'Starting money', { min: 0, help: 'What the player starts with, in the base unit. Money flow starts the wallet here.' }),
          f.num('walletCap', 'Wallet limit', { min: 0, help: 'Optional. The most money the player can carry.' }),
        ],
        'The base unit and the item value formula (base × rarity × quality) come from Items & Crafting › Item model. Prices here build on that value.',
      ),
      s.collection(
        'currencyTypes',
        'Currencies',
        'currency',
        [
          f.enm('kind', 'Kind', ['Coin', 'Barter good', 'Faction scrip', 'Token']),
          f.num('rate', 'Worth (base units)', { min: 0, step: 0.01, help: 'How many base units one of this is worth.' }),
          f.num('weight', 'Weight', { min: 0, step: 0.01 }),
          f.ref('faction', 'Faction', FACTIONS, { help: 'For faction scrip: who issues and accepts it.' }),
          f.ref('item', 'Item', ITEMS, { help: 'Optional: the item that represents this currency in the inventory.' }),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'kind', 'rate', 'weight', 'faction']), v.cards()],
      ),
      s.form(
        'wandering',
        'Wandering merchant',
        [
          f.num('interval', 'Visit roll every (days)', { min: 0, help: 'How often the game rolls for a visit. Merchants can override it.' }),
          f.num('chance', 'Chance per roll (%)', { min: 0, max: 100 }),
          f.num('stayDays', 'Stays for (days)', { min: 0 }),
          f.multi('biomes', 'Appears in biomes', BIOMES),
          f.num('stockSize', 'Stock size (item slots)', { min: 0 }),
          f.map('rarityMix', 'Rarity mix (weight)', catalog('rarities'), undefined, { help: 'Relative weights of rarities in the stock.' }),
          f.bool('restockOnVisit', 'New stock on every visit'),
          f.long('notes', 'Appearance rules', { placeholder: 'e.g. Only on clear days, never during a Blood moon.' }),
        ],
        'Default rules for every Wandering merchant. Wandering calendar (Merchants) shows how often the player meets one.',
      ),
      s.form('market', 'Town market', [
        f.num('restockDays', 'Restock every (days)', { min: 0 }),
        f.ref('building', 'Market building', section('buildings', 'design.town'), { help: 'The Town building that hosts the market.' }),
        f.long('stockByAct', 'Stock by progression', { placeholder: 'e.g. Act 1: tools and food; Act 2: iron gear; Act 3: rare materials.' }),
        f.long('reputationEffect', 'Effect of faction relations', { placeholder: 'e.g. Hostile factions’ goods disappear; allies add exclusive stock.' }),
      ]),
      s.form('capital', 'Faction capital trade', [
        f.ref('minLevel', 'Default required relationship', section('thresholds', 'design.factions'), { help: 'From Factions › Relationship levels. Merchants can override it.' }),
        f.long('exclusiveRule', 'High-tier and unique goods', { placeholder: 'e.g. Each capital sells one Legendary item no one else has.' }),
      ]),
      s.collection(
        'merchants',
        'Merchants',
        'merchant',
        [
          f.enm('type', 'Type', ['Wandering', 'Town market', 'Faction capital'], { group: 'Identity' }),
          f.ref('faction', 'Faction', FACTIONS, { group: 'Identity' }),
          f.multi('goods', 'Sells', ITEMS, { group: 'Stock' }),
          f.multi('buys', 'Buys item types', catalog('itemTypes'), { group: 'Stock', help: 'It also buys everything it sells.' }),
          f.ref('rarityCap', 'Highest rarity', catalog('rarities'), { group: 'Stock' }),
          f.num('stockSize', 'Stock size (item slots)', { min: 0, group: 'Stock' }),
          f.num('gold', 'Money for buying', { min: 0, group: 'Stock', help: 'How much the merchant can pay out before it runs dry (a money limit).' }),
          f.long('stock', 'Stock notes', { group: 'Stock' }),
          f.num('markup', 'Markup (× when selling to the player)', { min: 0, step: 0.05, group: 'Pricing', help: 'Empty counts as ×1.' }),
          f.num('buyback', 'Buyback (× when buying from the player)', { min: 0, step: 0.05, group: 'Pricing', help: 'Empty counts as ×1.' }),
          f.long('appearance', 'Appearance rule', { group: 'Wandering' }),
          f.num('chance', 'Chance per roll (%)', { min: 0, max: 100, group: 'Wandering', help: 'Empty uses the Wandering merchant rules.' }),
          f.num('interval', 'Roll every (days)', { min: 0, group: 'Wandering' }),
          f.num('stayDays', 'Stays for (days)', { min: 0, group: 'Wandering' }),
          f.ref('building', 'Building', section('buildings', 'design.town'), { group: 'Market' }),
          f.ref('unlockAct', 'Opens in act', section('acts', 'design.story'), { group: 'Market' }),
          f.num('restockDays', 'Restock every (days)', { min: 0, group: 'Market' }),
          f.ref('minLevel', 'Required relationship', section('thresholds', 'design.factions'), { group: 'Capital' }),
          f.multi('exclusive', 'Exclusive goods', ITEMS, { group: 'Capital', help: 'Items only this merchant should sell.' }),
        ],
        [v.cards(), v.kanban('type'), v.table(['name', 'type', 'faction', 'goods', 'markup', 'buyback']), v.merchantStock(), v.wanderingCalendar()],
        {
          description: 'Every merchant, of all three kinds. Each kind shows its own field group.',
          groupFilter: { field: 'type', static: { Wandering: ['wandering'], 'Town market': ['market'], 'Faction capital': ['capital'] }, groups: { Wandering: 'wandering', Market: 'market', Capital: 'capital' } },
        },
      ),
      s.formulas(
        'pricing',
        'Price formulas',
        'Optional. Name a formula “buy price” or “sell price” to replace the built-in chain on that side. Variables: value (base × rarity × quality), base, mult, margin, markup, rep, difficulty, rule.',
      ),
      s.form(
        'margins',
        'Margins',
        [
          f.num('buyMultiplier', 'Player buy price (×)', { min: 0, step: 0.05, help: 'What the player pays, × item value. Empty uses Town › Economy model, then ×1.' }),
          f.num('sellMultiplier', 'Player sell price (×)', { min: 0, step: 0.05, help: 'What the player gets, × item value. Keep it below the buy price.' }),
          f.map('byReputation', 'Buy price by relationship (×)', section('thresholds', 'design.factions'), undefined, { help: 'Per Factions relationship level. Selling divides by the same factor.' }),
          f.ref('difficultyParam', 'Difficulty parameter', section('params', 'design.difficulty'), { help: 'Its value per difficulty multiplies buy prices and divides sell prices. Empty finds “Economy price multiplier” by name.' }),
        ],
        'Trade owns the price margins; Town’s buy and sell multipliers are only a fallback.',
      ),
      s.collection(
        'priceRules',
        'Price rules',
        'rule',
        [
          f.num('factor', 'Factor (×)', { step: 0.01 }),
          f.enm('side', 'Side', ['Buy', 'Sell', 'Both']),
          f.bool('paused', 'Paused', { help: 'Paused rules are kept but not applied.' }),
          f.enm('scope', 'Applies to', ['Global', 'Merchant type', 'Merchant', 'Faction', 'Reputation level', 'Item type', 'Rarity'], { help: 'A rule without a scope is not applied.' }),
          f.enm('merchantType', 'Merchant type', ['Wandering', 'Town market', 'Faction capital'], { group: 'Merchant type' }),
          f.ref('merchant', 'Merchant', section('merchants'), { group: 'Merchant' }),
          f.ref('faction', 'Faction', FACTIONS, { group: 'Faction' }),
          f.ref('level', 'Relationship level', section('thresholds', 'design.factions'), { group: 'Relationship level' }),
          f.ref('itemType', 'Item type', catalog('itemTypes'), { group: 'Item type' }),
          f.ref('rarity', 'Rarity', catalog('rarities'), { group: 'Rarity' }),
          f.long('description', 'When applied'),
        ],
        [v.table(['name', 'factor', 'side', 'scope', 'paused']), v.priceLadder()],
        {
          description: 'Extra × factors on top of the margins, e.g. a festival discount or a scarcity premium.',
          // Only the target field of the chosen scope applies; the others fold away.
          groupFilter: {
            field: 'scope',
            static: { Global: [], 'Merchant type': ['merchantType'], Merchant: ['merchant'], Faction: ['faction'], 'Reputation level': ['level'], 'Item type': ['itemType'], Rarity: ['rarity'] },
            groups: { 'Merchant type': 'merchantType', Merchant: 'merchant', Faction: 'faction', 'Relationship level': 'level', 'Item type': 'itemType', Rarity: 'rarity' },
          },
        },
      ),
      s.form('balance', 'Economic balance', [
        f.long('sinks', 'Money sinks and sources'),
        f.long('inflation', 'Inflation control'),
        f.num('horizonDays', 'Estimate horizon (days)', { min: 1, help: 'Used by Money flow when there are no Story acts. Default 30.' }),
        f.num('actDays', 'Days per act length unit', { min: 0, help: 'Story act lengths × this = days. Default 1.' }),
        f.num('keepTolerance', 'Acceptable kept income (%)', { min: 0, max: 100, help: 'If the player keeps more of their income than this in the last act, money piles up. Default 50.' }),
        f.num('dailySellCap', 'Daily sell limit', { min: 0, help: 'Optional. Most money a player can make by selling per day.' }),
      ]),
      s.collection(
        'flows',
        'Money flows',
        'flow',
        [
          f.enm('direction', 'Direction', ['Source', 'Sink']),
          f.enm('kind', 'Kind', ['Selling loot', 'Quest reward', 'Wages / tax', 'Buying', 'Repair', 'Building cost', 'Upkeep', 'Fee', 'Other']),
          f.num('amount', 'Amount', { min: 0 }),
          f.enm('per', 'Per', ['Day', 'Event']),
          f.num('perDay', 'Events per day', { min: 0, step: 0.05, help: 'For per-event flows: how many happen a day on average.' }),
          f.ref('fromAct', 'From act', section('acts', 'design.story')),
          f.ref('toAct', 'Until act', section('acts', 'design.story')),
          f.multi('links', 'Comes from / goes to', {
            any: [section('quests', 'design.story'), section('merchants'), section('buildings', 'design.town'), section('loot', 'design.items')],
          }),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'direction', 'kind', 'amount', 'per', 'perDay']), v.moneyFlow(), v.cards()],
        { description: 'Where money comes from and where it goes, as average amounts. A planning estimate, not a simulation.' },
      ),
    ]),
    version: 2,
    migrate: migrateTrade,
  },
  {
    ...mod('design', 'story', 'Story & Quests', 'docs/01_design/story_quests.md', '📜', 'Acts, characters, quests, choices, endings and dialogue style.', [
      s.form('overview', 'Story overview', [
        f.text('premise', 'Premise', { placeholder: 'One sentence: who, where, what is at stake.' }),
        f.long('background', 'Background'),
        f.long('conflict', 'Main conflict'),
        f.long('secret', 'Secret of the island'),
        f.list('themes', 'Themes'),
      ]),
      s.form(
        'structure',
        'Structure',
        [
          f.enm('actUnit', 'Act length unit', ACT_UNITS, { help: 'What act start and length count. Empty means in-game days (Trade’s Money flow reads it the same way).' }),
          f.num('hoursPerDay', 'Play hours per in-game day', { min: 0, step: 0.05, help: 'Converts days to play time for Act pacing.' }),
          f.long('pacingNotes', 'Pacing notes', { placeholder: 'e.g. Act 1 is a tutorial week; Act 3 opens the whole island.' }),
        ],
        'How long acts are. Act pacing compares quest play time and the player level reached with each act.',
      ),
      s.collection(
        'acts',
        'Acts',
        'act',
        [
          f.num('start', 'Start', { min: 0, help: 'In the act length unit (Structure).' }),
          f.num('duration', 'Length', { min: 0 }),
          f.ref('biome', 'Main biome', BIOMES),
          f.multi('extraBiomes', 'Other biomes', BIOMES),
          f.long('goal', 'Player goal'),
          f.multi('keyEvents', 'Key events', { any: [section('quests'), section('bosses', 'design.combat'), section('events', 'design.timeWeather')] }),
          f.num('levelMin', 'Player level from', { min: 1, help: 'Intended player level range in this act; Act pacing checks it against the XP curve.' }),
          f.num('levelMax', 'Player level to', { min: 1 }),
          f.long('summary', 'Summary'),
        ],
        [v.timeline('start', 'duration', 'day'), v.actPacing(), v.cards()],
      ),
      s.collection(
        'characters',
        'Characters',
        'character',
        [
          f.ref('faction', 'Faction', FACTIONS, { group: 'Identity' }),
          f.text('role', 'Role', { group: 'Identity', placeholder: 'e.g. Mentor, rival, quest giver' }),
          f.enm('importance', 'Importance', ['Main', 'Supporting', 'Minor'], { group: 'Identity' }),
          f.ref('archetype', 'NPC archetype', section('archetypes', 'design.npc'), { group: 'Identity', help: 'Stats and needs come from this NPC System archetype.' }),
          f.long('bio', 'Biography', { group: 'Story' }),
          f.ref('introducedIn', 'Introduced in act', section('acts'), { group: 'Story' }),
          f.ref('location', 'Usually found in', BIOMES, { group: 'Story' }),
          f.bool('essential', 'Essential (cannot die)', { group: 'Story' }),
          f.long('fate', 'Fate / arc', { group: 'Story' }),
          f.map('relations', 'Relations (affinity)', section('characters'), 100, { min: -100, group: 'Relations', help: 'How this character feels about others, −100 … 100.' }),
          f.long('voice', 'Voice', { group: 'Voice', placeholder: 'e.g. Clipped sentences, sailor slang, never says “please”.' }),
          f.text('sampleLine', 'Sample line', { group: 'Voice' }),
        ],
        [v.cards(), v.table(['name', 'faction', 'role', 'importance', 'introducedIn']), v.castCoverage()],
      ),
      s.collection(
        'questTypes',
        'Quest types',
        'quest type',
        [
          f.enm('type', 'Type', QUEST_TYPES),
          f.long('purpose', 'Purpose'),
          f.bool('repeatable', 'Repeatable'),
          f.num('maxActive', 'Most active at once', { min: 0 }),
          f.num('rewardScale', 'Reward scale (×)', { min: 0, step: 0.05, help: 'How generous this type is compared with a main quest (×1).' }),
          f.long('generator', 'How they are made', { placeholder: 'e.g. Tavern board picks a template, a target from the current biome and a reward from the act budget.' }),
        ],
        [v.table(['name', 'type', 'repeatable', 'maxActive', 'rewardScale']), v.cards()],
        { seed: QUEST_TYPE_SEED },
      ),
      s.collection(
        'quests',
        'Quests',
        'quest',
        [
          f.enm('type', 'Type', QUEST_TYPES, { group: 'Identity' }),
          f.ref('giver', 'Giver', section('characters'), { group: 'Identity' }),
          f.ref('faction', 'Faction', FACTIONS, { group: 'Identity' }),
          f.ref('act', 'Act', section('acts'), { group: 'Identity' }),
          f.num('estMinutes', 'Estimated play time (min)', { min: 0, group: 'Identity' }),
          f.bool('missable', 'Missable', { group: 'Identity' }),
          f.multi('requires', 'Requires quests', section('quests'), { group: 'Requirements' }),
          f.num('minLevel', 'Minimum player level', { min: 1, group: 'Requirements' }),
          f.ref('repFaction', 'Reputation with', FACTIONS, { group: 'Requirements' }),
          f.ref('repLevel', 'At least', section('thresholds', 'design.factions'), { group: 'Requirements' }),
          f.long('conditions', 'Condition notes', { group: 'Requirements' }),
          f.check('objectives', 'Objectives', { group: 'Objectives' }),
          f.multi('locations', 'Where', BIOMES, { group: 'Objectives' }),
          f.multi('targets', 'Targets', { any: [section('enemies', 'design.combat'), section('bosses', 'design.combat'), section('items', 'design.items')] }, { group: 'Objectives' }),
          f.num('rewardXp', 'XP', { min: 0, group: 'Rewards' }),
          f.num('rewardMoney', 'Money', { min: 0, group: 'Rewards' }),
          f.map('rewardItems', 'Items', section('items', 'design.items'), undefined, { group: 'Rewards' }),
          f.map('rewardRep', 'Reputation change', FACTIONS, 100, { min: -100, group: 'Rewards' }),
          f.multi('unlocks', 'Unlocks', { any: [section('skills', 'design.player'), section('recipes', 'design.items')] }, { group: 'Rewards' }),
          f.long('rewards', 'Reward notes', { group: 'Rewards' }),
          f.multi('blocks', 'Closes quests', section('quests'), { group: 'Consequences', help: 'Quests that can no longer be done after this one.' }),
          f.long('consequences', 'Consequences', { group: 'Consequences' }),
        ],
        [v.cards(), v.kanban('type'), v.table(['name', 'type', 'giver', 'act', 'rewardXp', 'rewardMoney']), v.questFlow(), v.rewardBudget()],
        { description: 'The quest sheet of doc chapter 5. Requirements and rewards are links and numbers so the editor can order quests and add up rewards.' },
      ),
      s.collection(
        'choices',
        'Choices',
        'option',
        [
          f.text('decision', 'Decision', { required: true, help: 'Options with the same decision name exclude each other.', placeholder: 'e.g. Fate of the lighthouse' }),
          f.ref('quest', 'Made in quest', section('quests')),
          f.multi('leadsTo', 'Opens quests', section('quests')),
          f.multi('blocks', 'Closes quests', section('quests')),
          f.map('repEffects', 'Reputation change', FACTIONS, 100, { min: -100 }),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'decision', 'quest', 'leadsTo', 'blocks']), v.kanban('decision'), v.cards()],
        { description: 'One entry per option. The player picks one option of each decision.' },
      ),
      s.collection(
        'endings',
        'Endings',
        'ending',
        [
          f.enm('kind', 'Kind', ['Main', 'Faction', 'Secret', 'Bad']),
          f.multi('requiresQuests', 'Requires quests', section('quests')),
          f.multi('requiresChoices', 'Requires options', section('choices')),
          f.ref('repFaction', 'Reputation with', FACTIONS),
          f.ref('repLevel', 'At least', section('thresholds', 'design.factions')),
          f.multi('factionEndings', 'Faction outcomes', section('endings', 'design.factions'), { help: 'Matching entries in Factions › Endings.' }),
          f.long('description', 'Description'),
        ],
        [v.endingPaths(), v.cards(), v.table(['name', 'kind', 'requiresQuests', 'requiresChoices'])],
      ),
      s.graph('questGraph', 'Dialog and branching sketch', ['Quest', 'Dialog', 'Choice', 'Event', 'Ending'], {
        nodeSource: { any: [section('quests'), section('choices'), section('endings')] },
        edgeKinds: ['then', 'if choice', 'on failure', 'unlocks'],
        description: 'A free sketch. Quest order comes from the quests’ requirements (see Quest flow); hints flag sketch edges the data does not have.',
      }),
      s.form('dialogue', 'Dialogue and narrative style', [
        f.long('tone', 'Narrative style'),
        f.enm('format', 'Dialogue format', ['Linear', 'Branching tree', 'Hub', 'Barks only']),
        f.num('lineLimit', 'Line length limit (characters)', { min: 0, help: 'Keeps lines readable in the UI and leaves room for longer translations.' }),
        f.long('voiceRules', 'Voice rules', { placeholder: 'e.g. Islanders speak in short sentences; outsiders are formal.' }),
        f.long('localization', 'Localization', { placeholder: 'e.g. English and Hungarian; no puns that cannot be translated.' }),
        f.long('vo', 'Voice-over'),
      ]),
    ]),
    version: 2,
    migrate: migrateStory,
  },
  {
    ...mod('design', 'ui', 'UI / UX', 'docs/01_design/ui_ux.md', '🖥️', 'Principles, screen flow, HUD, wireframes per screen, controls and accessibility.', [
      s.form('principles', 'UX principles', [
        f.long('principles', 'Principles', { placeholder: 'e.g. Readable at a glance; the HUD never hides the world; every window closes with the same key.' }),
        f.list('pillars', 'UX pillars'),
      ]),
      s.form(
        'layoutRules',
        'Layout rules',
        [
          f.enm('resolution', 'Target resolution', Object.keys(RESOLUTIONS), { help: 'Wireframes are drawn at this size. Default 1920×1080.' }),
          f.num('safeArea', 'Safe area inset (%)', { min: 0, max: 20, help: 'Keep HUD and controls this far from the edges. Default 5.' }),
          f.num('grid', 'Grid (px)', { min: 0, help: 'Snap step in the wireframe editor. Default 8; 0 turns grid snapping off.' }),
          f.num('minTextPx', 'Minimum text size (px)', { min: 1, help: 'At the target resolution. Default 18.' }),
          f.num('minTargetPx', 'Minimum click target (px)', { min: 1, help: 'Default 32 for mouse; use 48 for gamepad or touch.' }),
          f.enm('density', 'Information density', ['Sparse', 'Balanced', 'Dense']),
        ],
        'The wireframe editor and its checks read these.',
      ),
      s.graph('flow', 'Screen flow', ['Screen', 'Popup', 'Overlay'], {
        nodeSource: section('screens'),
        edgeKinds: ['opens', 'closes', 'navigates'],
        description: 'The intended navigation. Screen map checks it against the buttons in the wireframes; “Add arrows from wireframes” fills in what is missing.',
      }),
      s.form('hud', 'HUD', [
        f.ref('hudScreen', 'HUD screen', section('screens'), { help: 'Empty uses the first screen of kind HUD.' }),
        f.long('placement', 'Placement', { placeholder: 'e.g. Survival bars bottom-left, minimap top-right, hotbar bottom-centre.' }),
        f.long('feedback', 'Feedback', { placeholder: 'e.g. Bars pulse below 20 %; damage flashes the screen edge.' }),
        f.bool('minimal', 'Minimal / diegetic HUD'),
        f.long('autoHide', 'Auto-hide rules'),
      ]),
      s.collection(
        'screens',
        'Screens',
        'screen',
        [
          f.enm('kind', 'Kind', SCREEN_KINDS, { group: 'Identity' }),
          f.enm('system', 'Serves', UI_SYSTEMS, { group: 'Identity' }),
          f.bool('entry', 'Entry screen (where play starts)', { group: 'Identity' }),
          f.enm('priority', 'Priority', ['MVP', 'Later'], { group: 'Identity' }),
          f.long('purpose', 'Purpose', { group: 'Template' }),
          f.list('interactions', 'Interactions', { group: 'Template' }),
          f.list('states', 'States', { group: 'Template', help: 'e.g. default, empty, full. The wireframe editor can show elements per state.' }),
          f.list('elements', 'Element notes', { group: 'Template' }),
          f.num('width', 'Width (px)', { min: 0, group: 'Size', help: 'Windows and popups. Empty = the full target resolution.' }),
          f.num('height', 'Height (px)', { min: 0, group: 'Size' }),
        ],
        [v.wireframe(), v.screenMap(), v.screenReadiness(), v.cards(), v.table(['name', 'kind', 'system', 'priority', 'purpose'])],
        {
          description: 'One wireframe per screen. The template of doc chapter 4: purpose, elements, interactions, states and the wireframe.',
          seed: [['HUD', 'HUD'], ['Inventory', 'Window'], ['Crafting', 'Window'], ['Character / skill tree', 'Window'], ['Map', 'Fullscreen menu'], ['Town overview', 'Window'], ['NPC sheet', 'Window'], ['Trade', 'Window'], ['Diplomacy', 'Window'], ['Quest log', 'Window'], ['Settings', 'Window']].map(([name, kind]) => ({ name, kind, ...(kind === 'HUD' ? { entry: true } : {}) })),
        },
      ),
      s.form('input', 'Input', [
        f.long('notes', 'Input and controls'),
        f.list('devices', 'Devices', { placeholder: 'Keyboard & mouse, Gamepad' }),
        f.bool('rebinding', 'All actions can be rebound'),
        f.bool('holdToggle', 'Hold actions can be set to toggle'),
      ]),
      s.collection(
        'controls',
        'Controls',
        'action',
        [
          f.enm('category', 'Category', ['Movement', 'Combat', 'Building', 'Menus', 'Camera', 'System']),
          f.multi('contexts', 'Where', section('screens'), { help: 'Screens where it applies. Empty = during gameplay.' }),
          f.text('key', 'Keyboard'),
          f.text('mouse', 'Mouse'),
          f.text('gamepad', 'Gamepad'),
          f.enm('mode', 'Mode', ['Press', 'Hold', 'Double']),
          f.bool('rebindable', 'Rebindable'),
          f.long('notes', 'Notes'),
        ],
        [v.table(['name', 'category', 'key', 'mouse', 'gamepad', 'contexts']), v.bindingMap()],
      ),
      s.form('accessibility', 'Accessibility and localization', [
        f.long('notes', 'Accessibility and localization'),
        f.num('textScaleMin', 'Text scale from (%)', { min: 50, max: 200 }),
        f.num('textScaleMax', 'Text scale to (%)', { min: 50, max: 300 }),
        f.list('colorblind', 'Colour-blind modes'),
        f.bool('subtitles', 'Subtitles'),
        f.bool('reduceMotion', 'Reduce motion option'),
        f.list('languages', 'Languages'),
        f.num('textExpansion', 'Text expansion of the longest language (%)', { min: 0, max: 100, help: 'Labels must fit this much longer text. Default 30.' }),
      ]),
      s.canvas('wireframe', 'Sketch board (free)', ['Frame', 'Panel', 'Button', 'Text', 'Icon', 'List', 'Image', 'Input'], 'A free board for loose ideas. Each screen has its own wireframe under Screens › Wireframe.'),
    ]),
    version: 2,
    migrate: migrateUi,
  },
  {
    ...mod('design', 'openQuestions', 'Open Questions', 'docs/01_design/open_questions.md', '❓', 'Design decisions to settle.', [
    s.collection(
      'questions',
      'Questions',
      'question',
      [
        f.enm('area', 'Area', QUESTION_AREAS),
        f.long('options', 'Options', { placeholder: 'A: … / B: …', help: 'The alternatives being weighed, with their main trade-off.' }),
        f.long('decision', 'Decision', { help: 'Fill in when the status is Decided: what was chosen and why.' }),
        f.enm('status', 'Status', QUESTION_STATUSES),
        f.ref('owner', 'Owner', section('members', 'production.team'), { help: 'A role from Team & Workflow who drives the decision.' }),
        f.date('due', 'Due'),
        f.list('affects', 'Updated in docs', { help: 'Docs or modules where the decision was written back, e.g. “NPC System”.' }),
        f.long('legacyNotes', 'Earlier notes', { help: 'Free text carried over from before Area, Owner and Due became fixed fields.' }),
      ],
      [v.kanban('status'), v.table(['name', 'area', 'status', 'owner', 'due'])],
      {
        seed: [
          { name: 'Where do NPCs get money to buy their needs?', area: 'Economy', status: 'Open' },
          { name: 'Who manages the treasury / tax and what can it be spent on?', area: 'Economy', status: 'Open' },
          { name: 'Do NPCs age and die? How is the population replenished?', area: 'NPC', status: 'Open' },
          { name: 'What exactly is the penalty when needs are unmet?', area: 'NPC', status: 'Open' },
          { name: 'Storage capacity limits to keep the economy bounded?', area: 'Logistics', status: 'Open' },
        ],
      },
    ),
    ]),
    version: 2,
    migrate: migrateOpenQuestions,
  },
]
