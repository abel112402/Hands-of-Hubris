/**
 * Declarative genre catalog: which planners each genre recommends, and why.
 * The genre walkthroughs (steps, chapters, tips) live in `src/modules/walkthroughs`.
 * Content only; the logic lives in `src/core/genre.ts`.
 *
 * Rules for editing:
 * - Genre and module IDs are stable and saved in project files. Never rename or reuse them;
 *   retire a genre by removing it (saved IDs are kept and shown as unknown).
 * - Recommendations are suggestions. Genre alone never implies a mechanic is required.
 * - Add a genre = one entry in GENRES + a walkthrough pack in src/modules/walkthroughs. No other code changes.
 */

import type { ModuleGroup } from '../core/model/types'

/**
 * Planner groups every game needs, shown in full whatever the genre. Genres still mark (★) and explain
 * the planners they recommend inside these groups, but only the other groups (Game Design) are narrowed.
 */
export const ALWAYS_SHOWN_GROUPS: readonly ModuleGroup[] = ['overview', 'technical', 'artAudio', 'production', 'qa', 'templates', 'custom']

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
