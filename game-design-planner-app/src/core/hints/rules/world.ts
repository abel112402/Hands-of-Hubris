import { biomesWithoutEnemies, biomesWithoutEntry, biomesWithoutZone, graphDisagreements, levelInversions, outpostsMissing, unlinkedZones, unlockPath, unreachedBiomes, WORLD_DOC as DOC } from '../../world'
import { locationsOf, locationsWithChecks, locationsWithoutBiome, staleLocations, unmappedLocations, untypedLocations } from '../../location/analysis'
import type { Entity, Project } from '../../model/types'
import type { Hint, HintRule } from '../types'
import { entitiesOf, hintId, shortList } from '../util'

type Draft = Omit<Hint, 'id' | 'scope' | 'target' | 'titleKey' | 'bodyKey'> & { key: string; sectionId: string; entityId?: string }

const hint = (d: Draft): Hint => ({
  id: hintId(d.ruleId, d.entityId),
  ruleId: d.ruleId,
  severity: d.severity,
  scope: d.entityId ? 'entity' : 'section',
  target: { docId: DOC, sectionId: d.sectionId, entityId: d.entityId },
  titleKey: `hints.${d.key}.title`,
  bodyKey: `hints.${d.key}.body`,
  params: d.params,
  action: d.action ?? { kind: 'goto', docId: DOC, sectionId: d.sectionId },
})

const active = (id: string, evaluate: HintRule['evaluate']): HintRule => ({
  id,
  scope: 'section',
  appliesTo: ({ project, docId }) => docId === DOC && entitiesOf(project, DOC, 'biomes').length > 0,
  evaluate,
})

const names = (l: any[]) => shortList(l.map((x) => String(x.name ?? x.label ?? '')))

/** Advisory world checks. Isolated or optional content is legitimate, so nothing exceeds 'suggest'. */
export const worldRules: HintRule[] = [
  active('world.reach', ({ project }) => {
    const l = unreachedBiomes(project)
    return l.length ? [hint({ key: 'worldReach', ruleId: 'world.reach', severity: 'suggest', sectionId: 'progression', params: { count: l.length, names: names(l) } })] : []
  }),
  active('world.entry', ({ project }) => {
    const l = biomesWithoutEntry(project)
    return l.length ? [hint({ key: 'worldEntry', ruleId: 'world.entry', severity: 'info', sectionId: 'biomes', entityId: l[0].id, params: { count: l.length, names: names(l) } })] : []
  }),
  active('world.zones', ({ project }) => {
    const out: Hint[] = []
    const missing = biomesWithoutZone(project)
    if (missing.length) out.push(hint({ key: 'worldZones', ruleId: 'world.zones', severity: 'info', sectionId: 'map', params: { count: missing.length, names: names(missing) } }))
    const loose = unlinkedZones(project)
    if (loose.length) out.push(hint({ key: 'worldZoneLinks', ruleId: 'world.zoneLinks', severity: 'info', sectionId: 'map', params: { count: loose.length, names: names(loose) } }))
    return out
  }),
  active('world.outposts', ({ project }) => {
    const { noReward, noDefenders } = outpostsMissing(project)
    const l = [...new Set([...noReward, ...noDefenders])]
    return l.length ? [hint({ key: 'worldOutposts', ruleId: 'world.outposts', severity: 'info', sectionId: 'outposts', entityId: l[0].id, params: { count: l.length, names: names(l) } })] : []
  }),
  active('world.graph', ({ project }) => {
    const l = graphDisagreements(project)
    return l.length ? [hint({ key: 'worldGraph', ruleId: 'world.graph', severity: 'suggest', sectionId: 'progression', params: { count: l.length, names: names(l) } })] : []
  }),
  active('world.enemies', ({ project }) => {
    const l = biomesWithoutEnemies(project)
    return l.length ? [hint({ key: 'worldEnemies', ruleId: 'world.enemies', severity: 'info', sectionId: 'biomes', entityId: l[0].id, params: { count: l.length, names: names(l) } })] : []
  }),
  active('world.locked', ({ project }) => {
    const l = unlockPath(project).locked
    return l.length ? [hint({ key: 'worldLocked', ruleId: 'world.locked', severity: 'suggest', sectionId: 'biomes', entityId: l[0].id, params: { count: l.length, names: names(l) } })] : []
  }),
  active('world.levels', ({ project }) => {
    const l = levelInversions(project)
    return l.length ? [hint({ key: 'worldLevels', ruleId: 'world.levels', severity: 'info', sectionId: 'biomes', entityId: l[0].id, params: { count: l.length, names: names(l) } })] : []
  }),
  // Locations: a place may well stay a text-only entry, so these only point out what is still open.
  located('world.locType', (project) => untypedLocations(project), 'worldLocType', 'info'),
  located('world.locMap', (project) => unmappedLocations(project), 'worldLocMap', 'info'),
  located('world.locStale', (project) => staleLocations(project), 'worldLocStale', 'suggest'),
  located('world.locLocks', (project) => locationsWithChecks(project, 'locks'), 'worldLocLocks', 'suggest'),
  located('world.locLinks', (project) => locationsWithChecks(project, 'links'), 'worldLocLinks', 'suggest'),
  located('world.locLayout', (project) => locationsWithChecks(project, 'layout'), 'worldLocLayout', 'suggest'),
  located('world.locBiome', (project) => (entitiesOf(project, DOC, 'biomes').length ? locationsWithoutBiome(project) : []), 'worldLocBiome', 'info'),
]

/** A rule about the Locations section; quiet until there is a location. */
function located(id: string, find: (project: Project) => Entity[], key: string, severity: Hint['severity']): HintRule {
  return {
    id,
    scope: 'section',
    appliesTo: ({ project, docId }) => docId === DOC && locationsOf(project).length > 0,
    evaluate: ({ project }) => {
      const l = find(project)
      return l.length ? [hint({ key, ruleId: id, severity, sectionId: 'locations', entityId: l[0].id, params: { count: l.length, names: names(l) } })] : []
    },
  }
}
