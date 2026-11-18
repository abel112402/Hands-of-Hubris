import { ROOM_SHAPES } from './rooms'
import type { MapPoint as Pt, NewMapObject } from './types'

/**
 * What the editor may do with each object kind. The glyph (render/glyphs.ts) says how a kind looks; this says how
 * it is handled: its shape for selection and handles, its variants, and what a hand-added one starts as.
 */
export type KindShape =
  /** Centred box: move, resize, and rotate unless `fixedAngle`. */
  | 'box'
  /** Open curve through `ctrl` waypoints (road, river). */
  | 'curve'
  /** Closed curve through `ctrl` waypoints (wall, pond). */
  | 'outline'
  /** Only a position (label, well). */
  | 'point'
  /** Scenery behind everything: never picked on the map, only regenerated. */
  | 'backdrop'

export type KindVariant = { prop: string; label: string; options: string[]; /** Stores the option's index instead of its text. */ byIndex?: boolean }

export type KindInfo = {
  label: string
  shape: KindShape
  /** Width and height stay equal. */
  square?: boolean
  fixedAngle?: boolean
  /** Has a text the user can edit. */
  text?: boolean
  variants?: KindVariant[]
  /** A new object of this kind at a point, for "Add". Kinds without it cannot be added by hand. */
  make?: (x: number, y: number) => NewMapObject
  /** What the object does to walking (nav.ts). Kinds without it are only drawn. */
  nav?: NavRule
}

/**
 * How an object kind changes the walkability grid. Effects are painted in this order, each over the last:
 * floor (walkable), water (walkable but wet and slow), cost (slower, never opens a blocked cell), block,
 * opening (cuts through anything: doors, gates, bridges).
 */
export type NavRule = {
  effect: 'floor' | 'water' | 'cost' | 'block' | 'opening'
  /** Steps through the cell cost this much (1 = easy). */
  cost?: number
  /** Paint along the line (width from `props.width`, else this) instead of filling the shape. */
  line?: number
  /** A room: its edge is a wall, so two rooms side by side stay apart except where a door opens. */
  walled?: boolean
}

const WALL_STYLE: KindVariant = { prop: 'style', label: 'Style', options: ['Palisade', 'Stone'] }
const line = (x: number, y: number): Pt[] => [[x - 90, y], [x, y], [x + 90, y]]

