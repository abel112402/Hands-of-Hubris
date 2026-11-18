import type { ZoneKind } from '../types'

/**
 * The look of a map. Colours are fixed here rather than taken from the app's CSS variables: a map has to look the
 * same in light mode, dark mode and the exported file. To add a style, add another MapTheme.
 */
export type MapTheme = {
  id: string
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
