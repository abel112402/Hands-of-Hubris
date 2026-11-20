import type { ZoneKind } from '../types'
import { PLAN_GLYPHS, type Glyph } from './glyphs'

/**
 * The look of a map. Colours are fixed here rather than taken from the app's CSS variables: a map has to look the
 * same in light mode, dark mode and the exported file. To add a style, add another MapTheme.
 */
export type MapTheme = {
  id: string
  /** Name in the theme picker. */
  label: string
  /** Kinds this theme draws its own way (a plan view of houses instead of roofs). */
  glyphs?: Partial<Record<string, Glyph>>
  card: string
  gilt: string
  paper: string
  paperShade: string
  ink: string
  inkSoft: string
  shadow: string
  road: string
  water: string
  waterLight: string
  ground: string[]
  roofs: string[]
  roofShade: string
  landmarkRoof: string
  crops: string[]
  trees: string[]
  wood: string
  stone: string
  rock: string
  floors: Record<string, string>
  linen: string
  ores: string[]
  foe: string
  /** Residents and other friendly people. */
  friend: string
  /** Direction sunlight comes from, degrees clockwise from north; shadows fall away from it. Default: from the upper left. */
  sun?: number
  /** How strongly lamps and torches glow, 0–1: faint in daylight, full in the dark. Default 1. */
  glow?: number
  /** Wash over each kind of district. */
  zones: Record<ZoneKind, string>
  /** Stripes of a market stall's awning. */
  awning: [string, string]
  /** Colour of each lock and its key, by lock name; others use `gilt`. */
  locks: Record<string, string>
  banner: string
  bannerText: string
  fontDisplay: string
  fontBody: string
}

export const PARCHMENT: MapTheme = {
  id: 'parchment',
  label: 'Parchment',
  card: '#2e2117',
  gilt: '#b8923f',
  paper: '#ecdcb4',
  paperShade: '#7a5a2e',
  ink: '#3a2a1c',
  inkSoft: '#6b5238',
  shadow: '#3a2a1c',
  road: '#f6ebcd',
  water: '#8fb6c4',
  waterLight: '#d3e6e8',
  ground: ['#9db565', '#b9c57c', '#86a65c'],
  roofs: ['#b5533c', '#c46f45', '#9c4a3a', '#c9a85c'],
  roofShade: '#3a2a1c',
  landmarkRoof: '#5f6f8a',
  crops: ['#dcc166', '#b7c56c', '#c9a25a'],
  trees: ['#5f8a4a', '#4f7a45', '#7a9a50'],
  wood: '#8a6238',
  stone: '#b3ab9b',
  rock: '#8f7d63',
  floors: { Stone: '#e6dcc4', Wood: '#dcbd8c', Earth: '#d6c59c' },
  linen: '#efe8d6',
  ores: ['#6fa3b8', '#c9a13a', '#9a6fb0'],
  foe: '#4a3b2c',
  friend: '#4f7a45',
  zones: { residential: '#c9b07a', market: '#d9a441', industrial: '#8a7a6a', military: '#9c4a3a', sacred: '#6f7fa8' },
  awning: ['#b5533c', '#f3e6c4'],
  locks: { red: '#b3362a', blue: '#3d68a8', green: '#4f8a3c', gold: '#d1a52b' },
  banner: '#8c2f25',
  bannerText: '#f6ead0',
  fontDisplay: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  fontBody: "Georgia, 'Times New Roman', serif",
}

/** A worn grey stone look for dungeons: slate paper, cold floors, iron ink. */
export const STONE: MapTheme = {
  ...PARCHMENT,
  id: 'stone',
  label: 'Stone dungeon',
  card: '#1f2226',
  gilt: '#8c96a0',
  paper: '#c9c6bd',
  paperShade: '#4a4d52',
  ink: '#22262b',
  inkSoft: '#4c535b',
  shadow: '#15181b',
  road: '#d8d4ca',
  rock: '#6b6a66',
  stone: '#9a9890',
  floors: { Stone: '#d6d2c6', Wood: '#b9a586', Earth: '#c4b9a0' },
  banner: '#3a4048',
  bannerText: '#e9e6dd',
}

