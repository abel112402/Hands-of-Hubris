import type { CollectionSection, FieldDef, PlannerModule, Project, Registry, SectionDef } from '../model/types'
import { designModules } from '../../modules/design'
import { overviewModules } from '../../modules/overview'
import {
  artAudioModules,
  productionModules,
  qaModules,
  technicalModules,
  templateModules,
} from '../../modules/technical'
import { releaseSeed } from '../../modules/seeds'

export const MODULES: PlannerModule[] = [
  ...overviewModules,
  ...designModules,
  ...technicalModules,
  ...artAudioModules,
  ...productionModules,
  ...qaModules,
  ...templateModules,
]

export const GROUPS: { id: PlannerModule['group']; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'design', label: 'Game Design' },
  { id: 'technical', label: 'Technical' },
  { id: 'artAudio', label: 'Art & Audio' },
  { id: 'production', label: 'Production' },
  { id: 'qa', label: 'QA' },
  { id: 'templates', label: 'Templates' },
  { id: 'custom', label: 'Custom' },
]

export const getModule = (id: string) => MODULES.find((m) => m.id === id)

/** Sections of a module with user-defined custom fields merged in. */
export function getSections(mod: PlannerModule, registry: Registry): SectionDef[] {
  const base = typeof mod.sections === 'function' ? mod.sections(registry) : mod.sections
  return base.map((sec) => {
    if (sec.kind !== 'collection') return sec
    const extra = registry.customFields[`${mod.id}/${sec.id}`]
    return extra?.length ? { ...sec, fields: [...sec.fields, ...extra] } : sec
  })
}

export const getSection = (mod: PlannerModule, registry: Registry, id: string) =>
  getSections(mod, registry).find((x) => x.id === id)

export const collectionFields = (sec: CollectionSection): FieldDef[] => sec.fields

export function emptySectionData(sec: SectionDef, withSeed = false, makeId: () => string): unknown {
  switch (sec.kind) {
    case 'form':
      return {}
    case 'collection':
      return withSeed && sec.seed ? sec.seed.map((e) => ({ id: makeId(), ...e })) : []
    case 'matrix':
      return { cells: {} }
    case 'graph':
      return { nodes: [], edges: [] }
    case 'canvas':
      return { items: [] }
    case 'checklist':
      return { groups: withSeed ? releaseSeed(makeId) : [] }
    case 'richtext':
      return ''
    case 'formulas':
      return { items: [] }
  }
}

export function ensureDocument(project: Project, mod: PlannerModule, makeId: () => string, withSeed = false) {
  const sections = getSections(mod, project.registry)
  const doc = project.documents[mod.id] ?? { moduleVersion: mod.version, data: {} }
  for (const sec of sections) {
    if (doc.data[sec.id] === undefined) {
      doc.data[sec.id] = emptySectionData(sec, withSeed && (sec.kind !== 'checklist' || mod.id === 'production.release'), makeId)
    }
  }
  project.documents[mod.id] = doc
  return doc
}
