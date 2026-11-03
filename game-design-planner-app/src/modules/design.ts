import { EASIER, HARDER } from '../core/difficulty'
import type { GraphSource } from '../core/model/types'
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
          }),
          f.long('action', 'Player action', { help: 'What does the player actively do in this loop?', placeholder: 'e.g. Gather wood and stone from the surrounding area.' }),
          f.long('reward', 'Reward', { help: 'What does the player get, and why does it matter to them?', placeholder: 'e.g. Materials to craft a better axe.' }),
          f.long('nextDecision', 'Next decision or action', {
            help: 'What new choice does the reward open up? This is what makes the loop repeat.',
            placeholder: 'e.g. Craft the axe now, or save materials for a wall.',
          }),
          f.long('choiceShift', 'How choices change over time', { help: 'As this loop repeats, what changes about the options or trade-offs the player faces?' }),
          f.multi('leadsTo', 'Builds toward (longer loops)', section('loops'), {
            help: 'Which longer loops does repeating this one progress? Only link to a longer time scale.',
          }),
          f.multi('nodes', 'Diagram nodes', section('loopGraph'), { help: 'The actions, systems and rewards in the loop diagram that make up this loop.' }),
          f.long('description', 'Notes'),
        ],
        [v.cards(), v.progression('scale', 'leadsTo'), v.kanban('scale'), v.table()],
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
  mod('design', 'factions', 'Factions & Diplomacy', 'docs/01_design/factions_diplomacy.md', '🏛️', 'Four factions, relations and consequences.', [
    s.collection(
      'factions',
      'Factions',
      'faction',
      [
        f.color('color', 'Color'),
        f.long('history', 'History'),
        f.long('goals', 'Goals and ideology'),
        f.list('characters', 'Key characters'),
        f.text('capital', 'Capital'),
        f.long('capitalDescription', 'Capital: mood, services, trade, quests'),
        f.long('playstyle', 'Playstyle focus'),
        f.list('unlocks', 'Unlockable skills / items'),
      ],
      [v.cards(), v.table(['name', 'capital', 'goals'])],
    ),
    s.matrix('relations', 'Relationship matrix', section('factions'), section('factions'), { type: 'number', min: -100, max: 100 }, {
      diagonal: false,
      description: '-100 = hostile, 0 = neutral, 100 = allied.',
    }),
    s.graph('relationGraph', 'Relationship graph', ['Faction'], { nodeSource: section('factions'), edgeKinds: ['Ally', 'Enemy', 'Neutral', 'Trade'] }),
    s.collection(
      'actions',
      'Actions → reputation effects',
      'action',
      [
        f.ref('faction', 'Faction', section('factions')),
        f.num('effectOnFaction', 'Effect on this faction', { min: -100, max: 100 }),
        f.num('effectOnOthers', 'Effect on other factions', { min: -100, max: 100 }),
        f.long('description', 'Description'),
      ],
      [v.table(), v.cards()],
    ),
    s.collection(
      'thresholds',
      'Relationship levels and consequences',
      'level',
      [f.num('min', 'Min value', { min: -100, max: 100 }), f.long('consequences', 'Trade, attacks, quests, biome access')],
      [v.table()],
    ),
    s.collection(
      'endings',
      'Endings',
      'ending',
      [f.multi('factions', 'Involved factions', section('factions')), f.long('conditions', 'Conditions'), f.long('description', 'Description')],
      [v.cards(), v.table()],
    ),
  ]),
  mod('design', 'world', 'World & Biomes', 'docs/01_design/world_biomes.md', '🌍', 'Biomes, progression, outposts, map.', [
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
        f.long('entry', 'Entry requirement'),
        f.list('pois', 'Points of interest'),
      ],
      [v.cards(), v.kanban('role'), v.table(['name', 'role', 'resources'])],
    ),
    s.graph('progression', 'Progression graph', ['Biome', 'Boss', 'Story event', 'Faction gate'], {
      nodeSource: BIOMES,
      edgeKinds: ['unlocks via story', 'unlocks via faction', 'unlocks via boss'],
    }),
    s.canvas('map', 'Map sketch', ['Biome zone', 'Capital', 'Outpost', 'Landmark', 'Note']),
    s.collection(
      'outposts',
      'Outposts to capture',
      'outpost',
      [
        f.ref('biome', 'Biome', BIOMES),
        f.long('defenders', 'Defenders'),
        f.enm('method', 'Capture method', ['Military', 'Tactical', 'Diplomatic', 'Mixed']),
        f.long('reward', 'Reward / town founding requirements'),
      ],
      [v.table(), v.cards()],
    ),
    s.form('exploration', 'Exploration', [f.long('map', 'Map, fast travel, fog of war'), f.long('generation', 'Generation (hand-made / procedural)')]),
  ]),
  mod('design', 'town', 'Town Management & Logistics', 'docs/01_design/town_management.md', '🏘️', 'Buildings, resource flow, economy, morale.', [
    s.collection(
      'buildings',
      'Buildings',
      'building',
      [
        f.text('function', 'Function'),
        f.num('capacity', 'Capacity (NPCs)', { min: 0 }),
        f.num('tiers', 'Upgrade tiers', { min: 1 }),
        f.map('cost', 'Build cost', catalog('resources')),
        f.map('inputs', 'Inputs / tick', catalog('resources')),
        f.map('outputs', 'Outputs / tick', catalog('resources')),
        f.multi('workers', 'Worker professions', catalog('professions')),
        f.long('upgrades', 'Upgrade path'),
        f.long('unlockedBy', 'Unlocked by'),
      ],
      [v.cards(), v.table(['name', 'function', 'capacity', 'tiers'])],
      {
        seed: [
          { name: 'House', function: 'Housing for NPCs', capacity: 4 },
          { name: 'Miner', function: 'Collects and smelts ore' },
          { name: 'Lumberjack', function: 'Produces wood' },
          { name: 'Farmer', function: 'Produces food' },
          { name: 'Tavern', function: 'Entertainment, random quests' },
          { name: 'School', function: 'Trains young NPCs (needs a teacher)' },
        ],
      },
    ),
    s.graph('flow', 'Resource flow', ['Building', 'Resource', 'NPC role', 'Market', 'Player'], {
      nodeSource: section('buildings'),
      edgeKinds: ['produces', 'consumes', 'sells to', 'buys from', 'transports'],
    }),
    s.form('economy', 'Economy model', [
      f.long('moneyFlow', 'Money flow (wages, tax, treasury)'),
      f.num('buyMargin', 'Player buy price multiplier', { min: 0 }),
      f.num('sellMargin', 'Player sell price multiplier', { min: 0 }),
      f.long('indirectAccess', 'Indirect resource access'),
      f.num('storageLimit', 'Default storage limit', { min: 0 }),
      f.long('storageRules', 'Storage rules'),
    ]),
    s.collection('commands', 'Player commands', 'command', [f.long('description', 'Description'), f.long('ui', 'UI notes')], [v.cards(), v.table()]),
    s.collection(
      'routes',
      'Logistics routes',
      'route',
      [f.text('from', 'From base'), f.text('to', 'To base'), f.multi('cargo', 'Cargo', catalog('resources')), f.long('risks', 'Risks')],
      [v.table(), v.cards()],
    ),
    s.collection(
      'morale',
      'Morale thresholds',
      'threshold',
      [f.num('value', 'Morale value', { min: 0, max: 100 }), f.enm('effect', 'Effect', ['Bonus', 'None', 'Slowdown', 'Production stops', 'Leave town', 'Rebel']), f.long('notes', 'Notes')],
      [v.table()],
    ),
    s.form('extensibility', 'Extensibility', [f.long('plan', 'How new needs, stats and functions are added without touching core code')]),
  ]),
  mod('design', 'npc', 'NPC System', 'docs/01_design/npc_system.md', '🧑‍🤝‍🧑', 'Stats, needs, life cycle, events.', [
    s.collection(
      'archetypes',
      'NPC archetypes',
      'archetype',
      [
        f.ref('profession', 'Profession', catalog('professions')),
        f.map('stats', 'Stats', catalog('npcStats'), 10),
        f.map('needs', 'Needs (consumption / day)', catalog('needs')),
        f.long('notes', 'Notes'),
      ],
      [v.cards(), v.radar('stats'), v.table(['name', 'profession'])],
      { description: 'Stats and needs come from catalogs: add a new stat in Definitions and it appears here and in the radar.' },
    ),
    s.collection(
      'statRules',
      'Stat rules',
      'stat rule',
      [f.ref('stat', 'Stat', catalog('npcStats')), f.long('effect', 'Effect'), f.formula('formula', 'Formula'), f.long('growth', 'Growth')],
      [v.table(), v.cards()],
    ),
    s.collection(
      'needRules',
      'Need rules',
      'need rule',
      [
        f.ref('need', 'Need', catalog('needs')),
        f.long('scaling', 'Scales with'),
        f.enm('consequence', 'Consequence when unmet', ['Production stops', 'Morale loss', 'Leaves town', 'Rebels', 'Dies']),
        f.long('notes', 'Notes'),
      ],
      [v.table(), v.cards()],
    ),
    s.graph('lifecycle', 'Life cycle state machine', ['State', 'Event', 'End'], { edgeKinds: ['when', 'after time', 'on event'] }),
    s.collection(
      'lifeStages',
      'Life stages',
      'stage',
      [f.num('ageFrom', 'Age from', { min: 0 }), f.num('ageTo', 'Age to', { min: 0 }), f.long('notes', 'Notes')],
      [v.table(), v.timeline('ageFrom', 'ageTo', 'y')],
    ),
    s.collection(
      'events',
      'Random events',
      'event',
      [
        f.enm('category', 'Category', ['Marriage', 'Romance', 'Feud', 'Birth', 'Death', 'Other']),
        f.long('trigger', 'Trigger'),
        f.long('effect', 'Effect'),
        f.num('chance', 'Chance (%)', { min: 0, max: 100 }),
      ],
      [v.kanban('category'), v.table()],
    ),
    s.form('misc', 'Other', [
      f.long('equipment', 'Equipment slots'),
      f.long('mercenaries', 'Mercenary armies'),
      f.long('ai', 'Behavior / daily routine'),
      f.long('generation', 'Procedural generation'),
    ]),
  ]),
  mod('design', 'player', 'Player Character', 'docs/01_design/player_character.md', '🧍', 'Hero, survival, casts, skill trees, XP.', [
    s.form('hero', 'The hero', [f.long('background', 'Background'), f.long('personality', 'Personality'), f.long('start', 'Starting state'), f.long('death', 'Death and respawn')]),
    s.collection(
      'survival',
      'Survival stats',
      'stat',
      [
        f.ref('stat', 'Stat', catalog('survivalStats')),
        f.num('max', 'Max', { min: 0 }),
        f.num('decay', 'Decay / minute', { min: 0, step: 0.01 }),
        f.long('lowEffect', 'Effect at low value'),
        f.long('restore', 'Restored by'),
      ],
      [v.table(), v.cards()],
    ),
    s.collection(
      'casts',
      'Casts',
      'cast',
      [
        f.ref('cast', 'Cast', catalog('casts')),
        f.long('playstyle', 'Playstyle'),
        f.list('startAbilities', 'Starting abilities'),
        f.list('startGear', 'Starting gear'),
        f.ref('affinity', 'Faction affinity', FACTIONS),
      ],
      [v.cards(), v.table()],
    ),
    s.graph('skillTree', 'Skill tree', ['Skill', 'Passive', 'Active', 'Spell'], {
      nodeSource: catalog('casts'),
      edgeKinds: ['requires'],
      description: 'Node reference = the cast the node belongs to.',
    }),
    s.collection(
      'abilities',
      'Abilities and spells',
      'ability',
      [
        f.ref('cast', 'Cast', catalog('casts')),
        f.num('mana', 'Mana cost', { min: 0 }),
        f.num('cooldown', 'Cooldown (s)', { min: 0 }),
        f.formula('formula', 'Effect formula'),
        f.long('description', 'Description'),
      ],
      [v.table(), v.cards()],
    ),
    s.formulas('xp', 'XP curve and formulas', 'e.g. xp = base * level ^ exponent'),
    s.form('controls', 'Controls and camera', [f.long('input', 'Input schemes'), f.long('camera', 'Camera')]),
  ]),
  mod('design', 'items', 'Items & Crafting', 'docs/01_design/items_crafting.md', '🎒', 'Item database, rarity/quality, recipes, loot.', [
    s.collection(
      'items',
      'Items',
      'item',
      [
        f.ref('type', 'Type', catalog('itemTypes')),
        f.ref('rarity', 'Rarity', catalog('rarities')),
        f.ref('quality', 'Quality', catalog('qualities')),
        f.num('weight', 'Weight', { min: 0, step: 0.1 }),
        f.num('value', 'Base value', { min: 0 }),
        f.num('stack', 'Max stack', { min: 1 }),
        f.long('description', 'Description'),
        f.long('stats', 'Stats and effects'),
        f.long('sources', 'Sources (drop, craft, shop)'),
      ],
      [v.table(['name', 'type', 'rarity', 'quality', 'value']), v.cards(), v.kanban('rarity')],
    ),
    s.matrix('multipliers', 'Value multiplier: rarity × quality', catalog('rarities'), catalog('qualities'), { type: 'number', min: 0, max: 100 }),
    s.collection(
      'recipes',
      'Recipes',
      'recipe',
      [
        f.ref('result', 'Result', ITEMS),
        f.multi('ingredients', 'Ingredients', ITEMS),
        f.text('station', 'Crafting station'),
        f.num('tier', 'Tier', { min: 0 }),
        f.long('unlock', 'Unlock'),
      ],
      [v.table(), v.cards()],
    ),
    s.graph('recipeGraph', 'Crafting graph', ['Item', 'Resource', 'Station'], { nodeSource: ITEMS, edgeKinds: ['crafted into', 'requires station'] }),
    s.collection(
      'loot',
      'Loot tables',
      'loot table',
      [f.text('source', 'Source'), f.list('entries', 'Entries (item, chance)'), f.long('notes', 'Notes')],
      [v.table(), v.cards()],
    ),
    s.form('inventory', 'Inventory', [f.long('slots', 'Slots, weight, storage limits')]),
  ]),
  mod('design', 'combat', 'Combat, Enemies & Bosses', 'docs/01_design/combat_enemies.md', '⚔️', 'Combat model, enemy and boss sheets.', [
    s.form('system', 'Combat system', [f.long('model', 'Real-time / action, aiming, dodge, block'), f.long('status', 'Status effects')]),
    s.formulas('damage', 'Damage and defense model', 'e.g. damage = attack * (1 - resist)'),
    s.collection(
      'enemies',
      'Enemies',
      'enemy',
      [
        f.ref('biome', 'Biome', BIOMES),
        f.num('hp', 'HP', { min: 0 }),
        f.num('damage', 'Damage', { min: 0 }),
        f.num('speed', 'Speed', { min: 0 }),
        f.multi('weaknesses', 'Weaknesses', catalog('damageTypes')),
        f.bool('nightVariant', 'Has night variant'),
        f.long('behavior', 'Behavior (AI)'),
        f.list('drops', 'Drops'),
      ],
      [v.cards(), v.table(['name', 'biome', 'hp', 'damage', 'speed'])],
    ),
    s.collection(
      'bosses',
      'Bosses',
      'boss',
      [
        f.ref('biome', 'Biome', BIOMES),
        f.long('unlocks', 'Unlocks'),
        f.long('arena', 'Arena'),
        f.long('phases', 'Phases and mechanics'),
        f.long('reward', 'Reward'),
      ],
      [v.cards(), v.table()],
    ),
    s.graph('bossPhases', 'Boss phase diagram', ['Phase', 'Attack', 'Transition'], { edgeKinds: ['when HP <', 'after', 'on event'] }),
    s.form('siege', 'NPC combat and sieges', [f.long('notes', 'Defenders, siege, mercenary armies')]),
  ]),
  mod('design', 'timeWeather', 'Time, Weather & Events', 'docs/01_design/time_weather_events.md', '🌙', 'Day cycle, weather, special events.', [
    s.form('time', 'Time system', [f.num('dayLength', 'Day length (real minutes)', { min: 0 }), f.long('calendar', 'Seasons / calendar')]),
    s.collection(
      'dayPhases',
      'Day cycle',
      'phase',
      [
        f.num('start', 'Start (hour)', { min: 0, max: 24 }),
        f.num('duration', 'Duration (hours)', { min: 0, max: 24 }),
        f.num('visibility', 'Visibility (%)', { min: 0, max: 100 }),
        f.num('monsterStrength', 'Monster strength (×)', { min: 0 }),
        f.color('color', 'Color'),
        f.long('notes', 'Effects on survival / NPC routines'),
      ],
      [v.timeline('start', 'duration', 'h'), v.table()],
    ),
    s.collection(
      'weather',
      'Weather',
      'weather',
      [f.multi('biomes', 'Biomes', BIOMES), f.long('effects', 'Effects'), f.num('frequency', 'Frequency (%)', { min: 0, max: 100 })],
      [v.cards(), v.table()],
    ),
    s.collection(
      'events',
      'Special events',
      'event',
      [
        f.long('trigger', 'Trigger / schedule'),
        f.num('duration', 'Duration (days)', { min: 0 }),
        f.long('rules', 'Rule changes'),
        f.long('rewards', 'Rewards / risks'),
      ],
      [v.cards(), v.table()],
      { seed: [{ name: 'Full moon' }, { name: 'Blood moon' }, { name: 'Holiday' }] },
    ),
  ]),
  mod('design', 'trade', 'Trade & Economy', 'docs/01_design/trade_economy.md', '💰', 'Merchants, pricing, currencies.', [
    s.form('currency', 'Currency', [f.long('currencies', 'Currencies and base values')]),
    s.formulas('pricing', 'Price formulas', 'e.g. price = base * rarityMult * (1 + margin)'),
    s.collection(
      'merchants',
      'Merchants',
      'merchant',
      [
        f.enm('type', 'Type', ['Wandering', 'Town market', 'Faction capital']),
        f.ref('faction', 'Faction', FACTIONS),
        f.long('appearance', 'Appearance rule'),
        f.long('stock', 'Stock depends on'),
        f.multi('goods', 'Goods', ITEMS),
      ],
      [v.cards(), v.kanban('type'), v.table()],
    ),
    s.collection(
      'priceRules',
      'Price rules',
      'rule',
      [f.num('factor', 'Factor', { step: 0.01 }), f.long('description', 'When applied')],
      [v.table()],
    ),
    s.form('balance', 'Economic balance', [f.long('sinks', 'Money sinks and sources'), f.long('inflation', 'Inflation control')]),
  ]),
  mod('design', 'story', 'Story & Quests', 'docs/01_design/story_quests.md', '📜', 'Acts, characters, quest graph.', [
    s.form('overview', 'Overview', [f.long('background', 'Background'), f.long('conflict', 'Main conflict'), f.long('secret', 'Secret of the island'), f.long('tone', 'Narrative style')]),
    s.collection(
      'acts',
      'Acts',
      'act',
      [f.num('start', 'Start', { min: 0 }), f.num('duration', 'Length', { min: 0 }), f.ref('biome', 'Biome', BIOMES), f.long('summary', 'Summary')],
      [v.timeline('start', 'duration', 'step'), v.cards()],
    ),
    s.collection(
      'characters',
      'Characters',
      'character',
      [f.ref('faction', 'Faction', FACTIONS), f.text('role', 'Role'), f.long('bio', 'Biography')],
      [v.cards(), v.table()],
    ),
    s.collection(
      'quests',
      'Quests',
      'quest',
      [
        f.enm('type', 'Type', ['Main', 'Faction', 'Tavern random', 'Event']),
        f.ref('giver', 'Giver', section('characters')),
        f.ref('faction', 'Faction', FACTIONS),
        f.ref('act', 'Act', section('acts')),
        f.long('conditions', 'Conditions'),
        f.check('objectives', 'Objectives'),
        f.long('rewards', 'Rewards'),
        f.long('consequences', 'Consequences'),
      ],
      [v.cards(), v.kanban('type'), v.table(['name', 'type', 'giver', 'faction'])],
    ),
    s.graph('questGraph', 'Quest / dialog flow', ['Quest', 'Dialog', 'Choice', 'Event', 'Ending'], {
      nodeSource: section('quests'),
      edgeKinds: ['then', 'if choice', 'on failure', 'unlocks'],
    }),
  ]),
  mod('design', 'ui', 'UI / UX', 'docs/01_design/ui_ux.md', '🖥️', 'Screens, flows, wireframes.', [
    s.form('principles', 'UX principles', [f.long('principles', 'Principles'), f.long('input', 'Input and controls'), f.long('a11y', 'Accessibility and localization')]),
    s.collection(
      'screens',
      'Screens',
      'screen',
      [f.long('purpose', 'Purpose'), f.list('elements', 'Elements'), f.list('interactions', 'Interactions'), f.list('states', 'States')],
      [v.cards(), v.table(['name', 'purpose'])],
      {
        seed: ['HUD', 'Inventory', 'Crafting', 'Character / skill tree', 'Map', 'Town overview', 'NPC sheet', 'Trade', 'Diplomacy', 'Quest log', 'Settings'].map((name) => ({ name })),
      },
    ),
    s.graph('flow', 'Screen flow', ['Screen', 'Popup', 'Overlay'], { nodeSource: section('screens'), edgeKinds: ['opens', 'closes', 'navigates'] }),
    s.canvas('wireframe', 'Wireframe', ['Frame', 'Panel', 'Button', 'Text', 'Icon', 'List', 'Image', 'Input']),
  ]),
  mod('design', 'openQuestions', 'Open Questions', 'docs/01_design/open_questions.md', '❓', 'Design decisions to settle.', [
    s.collection(
      'questions',
      'Questions',
      'question',
      [
        f.text('area', 'Area'),
        f.long('options', 'Options'),
        f.long('decision', 'Decision'),
        f.enm('status', 'Status', ['Open', 'Discussion', 'Decided']),
        f.text('owner', 'Owner'),
        f.text('due', 'Due'),
      ],
      [v.kanban('status'), v.table()],
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
]
