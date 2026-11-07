import { analyzeDifficulty, customSettings, DIFFICULTY_DOC, levelsOf, levelSteps, paramsOf, spreadValues } from '../../core/difficulty'
import { paramUsage } from '../../core/difficultyImpact'
import type { GuideExample, ModuleGuide } from '../../core/guides/types'
import { makeId } from '../../core/model/project'
import type { Entity, Project } from '../../core/model/types'

const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const data = (p: Project): Record<string, any> | undefined => p.documents[DIFFICULTY_DOC]?.data
const presets = (p: Project): Entity[] => data(p)?.presets ?? []

/** Fills only empty value cells, so values the designer already tuned are kept. */
const spreadExample = (id: string, title: string, spread: number): GuideExample => ({
  id,
  section: 'values',
  title,
  description: `The middle level sits on each parameter’s baseline; the outer levels are ${Math.round(spread * 100)}% of the range easier or harder. Only empty cells are filled.`,
  preview: 'difficultyPressure',
  apply: (p) => {
    const d = data(p)
    if (!d) return
    const cells = ((d.values ??= { cells: {} }).cells ??= {})
    for (const [k, v] of Object.entries(spreadValues(p, spread))) if (typeof cells[k] !== 'number') cells[k] = v
  },
})

/** Intent text per level, by position: first, middle, last (or in between). */
const INTENTS = [
  { intent: 'Relaxed: mistakes are forgiven and the town and story stay in focus.', targetPlayer: 'Newcomers to survival and management games.' },
  { intent: 'The intended experience: steady pressure that rewards planning.', targetPlayer: 'Players who know the genre.' },
  { intent: 'Punishing: scarce resources and dangerous nights; every decision counts.', targetPlayer: 'Experienced players looking for a challenge.' },
]

const intentsExample: GuideExample = {
  id: 'intents',
  section: 'presets',
  title: 'Easy / standard / punishing intents',
  description: 'Fills the intended experience and target player of presets that leave them empty, by their position from easiest to hardest.',
  preview: 'difficultyPressure',
  apply: (p) => {
    const levels = levelsOf(p)
    for (const preset of presets(p)) {
      const i = levels.findIndex((l) => l.id === preset.level)
      if (i < 0) continue
      const pick = i === 0 ? INTENTS[0] : i === levels.length - 1 ? INTENTS[2] : INTENTS[1]
      if (!filled(preset.intent)) preset.intent = pick.intent
      if (!filled(preset.targetPlayer)) preset.targetPlayer = pick.targetPlayer
    }
  },
}

const CUSTOM = [
  { name: 'Hunger speed', pressure: 'How fast hunger and thirst drop', match: /hunger|thirst/i },
  { name: 'Enemy strength', pressure: 'Enemy health and damage', match: /enemy/i },
  { name: 'Prices', pressure: 'What things cost', match: /price/i },
]

const customExample: GuideExample = {
  id: 'custom',
  section: 'custom',
  title: 'Three accessibility sliders',
  description: 'Hunger speed, enemy strength and prices, each ×0.5–×2, linked to the parameters whose names match. Try them in the Simulator.',
  preview: 'difficultyPressure',
  apply: (p) => {
    const d = data(p)
    if (!d) return
    const list: Entity[] = (d.custom ??= [])
    for (const c of CUSTOM) {
      if (list.some((e) => String(e.name ?? '').toLowerCase() === c.name.toLowerCase())) continue
      list.push({ id: makeId(), name: c.name, pressure: c.pressure, params: paramsOf(p).filter((x) => c.match.test(String(x.name ?? ''))).map((x) => x.id), min: 0.5, max: 2 })
    }
  },
}

