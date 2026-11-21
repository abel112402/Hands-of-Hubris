import type { Entity, Project } from '../model/types'
import { words } from '../coding'
import { getSections, MODULES } from '../modules/registry'
import type { EngineIssue } from './ir'

/**
 * Engine IR v6: the scaffolding ideas of plans/UNITY_INTEGRATION_PLAN.md § 7 — the input map from UI/UX › Controls
 * (I13), the screens and their flow from UI/UX (I8), and the state machines drawn in the planner's graphs (I4).
 */

export type IrInputAction = {
  id: string
  name: string
  words: string[]
  category: string
  key?: string
  mouse?: string
  gamepad?: string
  /** Hold / Toggle / Press, as planned (documentation for the game; the binding is a button). */
  mode?: string
  rebindable: boolean
  /** Screen IDs the action only applies on (e.g. Close window on Inventory). */
  contexts: string[]
}
export type IrInput = { devices: string[]; actions: IrInputAction[] }

export type IrScreenElement = { id: string; kind: string; x: number; y: number; w: number; h: number; text?: string; bind?: { source: string; id?: string }; opens?: string }
export type IrScreen = { id: string; name: string; words: string[]; kind: string; entry: boolean; elements: IrScreenElement[] }
/** A move between screens: opens, closes, replaces… as drawn in Screen flow, plus buttons that open a screen. */
export type IrScreenLink = { from: string; to: string; kind: string }
export type IrUi = { width: number; height: number; screens: IrScreen[]; links: IrScreenLink[] }

export type IrState = { id: string; name: string; words: string[]; kind: 'start' | 'state' | 'end' }
export type IrTransition = { from: string; to: string; kind: string; label: string; cause?: string }
export type IrStateMachine = { id: string; name: string; words: string[]; where: string; states: IrState[]; transitions: IrTransition[] }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const list = (p: Project, doc: string, section: string): Entity[] => {
  const v = p.documents[doc]?.data[section]
  return Array.isArray(v) ? (v as Entity[]) : []
}

export function buildInput(p: Project): IrInput {
  const ui = p.documents['design.ui']?.data ?? {}
  const devices = Array.isArray(ui.input?.devices) ? (ui.input.devices as unknown[]).map(str).filter(Boolean) : []
  const actions = list(p, 'design.ui', 'controls')
    .filter((c) => str(c.name))
    .map((c) => ({
      id: String(c.id),
      name: str(c.name),
      words: words(str(c.name)),
      category: str(c.category) || 'General',
      ...(str(c.key) && { key: str(c.key) }),
      ...(str(c.mouse) && { mouse: str(c.mouse) }),
      ...(str(c.gamepad) && { gamepad: str(c.gamepad) }),
      ...(str(c.mode) && { mode: str(c.mode) }),
      rebindable: c.rebindable !== false,
      contexts: Array.isArray(c.contexts) ? (c.contexts as unknown[]).map(String) : [],
    }))
  return { devices, actions }
}

export function buildUi(p: Project): IrUi {
  const data = p.documents['design.ui']?.data ?? {}
  const width = num(data.layoutRules?.resolution && Number(String(data.layoutRules.resolution).split(/[×x]/)[0]), 1920) || 1920
  const height = num(data.layoutRules?.resolution && Number(String(data.layoutRules.resolution).split(/[×x]/)[1]), 1080) || 1080
  const screens: IrScreen[] = list(p, 'design.ui', 'screens')
    .filter((s) => str(s.name))
    .map((s) => ({
      id: String(s.id),
      name: str(s.name),
      words: words(str(s.name)),
      kind: str(s.kind) || 'Window',
      entry: !!s.entry,
      elements: (Array.isArray(s.layout?.elements) ? (s.layout.elements as Entity[]) : []).map((e) => ({
        id: String(e.id),
        kind: str(e.kind) || 'panel',
        x: num(e.x),
        y: num(e.y),
        w: num(e.w, 100),
        h: num(e.h, 40),
        ...(str(e.text) && { text: str(e.text) }),
        ...(e.bind && typeof e.bind === 'object' && str(e.bind.source) && { bind: { source: str(e.bind.source), ...(str(e.bind.id) && { id: str(e.bind.id) }) } }),
        ...(e.action && typeof e.action === 'object' && str(e.action.screen) && { opens: str(e.action.screen) }),
      })),
    }))
  const known = new Set(screens.map((s) => s.id))
  const flow = data.flow && typeof data.flow === 'object' ? (data.flow as { nodes?: Entity[]; edges?: Entity[] }) : {}
  const screenOf = new Map((flow.nodes ?? []).filter((n) => str(n.refId) && known.has(str(n.refId))).map((n) => [String(n.id), str(n.refId)]))
  const links: IrScreenLink[] = []
  const add = (l: IrScreenLink) => {
    if (l.from !== l.to && !links.some((x) => x.from === l.from && x.to === l.to && x.kind === l.kind)) links.push(l)
  }
  for (const e of flow.edges ?? []) {
    const from = screenOf.get(String(e.source))
    const to = screenOf.get(String(e.target))
    if (from && to) add({ from, to, kind: str(e.kind) || 'opens' })
  }
  for (const s of screens) for (const e of s.elements) if (e.opens && known.has(e.opens)) add({ from: s.id, to: e.opens, kind: 'opens' })
  return { width, height, screens, links }
}

const STATE_KINDS: Record<string, IrState['kind']> = { Start: 'start', State: 'state', End: 'end' }

/** Every planner graph with at least two states (Start / State / End nodes) and a transition between them. */
export function buildStateMachines(p: Project, issues: EngineIssue[]): IrStateMachine[] {
  const out: IrStateMachine[] = []
  for (const m of MODULES) {
    const doc = p.documents[m.id]
    if (!doc) continue
    for (const sec of getSections(m, p.registry)) {
      if (sec.kind !== 'graph' || !sec.nodeKinds.includes('State')) continue
      const g = doc.data[sec.id] as { nodes?: Entity[]; edges?: Entity[] } | undefined
      const states: IrState[] = (g?.nodes ?? []).filter((n) => STATE_KINDS[str(n.kind)] && str(n.label)).map((n) => ({ id: String(n.id), name: str(n.label), words: words(str(n.label)), kind: STATE_KINDS[str(n.kind)] }))
      const ids = new Set(states.map((s) => s.id))
      // A connection's cause (an event, a quest…) is named by the entry it points at, if any list of the document has it.
      const lists = Object.values(doc.data).filter((v): v is Entity[] => Array.isArray(v))
      const nameOf = (id: string) => str(lists.flat().find((e) => e && String(e.id) === id)?.name)
      const transitions: IrTransition[] = (g?.edges ?? [])
        .filter((e) => ids.has(String(e.source)) && ids.has(String(e.target)))
        .map((e) => ({ from: String(e.source), to: String(e.target), kind: str(e.kind), label: str(e.label) || str(e.kind), ...(str(e.refId) && nameOf(str(e.refId)) && { cause: nameOf(str(e.refId)) }) }))
      if (states.length < 2 || !transitions.length) continue
      const key = m.id.split('.').pop()!
      const name = `${m.title} › ${sec.title}`
      if (!states.some((s) => s.kind === 'start')) issues.push({ level: 'info', code: 'stateMachine.noStart', message: `${name}: no Start node; the machine starts in its first state.` })
      out.push({ id: `${m.id}.${sec.id}`, name, words: [...words(key), ...words(sec.id)], where: name, states, transitions })
    }
  }
  return out
}
