import type { CollectionSection, Entity, Project } from './model/types'

/**
 * Field groups that do not apply to an entity, from the section's `groupFilter` profile.
 * Empty when the section has no filter, the entity has no kind yet, or its kind has no profile.
 */
export function hiddenGroups(project: Project, docId: string, sec: CollectionSection, entity: Entity): Set<string> {
  const gf = sec.groupFilter
  if (!gf) return new Set()
  const kind = entity[gf.field]
  if (!kind) return new Set()
  const profiles = project.documents[docId]?.data[gf.profiles.section]
  const profile = Array.isArray(profiles) ? profiles.find((p: Entity) => p[gf.profiles.key] === kind) : undefined
  if (!profile) return new Set()
  return new Set(Object.entries(gf.groups).filter(([, flag]) => !profile[flag]).map(([group]) => group))
}