export const DIFFICULTY_GUIDE: ModuleGuide = {
  map: {
    width: 800,
    height: 200,
    nodes: [
      { id: 'principles', label: 'Principles', section: 'principles', x: 10, y: 14 },
      { id: 'presets', label: 'Presets', section: 'presets', x: 10, y: 120 },
      { id: 'params', label: 'Parameters', section: 'params', x: 220, y: 14 },
      { id: 'custom', label: 'Custom settings', section: 'custom', x: 220, y: 120 },
      { id: 'values', label: 'Values per level', section: 'values', x: 430, y: 66 },
      { id: 'player', label: 'Player Character', doc: 'design.player', x: 640, y: 14 },
      { id: 'combat', label: 'Combat', doc: 'design.combat', x: 640, y: 80 },
      { id: 'trade', label: 'Trade', doc: 'design.trade', x: 640, y: 146 },
    ],
    edges: [
      { from: 'principles', to: 'params', label: 'decide' },
      { from: 'presets', to: 'values', label: 'columns' },
      { from: 'params', to: 'values', label: 'rows' },
      { from: 'params', to: 'custom', label: 'adjustable' },
      { from: 'values', to: 'player', label: 'survival rate' },
      { from: 'values', to: 'combat', label: 'enemy HP, damage' },
      { from: 'values', to: 'trade', label: 'prices' },
    ],
  },
  steps: [
    {
      id: 'principles',
      title: 'Say what difficulty may change',
      body: 'Which pressures scale (combat, survival, economy, NPC needs) and what must never change between levels.',
      section: 'principles',
      target: 'field-principles',
      done: (p) => filled(data(p)?.principles?.principles),
    },
    {
      id: 'intents',
      title: 'Describe each preset',
      body: 'What each level should feel like and who it is for, before touching numbers.',
      section: 'presets',
      target: 'field-intent',
      done: (p) => presets(p).length > 0 && presets(p).every((e) => filled(e.intent)),
      action: { label: 'Insert example…', examples: 'presets' },
    },
    {
      id: 'context',
      title: 'Give parameters a direction and range',
      body: 'Does a higher value make the game harder or easier, and what is the meaningful range? The visual views need both.',
      section: 'params',
      target: 'field-direction',
      done: (p) => paramsOf(p).length > 0 && analyzeDifficulty(p).noContext.length === 0,
    },
    {
      id: 'values',
      title: 'Place every level on the tuning board',
      body: 'Each track runs easy → hard. Drag a marker per level, or let the example spread them evenly around the baselines.',
      section: 'params',
      target: 'view-tuningBoard',
      done: (p) => paramsOf(p).length > 0 && levelsOf(p).length > 0 && analyzeDifficulty(p).missing.length === 0,
      action: { label: 'Spread values…', examples: 'values' },
    },
    {
      id: 'order',
      title: 'Keep every track in order',
      body: 'A harder level should never be easier on a parameter, unless you mark it as an intentional exception. Out-of-order markers glow on the board.',
      section: 'params',
      target: 'view-tuningBoard',
      done: (p) => {
        const a = analyzeDifficulty(p)
        return paramsOf(p).length > 0 && a.missing.length === 0 && a.reversals.length === 0 && a.outOfRange.length === 0
      },
    },
    {
      id: 'spacing',
      title: 'Check the levels feel different',
      body: 'The Pressure view scores each level 0–100. Neighbouring levels a few points apart will feel the same.',
      section: 'presets',
      target: 'view-pressureOverview',
      done: (p) => {
        const s = levelSteps(p)
        return s.length > 0 && s.length === levelsOf(p).length - 1 && s.every((x) => !x.inverted && !x.tooClose)
      },
    },
    {
      id: 'impact',
      title: 'Connect parameters to systems',
      body: 'Link parameters from Player survival stats, the Combat damage model and Trade margins. The Impact view then shows survival times, enemy multipliers and prices per level.',
      section: 'presets',
      target: 'view-difficultyImpact',
      done: (p) => [...paramUsage(p).values()].some((u) => u.length > 0),
    },
    {
      id: 'custom',
      title: 'Offer custom settings (optional)',
      body: 'Sliders players can move themselves, so you need fewer fixed presets. Try them in the Simulator.',
      section: 'custom',
      target: 'view-customSimulator',
      done: (p) => customSettings(p).some((s) => Array.isArray(s.params) && s.params.length > 0),
      action: { label: 'Insert example…', examples: 'custom' },
    },
    {
      id: 'switching',
      title: 'Decide how difficulty can change',
      body: 'Can players switch during play, when does it apply, and what happens to achievements and permadeath?',
      section: 'switching',
      target: 'field-switching',
      done: (p) => filled(data(p)?.switching?.switching),
    },
    {
      id: 'storage',
      title: 'Note where the data lives',
      body: 'Point to the data-driven design document, so the numbers here end up in the game’s data.',
      section: 'storage',
      target: 'field-storage',
      done: (p) => filled(data(p)?.storage?.storage),
    },
  ],
  examples: [spreadExample('spread-gentle', 'Gentle spread (±20%)', 0.2), spreadExample('spread-wide', 'Wide spread (±40%)', 0.4), intentsExample, customExample],
  concepts: {
    params: {
      title: 'Reading a tuning track',
      body: 'Every track runs from the easiest end of the range on the left to the hardest on the right, so “higher = easier” parameters are drawn flipped. Markers are the levels; the line is the baseline.',
      diagram: 'tuningTrack',
    },
    presets: {
      title: 'Pressure and spacing',
      body: 'Pressure is how far toward the hard end each value sits, averaged over the parameters. Levels should climb in clear steps; the bar shows which categories make a level hard.',
      diagram: 'pressureBars',
    },
  },
  empty: {
    presets: 'One preset per difficulty level, saying what it should feel like and who it is for.',
    params: 'The numbers that change between difficulty levels, each with a unit, a direction and a range.',
    custom: 'Optional sliders players can adjust themselves, on top of a preset.',
  },
}
