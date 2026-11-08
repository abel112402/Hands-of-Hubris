/**
 * Declarative genre catalog: which planners each genre recommends and which project-guide steps it adds.
 * Content only; the logic lives in `src/core/genre.ts`.
 *
 * Rules for editing:
 * - Genre, step and module IDs are stable and saved in project files. Never rename or reuse them;
 *   retire a genre by removing it (saved IDs are kept and shown as unknown).
 * - Recommendations are suggestions. Genre alone never implies a mechanic is required.
 * - Add a genre = one entry in GENRES (+ optional guide steps tagged with its ID). No other code changes.
 */

/** A planner a genre recommends, with the reason shown to the user. Earlier = higher priority. */
export type GenreEditor = { docId: string; why: string }

export type GenreDef = {
  id: string
  label: string
  icon: string
  summary: string
  editors: GenreEditor[]
}

/** Shared starting point for every profile, always ordered first. */
export const FOUNDATION_EDITORS: GenreEditor[] = [
  { docId: 'overview.vision', why: 'Pitch, pillars and scope anchor every other decision.' },
  { docId: 'design.coreLoop', why: 'The moment-to-moment loop is what players repeat most.' },
]

/** Order used when no known genre is selected (the general docs/README.md order). */
export const GENERAL_ORDER = [
  'overview.vision',
  'design.coreLoop',
  'design.player',
  'design.world',
  'design.items',
  'design.npc',
  'design.combat',
  'design.trade',
  'design.story',
  'production.milestones',
  'qa.testPlan',
]

export const GENRES: GenreDef[] = [
  {
    id: 'survival',
    label: 'Survival',
    icon: '🔥',
    summary: 'Needs, scarce resources and a hostile world.',
    editors: [
      { docId: 'design.player', why: 'Survival needs, death and the hero carry the pressure.' },
      { docId: 'design.world', why: 'Biomes decide where resources and hazards are.' },
      { docId: 'design.items', why: 'Gathering and crafting turn scarcity into progress.' },
      { docId: 'design.timeWeather', why: 'Day, night and weather change how dangerous the world is.' },
      { docId: 'design.difficulty', why: 'Tune how fast needs and threats grow.' },
      { docId: 'design.combat', why: 'Threats the player must fight or avoid.' },
      { docId: 'design.town', why: 'Bases and shelters, if the game has them.' },
    ],
  },
  {
    id: 'rpg',
    label: 'RPG',
    icon: '🧙',
    summary: 'Character growth, quests and meaningful choices.',
    editors: [
      { docId: 'design.player', why: 'Levels, skills and abilities are the core of character growth.' },
      { docId: 'design.story', why: 'Acts, quests and choices give progression a purpose.' },
      { docId: 'design.items', why: 'Gear and loot are a second progression track.' },
      { docId: 'design.combat', why: 'Most RPGs test builds through combat.' },
      { docId: 'design.npc', why: 'Companions, quest givers and townsfolk.' },
      { docId: 'design.world', why: 'Regions gate progression and exploration.' },
      { docId: 'design.factions', why: 'Reputation and factions make choices matter.' },
      { docId: 'design.trade', why: 'Shops and money connect loot to progression.' },
    ],
  },
  {
    id: 'action',
    label: 'Action',
    icon: '⚔️',
    summary: 'Reflexes, tight controls and readable combat.',
    editors: [
      { docId: 'design.combat', why: 'Damage, enemies and bosses are the main content.' },
      { docId: 'design.player', why: 'Controls and abilities define how the game feels.' },
      { docId: 'design.ui', why: 'HUD and input must stay readable at speed.' },
      { docId: 'design.difficulty', why: 'Difficulty presets decide who can finish the game.' },
      { docId: 'design.world', why: 'Levels and arenas shape encounters.' },
    ],
  },
  {
    id: 'strategy',
    label: 'Strategy',
    icon: '♟️',
    summary: 'Long-term decisions against rivals or systems.',
    editors: [
      { docId: 'design.factions', why: 'Rivals, diplomacy and victory conditions.' },
      { docId: 'design.trade', why: 'Resources and economy drive every decision.' },
      { docId: 'design.town', why: 'Bases, production and logistics.' },
      { docId: 'technical.ai', why: 'Opponent AI is what the player plays against.' },
      { docId: 'design.difficulty', why: 'AI handicaps and bonuses per difficulty.' },
      { docId: 'design.ui', why: 'Dense information needs clear screens.' },
    ],
  },
  {
    id: 'simulation',
    label: 'Simulation / Management',
    icon: '🏗️',
    summary: 'Systems that run by themselves; the player steers.',
    editors: [
      { docId: 'design.town', why: 'Buildings, production chains and logistics.' },
      { docId: 'design.npc', why: 'Simulated people: needs, jobs and routines.' },
      { docId: 'design.trade', why: 'Money and resource flows keep the simulation honest.' },
      { docId: 'design.timeWeather', why: 'Time drives ticks, seasons and events.' },
      { docId: 'technical.performance', why: 'Large simulations need tick and memory budgets.' },
      { docId: 'design.ui', why: 'Players manage through screens and overlays.' },
    ],
  },
  {
    id: 'adventure',
    label: 'Adventure / Narrative',
    icon: '📖',
    summary: 'Story, characters and exploration first.',
    editors: [
      { docId: 'design.story', why: 'Structure, characters and choices are the game.' },
      { docId: 'design.world', why: 'Places to explore carry the story.' },
      { docId: 'design.npc', why: 'Characters the player meets and talks to.' },
      { docId: 'design.ui', why: 'Dialogue and journal screens.' },
      { docId: 'design.items', why: 'Key items and inventory puzzles.' },
    ],
  },
  {
    id: 'roguelike',
    label: 'Roguelike / Roguelite',
    icon: '🎲',
    summary: 'Short runs, randomness and meta progression.',
    editors: [
      { docId: 'design.combat', why: 'Enemies and bosses are the run content.' },
      { docId: 'design.items', why: 'Random loot makes each run different.' },
      { docId: 'design.difficulty', why: 'Run difficulty and escalation.' },
      { docId: 'design.player', why: 'Split run progression from meta progression.' },
      { docId: 'design.world', why: 'Generated levels and biomes.' },
      { docId: 'qa.balance', why: 'Randomness needs measured balance.' },
    ],
  },
  {
    id: 'sandbox',
    label: 'Sandbox / Crafting',
    icon: '🧱',
    summary: 'Player-driven goals and building.',
    editors: [
      { docId: 'design.world', why: 'A world worth shaping and exploring.' },
      { docId: 'design.items', why: 'Materials, recipes and stations.' },
      { docId: 'design.town', why: 'Building and bases.' },
      { docId: 'technical.dataDriven', why: 'Data-driven content and modding extend the sandbox.' },
      { docId: 'design.timeWeather', why: 'Cycles that make the world feel alive.' },
    ],
  },
]

