import type { Project } from './model/types'

export const WORLD_DOC = 'design.world'

const data = (project: Project) => project.documents[WORLD_DOC]?.data ?? {}
const biomes = (project: Project): any[] => data(project).biomes ?? []
const nodes = (project: Project): any[] => data(project).progression?.nodes ?? []
const edges = (project: Project): any[] => data(project).progression?.edges ?? []
const zones = (project: Project): any[] => (data(project).map?.items ?? []).filter((i: any) => i.kind === 'Biome zone')

const ENTRY_WORD: Record<string, string> = { Story: 'story', Faction: 'faction', Boss: 'boss' }

/** Nodes that stand for a biome: tagged with its id. */
const nodesOf = (project: Project, biomeId: string) => nodes(project).filter((n) => n.refId === biomeId)

/** Biomes whose progression node has no incoming connection, or that are absent from the graph. Starters and optional biomes are exempt. */
export function unreachedBiomes(project: Project) {
  return biomes(project).filter((b) => {
    if (b.optional || b.role === 'Starter') return false
    const ns = nodesOf(project, b.id)
    return ns.length === 0 || !ns.some((n) => edges(project).some((e) => e.target === n.id))
  })
}

export const biomesWithoutEntry = (project: Project) =>
  biomes(project).filter((b) => b.role !== 'Starter' && !b.optional && (!b.entryType || b.entryType === 'None') && !String(b.entry ?? '').trim())

export const biomesWithoutZone = (project: Project) =>
  biomes(project).filter((b) => !zones(project).some((z) => z.refId === b.id))

export const unlinkedZones = (project: Project) => {
  const ids = new Set(biomes(project).map((b) => b.id))
  return zones(project).filter((z) => !z.refId || !ids.has(z.refId))
}

/** A biome whose structured entry type names a kind of unlock that none of its incoming connections use. */
export function graphDisagreements(project: Project) {
  return biomes(project).filter((b) => {
    const word = ENTRY_WORD[b.entryType]
    if (!word) return false
    const incoming = nodesOf(project, b.id).flatMap((n) => edges(project).filter((e) => e.target === n.id))
    return incoming.length > 0 && !incoming.some((e) => String(e.kind ?? '').includes(word))
  })
}

export const outpostsMissing = (project: Project) => {
  const outposts: any[] = data(project).outposts ?? []
  const lacks = (o: any, refs: string, text: string) => !(o[refs]?.length) && !String(o[text] ?? '').trim()
  return {
    noReward: outposts.filter((o) => lacks(o, 'rewardRefs', 'reward')),
    noDefenders: outposts.filter((o) => lacks(o, 'defenderRefs', 'defenders')),
  }
}

export const biomesWithoutEnemies = (project: Project) => biomes(project).filter((b) => !(b.enemies?.length) && !(b.bosses?.length))
