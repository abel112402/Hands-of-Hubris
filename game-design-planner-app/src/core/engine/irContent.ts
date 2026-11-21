import type { Entity, Project } from '../model/types'
import { words } from '../coding'

/**
 * Engine IR v8: the content ideas of plans/UNITY_INTEGRATION_PLAN.md § 7 — the quest graph with its choices and
 * endings (I7: a quest log that only follows the plan, and a test that every ending can be reached), the save system
 * (I9: version, slots and the parts one save holds) and the scenes by roadmap phase (I19: the build's scene list).
 */

export type IrQuest = { id: string; name: string; words: string[]; type: string; requires: string[]; blocks: string[]; objectives: string[]; minutes?: number }
export type IrChoice = { id: string; name: string; words: string[]; decision: string; quest?: string; leadsTo: string[]; blocks: string[] }
export type IrEnding = { id: string; name: string; words: string[]; kind: string; requiresQuests: string[]; requiresChoices: string[] }
export type IrStory = { quests: IrQuest[]; choices: IrChoice[]; endings: IrEnding[] }

export type IrSavePart = { id: string; name: string; words: string[]; key: string; module?: string; since: number; notes: string }
export type IrSave = { version: number; manualSlots: number; autoSlots: number; compressed: boolean; notes: Record<string, string>; parts: IrSavePart[] }

export type IrScene = { id: string; name: string; kind: string; loadOrder: number; phase: number; phaseName: string }
export type IrScenes = { phases: string[]; scenes: IrScene[] }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const list = (p: Project, doc: string, section: string): Entity[] => {
  const v = p.documents[doc]?.data[section]
  return Array.isArray(v) ? (v as Entity[]).filter((e) => str(e.name)) : []
}
const form = (p: Project, doc: string, section: string): Record<string, unknown> => {
  const v = p.documents[doc]?.data[section]
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export function buildStory(p: Project): IrStory {
  const quests = list(p, 'design.story', 'quests')
  const known = new Set(quests.map((q) => String(q.id)))
  const choices = list(p, 'design.story', 'choices')
  const knownChoices = new Set(choices.map((c) => String(c.id)))
  const onlyQuests = (v: unknown) => ids(v).filter((x) => known.has(x))
  return {
    quests: quests.map((q) => ({
      id: String(q.id),
      name: str(q.name),
      words: words(str(q.name)),
      type: str(q.type),
      requires: onlyQuests(q.requires),
      blocks: onlyQuests(q.blocks),
      objectives: (Array.isArray(q.objectives) ? (q.objectives as { text?: unknown }[]) : []).map((o) => str(o?.text)).filter(Boolean),
      ...(num(q.estMinutes) !== undefined && { minutes: num(q.estMinutes) }),
    })),
    choices: choices.map((c) => ({
      id: String(c.id),
      name: str(c.name),
      words: words(str(c.name)),
      decision: str(c.decision) || str(c.name),
      ...(known.has(String(c.quest)) && { quest: String(c.quest) }),
      leadsTo: onlyQuests(c.leadsTo),
      blocks: onlyQuests(c.blocks),
    })),
    endings: list(p, 'design.story', 'endings').map((e) => ({
      id: String(e.id),
      name: str(e.name),
      words: words(str(e.name)),
      kind: str(e.kind),
      requiresQuests: onlyQuests(e.requiresQuests),
      requiresChoices: ids(e.requiresChoices).filter((x) => knownChoices.has(x)),
    })),
  }
}

/** “3 manual slots + 3 rotating autosaves” in the requirements, for plans without the slot fields. */
const slotsIn = (text: string, what: RegExp) => {
  const m = new RegExp(`(\\d+)\\s*(?:rotating\\s+)?${what.source}`, 'i').exec(text)
  return m ? Number(m[1]) : undefined
}

export function buildSave(p: Project): IrSave {
  const s = form(p, 'technical.save', 'save')
  const modules = new Map(list(p, 'technical.architecture', 'modules').map((m) => [String(m.id), str(m.name)]))
  const requirements = str(s.requirements)
  const notes = Object.fromEntries((['requirements', 'format', 'versioning', 'autosave', 'performance'] as const).map((k) => [k, str(s[k])]).filter(([, v]) => v))
  const version = Math.max(1, Math.floor(num(s.version) ?? 1))
  return {
    version,
    manualSlots: Math.max(0, Math.floor(num(s.manualSlots) ?? slotsIn(requirements, /manual/) ?? 3)),
    autoSlots: Math.max(0, Math.floor(num(s.autoSlots) ?? slotsIn(requirements, /auto ?saves?/) ?? 1)),
    compressed: /compress|gzip/i.test(str(s.format)),
    notes,
    parts: list(p, 'technical.save', 'parts').map((e) => ({
      id: String(e.id),
      name: str(e.name),
      words: words(str(e.name)),
      key: words(str(e.name)).map((w) => w.toLowerCase()).join('_'),
      ...(modules.get(String(e.module)) && { module: modules.get(String(e.module)) }),
      since: Math.min(version, Math.max(1, Math.floor(num(e.since) ?? 1))),
      notes: str(e.notes),
    })),
  }
}

export function buildScenes(p: Project): IrScenes {
  const phases = list(p, 'overview.roadmap', 'phases')
  const index = new Map(phases.map((x, i) => [String(x.id), i]))
  return {
    phases: phases.map((x) => str(x.name)),
    scenes: list(p, 'technical.architecture', 'scenes')
      .map((s) => ({ id: String(s.id), name: str(s.name), kind: str(s.kind), loadOrder: num(s.loadOrder) ?? 99, phase: index.get(String(s.phase)) ?? 0, phaseName: str(phases[index.get(String(s.phase)) ?? 0]?.name) }))
      .sort((a, b) => a.loadOrder - b.loadOrder),
  }
}