/**
 * A step of the project-level guide. `genres` lists the genre IDs that add it, or 'foundation'
 * for every profile. Steps link into existing planners; they never insert content.
 * Done when the target section (or the whole document, without `section`) has content.
 */
export type ProjectGuideStepDef = {
  id: string
  genres: string[]
  /** Lower comes first; ties keep declaration order. */
  priority: number
  docId: string
  section?: string
  title: string
  body: string
}

export const PROJECT_GUIDE_STEPS: ProjectGuideStepDef[] = [
  { id: 'foundation.pitch', genres: ['foundation'], priority: 0, docId: 'overview.vision', section: 'pitch', title: 'Write the pitch', body: 'One paragraph: who the player is, what they do and why it is fun.' },
  { id: 'foundation.pillars', genres: ['foundation'], priority: 1, docId: 'overview.vision', section: 'pillars', title: 'Pick 3–5 design pillars', body: 'Pillars decide which features stay when time runs out.' },
  { id: 'foundation.loop', genres: ['foundation'], priority: 2, docId: 'design.coreLoop', section: 'loops', title: 'Describe the core loop', body: 'What the player does every minute, every session and over the whole game.' },

  { id: 'player.controls', genres: ['action'], priority: 10, docId: 'design.player', section: 'controls', title: 'Define the controls', body: 'List every input and what it does; action games live or die by feel.' },
  { id: 'player.survival', genres: ['survival'], priority: 10, docId: 'design.player', section: 'survival', title: 'Define survival pressures', body: 'Which needs drain (hunger, warmth, sanity…), how fast, and what happens at zero.' },
  { id: 'player.leveling', genres: ['rpg', 'roguelike'], priority: 10, docId: 'design.player', section: 'leveling', title: 'Shape progression', body: 'How the character grows. Roguelikes: decide what survives a run (meta) and what resets.' },
  { id: 'story.structure', genres: ['adventure'], priority: 10, docId: 'design.story', section: 'structure', title: 'Choose the story structure', body: 'Linear, branching or open; it decides how quests and choices are built.' },
  { id: 'factions.list', genres: ['strategy'], priority: 10, docId: 'design.factions', section: 'factions', title: 'Define the factions', body: 'Who competes with whom, and what each faction wants.' },
  { id: 'town.buildings', genres: ['simulation', 'sandbox'], priority: 10, docId: 'design.town', section: 'buildings', title: 'List the buildings', body: 'What each building produces or enables; the backbone of the simulation.' },
  { id: 'world.exploration', genres: ['adventure', 'sandbox'], priority: 12, docId: 'design.world', section: 'exploration', title: 'Decide how exploration works', body: 'What the player discovers, and what rewards curiosity.' },

  { id: 'world.biomes', genres: ['survival', 'rpg', 'roguelike'], priority: 20, docId: 'design.world', section: 'biomes', title: 'Map biomes and their hazards', body: 'Each biome: its resources, its threats and when the player can survive there.' },
  { id: 'player.skills', genres: ['rpg'], priority: 20, docId: 'design.player', section: 'skills', title: 'Sketch the skill trees', body: 'Which builds exist and how players choose between them.' },
  { id: 'combat.damage', genres: ['action'], priority: 20, docId: 'design.combat', section: 'damageModel', title: 'Pick the damage model', body: 'How attacks, defence and resistances combine into damage.' },
  { id: 'story.characters', genres: ['adventure', 'rpg'], priority: 20, docId: 'design.story', section: 'characters', title: 'Introduce the main characters', body: 'Who the player meets, what they want and how they change.' },
  { id: 'trade.currency', genres: ['strategy'], priority: 20, docId: 'design.trade', section: 'currency', title: 'Define resources and currency', body: 'What players earn and spend, and where it comes from.' },
  { id: 'npc.needs', genres: ['simulation'], priority: 20, docId: 'design.npc', section: 'needRules', title: 'Give NPCs needs', body: 'What simulated people need and how unmet needs show up.' },
  { id: 'items.loot', genres: ['roguelike'], priority: 20, docId: 'design.items', section: 'loot', title: 'Design loot tables', body: 'What drops where, and how rare each tier is.' },

  { id: 'items.recipes', genres: ['survival', 'sandbox'], priority: 30, docId: 'design.items', section: 'recipes', title: 'Chain gathering into crafting', body: 'Recipes and stations that turn raw resources into tools, shelter and gear.' },
  { id: 'story.quests', genres: ['rpg'], priority: 30, docId: 'design.story', section: 'quests', title: 'Plan the main quests', body: 'Quests that move the story and pace character progression.' },
  { id: 'items.rarity', genres: ['rpg'], priority: 35, docId: 'design.items', section: 'rarityTiers', title: 'Connect gear with character progression', body: 'Rarity tiers and power levels that keep pace with player levels.' },
  { id: 'combat.enemies', genres: ['action', 'roguelike'], priority: 30, docId: 'design.combat', section: 'enemies', title: 'Build the enemy roster', body: 'Enemy roles, what each one tests and where it appears.' },
  { id: 'story.choices', genres: ['adventure'], priority: 30, docId: 'design.story', section: 'choices', title: 'Design meaningful choices', body: 'Which decisions change the story, and how players see the consequences.' },
  { id: 'ai.behavior', genres: ['strategy'], priority: 30, docId: 'technical.ai', section: 'behavior', title: 'Describe opponent behaviour', body: 'How AI rivals decide, and how they can be beaten.' },
  { id: 'trade.flows', genres: ['simulation'], priority: 30, docId: 'design.trade', section: 'flows', title: 'Map money and resource flows', body: 'Sources and sinks, so the economy neither inflates nor starves.' },
  { id: 'data.modding', genres: ['sandbox'], priority: 30, docId: 'technical.dataDriven', section: 'modding', title: 'Decide on modding', body: 'Which content players can add, and in which data formats.' },

  { id: 'time.cycles', genres: ['survival'], priority: 40, docId: 'design.timeWeather', section: 'time', title: 'Let time raise the pressure', body: 'Day and night, seasons and weather that change danger and needs.' },
  { id: 'ui.hud', genres: ['action'], priority: 40, docId: 'design.ui', section: 'hud', title: 'Lay out the HUD', body: 'What the player must read mid-fight, and where it sits on screen.' },
  { id: 'difficulty.presets', genres: ['strategy'], priority: 40, docId: 'design.difficulty', section: 'presets', title: 'Set difficulty presets', body: 'How AI bonuses and handicaps change per difficulty.' },
  { id: 'perf.budgets', genres: ['simulation'], priority: 40, docId: 'technical.performance', section: 'budgets', title: 'Set simulation budgets', body: 'How many agents and ticks per frame the target hardware can afford.' },
  { id: 'qa.balanceGoals', genres: ['roguelike'], priority: 40, docId: 'qa.balance', section: 'goals', title: 'Set balance goals', body: 'Target win rates and run lengths to measure randomness against.' },
  { id: 'player.death', genres: ['survival'], priority: 50, docId: 'design.player', section: 'death', title: 'Decide what death costs', body: 'Lost items, lost progress or a new character: the stake behind every risk.' },
]
