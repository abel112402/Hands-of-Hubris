import { describe, expect, it } from 'vitest'
import '../src/core/i18n'
import en from '../src/core/i18n/en.json'
import hu from '../src/core/i18n/hu.json'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { generateMap } from '../src/core/location/generate'
import type { LocationMap, MapObject } from '../src/core/location/types'
import { createProject } from '../src/core/model/project'
import type { Entity, Project } from '../src/core/model/types'
import { WORLD_DOC } from '../src/core/world'
import { WORLD_GUIDE } from '../src/modules/guides/world'
import { MODULE_HELP } from '../src/ui/help'
import { previewProject } from '../src/ui/guides/ExamplePicker'

const build = (locations: Entity[]): Project => {
  const p = createProject('Hints')
  p.documents[WORLD_DOC].data.locations = locations
  return p
}
const mapped = (location: Entity, seed = 3): Entity => ({ ...location, map: generateMap(createProject('x'), location, seed) })
const ruleIds = (p: Project) => collectHints(makeContext(p, { docId: WORLD_DOC })).filter((h) => h.ruleId.startsWith('world.loc')).map((h) => h.ruleId)
const step = (id: string) => WORLD_GUIDE.steps.find((s) => s.id === id)!
const withLayer = (map: LocationMap, layer: string, objects: MapObject[]): LocationMap => ({ ...map, layers: { ...map.layers, [layer]: { ...map.layers[layer], objects } } })

describe('hints from the map checks', () => {
  const vault = mapped({ id: 'd', name: 'Vault', type: 'Dungeon', keyLocks: 1, biome: '' })

  it('stay quiet for generated maps', () => {
    const village = mapped({ id: 'v', name: 'Oakham', type: 'Village' })
    const house = mapped({ id: 'h', name: 'Cottage', type: 'Dwelling', footprint: 'House' })
    expect(ruleIds(build([vault, village, house])).filter((r) => ['world.locLocks', 'world.locLinks', 'world.locLayout'].includes(r))).toEqual([])
  })

  it('point out a lock without its key, a link to a lost place and a broken house rule, never as important', () => {
    const map = vault.map as LocationMap
    const noKey = { ...vault, map: withLayer(map, 'contents', map.layers.contents.objects.filter((o) => o.kind !== 'key')) }
    expect(ruleIds(build([noKey]))).toContain('world.locLocks')
    const door = map.layers.doors.objects[0]
    const linked = { ...vault, map: withLayer(map, 'doors', [{ ...door, link: { locationId: 'gone' } }, ...map.layers.doors.objects.slice(1)]) }
    expect(ruleIds(build([linked]))).toContain('world.locLinks')
    const house = mapped({ id: 'h', name: 'Cottage', type: 'Dwelling', footprint: 'House' })
    const hm = house.map as LocationMap
    const kitchenFront = { ...house, map: withLayer(hm, 'rooms', hm.layers.rooms.objects.map((r) => ({ ...r, label: 'Kitchen' }))) }
    expect(ruleIds(build([kitchenFront]))).toContain('world.locLayout')
    const ours = collectHints(makeContext(build([noKey, kitchenFront]), { docId: WORLD_DOC })).filter((h) => h.ruleId.startsWith('world.loc'))
    expect(ours.length).toBeGreaterThan(0)
    for (const h of ours) expect(h.severity, h.ruleId).not.toBe('important')
  })

  it('have English and Hungarian texts', () => {
    for (const key of ['worldLocLocks', 'worldLocLinks', 'worldLocLayout']) {
      for (const lang of [en, hu] as { hints: Record<string, { title?: string; body?: string }> }[]) {
        expect(lang.hints[key]?.title, key).toBeTruthy()
        expect(lang.hints[key]?.body, key).toContain('{{names}}')
      }
    }
  })
})

describe('guide and help for the new map tools', () => {
  it('ticks linked maps, the world map and playable maps from the data', () => {
    const village = mapped({ id: 'v', name: 'Oakham', type: 'Village' })
    expect(step('linkedMap').done!(build([village]))).toBe(false)
    expect(step('linkedMap').done!(build([village, mapped({ id: 'h', name: 'House', type: 'Dwelling', parent: 'v' })]))).toBe(true)
    expect(step('worldMap').done!(build([village]))).toBe(false)
    expect(step('worldMap').done!(build([village, mapped({ id: 'w', name: 'World', type: 'World' })]))).toBe(true)
    expect(step('playable').done!(build([]))).toBe(false)
    expect(step('playable').done!(build([village]))).toBe(true)
    const map = village.map as LocationMap
    const broken = { ...village, map: withLayer(map, 'buildings', [{ ...map.layers.buildings.objects[0], link: { locationId: 'gone' } }, ...map.layers.buildings.objects.slice(1)]) }
    expect(step('playable').done!(build([broken]))).toBe(false)
  })

  it('offers a world map example that places the locations already there', () => {
    const ex = WORLD_GUIDE.examples.find((e) => e.id === 'knownLands')!
    const before = build([{ id: 'v', name: 'Oakham', type: 'Village' }])
    const after = previewProject(before, ex)
    const world = (after.documents[WORLD_DOC].data.locations as Entity[]).find((l) => l.type === 'World')!
    const sites = (world.map as LocationMap).layers.sites.objects
    expect(sites.map((s) => s.link?.locationId)).toEqual(['v'])
  })

  it('explains sliders, linked maps, the gameplay layers and export in the help', () => {
    const tips = MODULE_HELP[WORLD_DOC].tips.join('\n')
    for (const words of ['Sliders above the map', 'Create linked map', 'Player view', 'Universal VTT', 'Versions']) expect(tips).toContain(words)
    expect(tips).not.toContain('exported as SVG next to the document')
  })
})