/** Dark fantasy marsh: murky greens, black water, a sickly light. */
export const SWAMP: MapTheme = {
  ...PARCHMENT,
  id: 'swamp',
  label: 'Dark swamp',
  card: '#141a14',
  gilt: '#7d8f5a',
  paper: '#8f9a76',
  paperShade: '#26301f',
  ink: '#151a12',
  inkSoft: '#36412c',
  shadow: '#0b0f09',
  road: '#a9a383',
  water: '#3f5a52',
  waterLight: '#6f8c7f',
  ground: ['#4d6440', '#5d6f45', '#3f5236'],
  roofs: ['#5b4a3a', '#4a4036', '#6a5a42', '#7a6a4a'],
  trees: ['#2f4a2a', '#273f25', '#3d5530'],
  crops: ['#8a8a52', '#6f7a4a', '#7a6f48'],
  rock: '#4e5146',
  floors: { Stone: '#a8a88f', Wood: '#8c7a5c', Earth: '#7f7a5f' },
  banner: '#3d4a2a',
  bannerText: '#dfe3c8',
}

/** Flat plan drawing: buildings as outlines from above, trees as circles. Shared by the plan-style themes. */
const PLAN = { glyphs: PLAN_GLYPHS }

/** A starship deck as a blueprint: navy paper, cyan lines, monospaced labels. */
export const BLUEPRINT: MapTheme = {
  ...PARCHMENT,
  ...PLAN,
  id: 'blueprint',
  label: 'Sci-fi blueprint',
  card: '#0a1a33',
  gilt: '#4fb3d9',
  paper: '#14305a',
  paperShade: '#061226',
  ink: '#9fe3ff',
  inkSoft: '#5fa8cc',
  shadow: '#030a16',
  road: '#1d4278',
  water: '#123b6b',
  waterLight: '#3d7fb8',
  ground: ['#18406f', '#1b4a80', '#163a66'],
  roofs: ['#1f4f8a', '#24588f', '#1a4478', '#2a6098'],
  roofShade: '#061226',
  landmarkRoof: '#2f6fae',
  trees: ['#1e5a7a', '#1a5070', '#22668a'],
  crops: ['#1d4d7d', '#205584', '#1a4672'],
  wood: '#2a6098',
  stone: '#3a78b0',
  rock: '#0e2648',
  floors: { Stone: '#1a3c6b', Wood: '#1d4373', Earth: '#183863' },
  linen: '#2a5a90',
  foe: '#d9534f',
  friend: '#5cc28a',
  banner: '#0f2a52',
  bannerText: '#9fe3ff',
  fontDisplay: "'Consolas', 'Courier New', monospace",
  fontBody: "'Consolas', 'Courier New', monospace",
}

/** A modern architectural floor plan: white paper, black lines, plain sans-serif labels. */
export const MODERN: MapTheme = {
  ...PARCHMENT,
  ...PLAN,
  id: 'modern',
  label: 'Modern plan',
  card: '#2b2b2b',
  gilt: '#9a9a9a',
  paper: '#fbfbf8',
  paperShade: '#d8d8d2',
  ink: '#1c1c1c',
  inkSoft: '#6b6b6b',
  shadow: '#9a9a9a',
  road: '#e9e9e4',
  water: '#bfd9ea',
  waterLight: '#e6f1f8',
  ground: ['#e3ecd6', '#eef2e4', '#dbe6cc'],
  roofs: ['#ececec', '#e2e2e2', '#d8d8d8', '#f2f2f2'],
  roofShade: '#9a9a9a',
  landmarkRoof: '#d0d8e4',
  trees: ['#b9d3a0', '#a8c78e', '#c7dcb2'],
  crops: ['#ecebc8', '#e0e8c4', '#efe4c2'],
  wood: '#d8c3a0',
  stone: '#cfcfcf',
  rock: '#c8c8c3',
  floors: { Stone: '#f1f1ee', Wood: '#efe6d6', Earth: '#ece7dc' },
  banner: '#3a3a3a',
  bannerText: '#ffffff',
  fontDisplay: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  fontBody: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
}

/** Every theme, by id. To add a style: one more MapTheme here. */
export const THEMES: Record<string, MapTheme> = Object.fromEntries([PARCHMENT, STONE, SWAMP, BLUEPRINT, MODERN].map((t) => [t.id, t]))
/** The theme a map asks for, parchment when it asks for none or one that does not exist. */
export const themeOf = (id: unknown): MapTheme => THEMES[String(id)] ?? PARCHMENT