export const KINDS: Record<string, KindInfo> = {
  patch: { label: 'Ground patch', shape: 'backdrop' },
  coast: { label: 'Coast', nav: { effect: 'water', cost: 30 }, shape: 'backdrop' },
  river: { label: 'River', nav: { effect: 'water', cost: 30, line: 30 }, shape: 'curve' },
  pond: { label: 'Pond', nav: { effect: 'water', cost: 20 }, shape: 'outline' },
  district: { label: 'District', shape: 'backdrop' },
  road: { label: 'Road', nav: { effect: 'floor', line: 11 }, shape: 'curve', make: (x, y) => ({ kind: 'road', rank: 'street', x, y, points: line(x, y), ctrl: line(x, y), props: { width: 11 } }) },
  plaza: { label: 'Green', nav: { effect: 'floor' }, shape: 'box', square: true, fixedAngle: true },
  bridge: { label: 'Bridge', nav: { effect: 'opening' }, shape: 'box', make: (x, y) => ({ kind: 'bridge', x, y, w: 48, h: 22, rot: 0 }) },
  wall: { label: 'Wall', nav: { effect: 'block', line: 8 }, shape: 'outline', variants: [WALL_STYLE] },
  gate: { label: 'Gate', nav: { effect: 'opening' }, shape: 'box', variants: [WALL_STYLE], make: (x, y) => ({ kind: 'gate', x, y, w: 18, h: 18, rot: 0, props: { style: 'Palisade' } }) },
  landmark: { label: 'Landmark', nav: { effect: 'block' }, shape: 'box', text: true, make: (x, y) => ({ kind: 'landmark', x, y, w: 54, h: 38, rot: 0, label: 'Landmark' }) },
  well: { label: 'Well', nav: { effect: 'block' }, shape: 'point', make: (x, y) => ({ kind: 'well', x, y, w: 18, h: 18 }) },
  field: {
    label: 'Field', nav: { effect: 'cost', cost: 3 },
    shape: 'box',
    variants: [{ prop: 'crop', label: 'Crop', options: ['Wheat', 'Greens', 'Barley'], byIndex: true }],
    make: (x, y) => ({ kind: 'field', x, y, w: 150, h: 95, rot: 0, props: { crop: 0 } }),
  },
  house: {
    label: 'House', nav: { effect: 'block' },
    shape: 'box',
    variants: [
      { prop: 'roof', label: 'Roof', options: ['Red tile', 'Orange tile', 'Dark tile', 'Thatch'], byIndex: true },
      { prop: 'use', label: 'Use', options: ['house', 'stall', 'workshop', 'barracks', 'shrine'] },
    ],
    make: (x, y) => ({ kind: 'house', x, y, w: 36, h: 25, rot: 0, props: { roof: 0, chimney: true } }),
  },
  tree: {
    label: 'Tree', nav: { effect: 'cost', cost: 4 },
    shape: 'box',
    square: true,
    fixedAngle: true,
    variants: [{ prop: 'tone', label: 'Foliage', options: ['Green', 'Dark', 'Light'], byIndex: true }],
    make: (x, y) => ({ kind: 'tree', x, y, w: 22, h: 22, props: { tone: 0 } }),
  },
  label: {
    label: 'Label',
    shape: 'point',
    text: true,
    variants: [{ prop: 'size', label: 'Size', options: ['normal', 'large'] }],
    make: (x, y) => ({ kind: 'label', x, y, label: 'Label' }),
  },
  // Interiors and underground.
  rock: { label: 'Rock', shape: 'backdrop' },
  hollow: { label: 'Chamber', shape: 'backdrop' },
  cavern: { label: 'Cavern', nav: { effect: 'floor' }, shape: 'backdrop' },
  rockpile: { label: 'Rock pile', nav: { effect: 'block' }, shape: 'outline' },
  room: {
    label: 'Room', nav: { effect: 'floor', walled: true },
    shape: 'box',
    fixedAngle: true,
    text: true,
    variants: [{ prop: 'floor', label: 'Floor', options: ['Wood', 'Stone', 'Earth'] }],
    make: (x, y) => ({ kind: 'room', x, y, w: 120, h: 90, label: 'Room', props: { floor: 'Wood' } }),
  },
  chamber: {
    label: 'Room', nav: { effect: 'floor' },
    shape: 'box',
    fixedAngle: true,
    variants: [
      { prop: 'role', label: 'Role', options: ['room', 'entrance', 'boss', 'treasure', 'secret'] },
      { prop: 'shape', label: 'Shape', options: [...ROOM_SHAPES] },
      { prop: 'cut', label: 'L opening', options: ['Top left', 'Top right', 'Bottom right', 'Bottom left'], byIndex: true },
    ],
    make: (x, y) => ({ kind: 'chamber', x, y, w: 120, h: 90, props: { role: 'room' } }),
  },
  corridor: { label: 'Corridor', nav: { effect: 'floor', line: 16 }, shape: 'curve', make: (x, y) => ({ kind: 'corridor', x, y, points: line(x, y), ctrl: line(x, y), props: { width: 16 } }) },
  door: {
    label: 'Door', nav: { effect: 'opening' },
    shape: 'box',
    variants: [{ prop: 'style', label: 'Kind', options: ['door', 'open', 'gate', 'secret'] }],
    make: (x, y) => ({ kind: 'door', x, y, w: 24, h: 8, rot: 0, props: { style: 'door' } }),
  },
  window: { label: 'Window', shape: 'box', make: (x, y) => ({ kind: 'window', x, y, w: 22, h: 6, rot: 0 }) },
  furniture: {
    label: 'Furniture', nav: { effect: 'cost', cost: 5 },
    shape: 'box',
    text: true,
    variants: [{ prop: 'type', label: 'Piece', options: ['table', 'bed', 'hearth', 'chest', 'barrel', 'shelf', 'rug', 'stool'] }],
    make: (x, y) => ({ kind: 'furniture', x, y, w: 32, h: 20, rot: 0, props: { type: 'table' } }),
  },
  stairs: { label: 'Stairs', nav: { effect: 'floor' }, shape: 'box', make: (x, y) => ({ kind: 'stairs', x, y, w: 30, h: 22, rot: 0 }) },
  light: {
    label: 'Light',
    shape: 'point',
    variants: [{ prop: 'type', label: 'Kind', options: ['torch', 'brazier', 'lamp', 'candle', 'hearth', 'campfire', 'crystal'] }],
    make: (x, y) => ({ kind: 'light', x, y, w: 12, h: 12, props: { type: 'torch' } }),
  },
  key: { label: 'Key', shape: 'point', text: true, make: (x, y) => ({ kind: 'key', x, y, w: 16, h: 16, key: 'red', label: 'Red key' }) },
  trap: { label: 'Trap', nav: { effect: 'cost', cost: 8 }, shape: 'point', make: (x, y) => ({ kind: 'trap', x, y, w: 14, h: 14 }) },
  pillar: { label: 'Pillar', nav: { effect: 'block' }, shape: 'point', make: (x, y) => ({ kind: 'pillar', x, y, w: 12, h: 12 }) },
  marker: {
    label: 'Creature',
    shape: 'point',
    text: true,
    variants: [{ prop: 'type', label: 'Kind', options: ['enemy', 'boss', 'npc', 'merchant'] }],
    make: (x, y) => ({ kind: 'marker', x, y, w: 18, h: 18, label: 'Enemy', props: { type: 'enemy' } }),
  },
  stalagmite: { label: 'Stalagmite', nav: { effect: 'block' }, shape: 'point', make: (x, y) => ({ kind: 'stalagmite', x, y, w: 11, h: 12 }) },
  ore: {
    label: 'Ore vein',
    shape: 'point',
    text: true,
    variants: [{ prop: 'tone', label: 'Colour', options: ['Blue', 'Gold', 'Violet'], byIndex: true }],
    make: (x, y) => ({ kind: 'ore', x, y, w: 18, h: 18, label: 'Ore', props: { tone: 0 } }),
  },
}

export const kindInfo = (kind: string): KindInfo | undefined => KINDS[kind]
/** Whether a click on the map may pick an object of this kind. */
export const selectable = (kind: string) => !!KINDS[kind] && KINDS[kind].shape !== 'backdrop'
