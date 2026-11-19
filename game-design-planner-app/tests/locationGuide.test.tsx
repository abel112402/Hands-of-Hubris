import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../src/core/i18n'
import en from '../src/core/i18n/en.json'
import hu from '../src/core/i18n/hu.json'
import { App } from '../src/App'
import { collectHints, makeContext } from '../src/core/hints/engine'
import { hasHandEdits, locationsOf, staleLocations, unmappedLocations, untypedLocations } from '../src/core/location/analysis'
import { addObject } from '../src/core/location/edit'
import { generateMap, regenerateLayer } from '../src/core/location/generate'
import { mapOf } from '../src/core/location/schema'
import { createProject } from '../src/core/model/project'
import type { Entity, Project } from '../src/core/model/types'
import { useStore } from '../src/core/store/store'
import { WORLD_DOC } from '../src/core/world'
import { WORLD_GUIDE } from '../src/modules/guides/world'
import { MODULE_HELP } from '../src/ui/help'
import { applyExample, previewProject } from '../src/ui/guides/ExamplePicker'

afterEach(cleanup)

function build(locations: Entity[], biomes: Entity[] = []): Project {
  const p = createProject('Location hints')
  p.documents[WORLD_DOC].data.locations = locations
  p.documents[WORLD_DOC].data.biomes = biomes
  return p
}
const mapped = (p: Project, location: Entity, seed = 3): Entity => ({ ...location, map: generateMap(p, location, seed) })
const hints = (p: Project, docId = WORLD_DOC) => collectHints(makeContext(p, { docId })).filter((h) => h.ruleId.startsWith('world.loc'))
const ruleIds = (p: Project, docId = WORLD_DOC) => hints(p, docId).map((h) => h.ruleId)
const step = (id: string) => WORLD_GUIDE.steps.find((s) => s.id === id)!

describe('location analysis and hints', () => {
  const blank = createProject('blank')
  const village: Entity = { id: 'v', name: 'Oakham', type: 'Village' }

  it('sorts locations by what is still open', () => {
    const p = build([{ id: 'x', name: 'Somewhere' }, village, mapped(blank, { id: 'c', name: 'Crypt', type: 'Dungeon' }), { ...mapped(blank, village), id: 'old', name: 'Was a village', type: 'Cave' }])
    expect(untypedLocations(p).map((l) => l.id)).toEqual(['x'])
    expect(unmappedLocations(p).map((l) => l.id)).toEqual(['v', 'old'])
    expect(staleLocations(p)).toEqual([])
    const done = mapped(blank, village)
    const rerolled = { ...done, map: regenerateLayer(blank, done, mapOf(done)!, 'roads') }
    expect(staleLocations(build([rerolled])).map((l) => l.id)).toEqual(['v'])
    expect(hasHandEdits(done)).toBe(false)
    expect(hasHandEdits({ ...done, map: addObject(mapOf(done)!, 'vegetation', 'tree', [10, 10], 'm-1') })).toBe(true)
  })

  it('stays quiet without locations and in other editors', () => {
    expect(ruleIds(build([]))).toEqual([])
    expect(ruleIds(build([{ id: 'x', name: 'Somewhere' }]), 'design.town')).toEqual([])
  })

  it('points out a missing type, a missing map and stale layers, never as important', () => {
    expect(ruleIds(build([{ id: 'x', name: 'Somewhere' }]))).toEqual(['world.locType'])
    expect(ruleIds(build([village]))).toEqual(['world.locMap'])
    const done = mapped(blank, village)
    expect(ruleIds(build([done]))).toEqual([])
    const stale = build([{ ...done, map: regenerateLayer(blank, done, mapOf(done)!, 'roads') }])
    expect(ruleIds(stale)).toEqual(['world.locStale'])
    for (const p of [build([{ id: 'x', name: 'Somewhere' }]), build([village]), stale]) {
      for (const h of hints(p)) {
        expect(h.severity).not.toBe('important')
        expect(h.target).toMatchObject({ docId: WORLD_DOC, sectionId: 'locations' })
      }
    }
  })

  it('asks for a biome only when the world has biomes', () => {
    const done = mapped(blank, village)
    const biomes = [{ id: 'm', name: 'Meadow', role: 'Starter' }]
    expect(ruleIds(build([done], biomes))).toEqual(['world.locBiome'])
    expect(ruleIds(build([{ ...done, biome: 'm' }], biomes))).toEqual([])
  })

  it('has English and Hungarian text for every location hint', () => {
    for (const key of ['worldLocType', 'worldLocMap', 'worldLocStale', 'worldLocBiome']) {
      for (const lang of [en, hu] as { hints: Record<string, { title?: string; body?: string }> }[]) {
        expect(lang.hints[key]?.title, key).toBeTruthy()
        expect(lang.hints[key]?.body, key).toContain('{{names}}')
      }
    }
  })
})

describe('location guide and help', () => {
  it('ticks the location steps from the data', () => {
    const blank = createProject('blank')
    const village: Entity = { id: 'v', name: 'Oakham', type: 'Village' }
    expect(step('locations').done!(build([]))).toBe(false)
    expect(step('locations').done!(build([{ id: 'x', name: 'Somewhere' }]))).toBe(false)
    expect(step('locations').done!(build([village]))).toBe(true)
    expect(step('maps').done!(build([village]))).toBe(false)
    const done = mapped(blank, village)
    expect(step('maps').done!(build([done]))).toBe(true)
    expect(step('handEdit').done!(build([done]))).toBe(false)
    expect(step('handEdit').done!(build([{ ...done, map: addObject(mapOf(done)!, 'vegetation', 'tree', [10, 10], 'm-1') }]))).toBe(true)
  })

  it('previews each example on a copy and inserts the same map as one undo step', () => {
    const examples = WORLD_GUIDE.examples.filter((e) => e.section === 'locations')
    expect(examples.length).toBe(4)
    for (const ex of examples) {
      useStore.getState().loadProject(createProject('T'), 'x')
      const before = useStore.getState().project
      const preview = locationsOf(previewProject(before, ex))
      expect(locationsOf(before)).toEqual([])
      expect(preview.length).toBe(1)
      expect(mapOf(preview[0])?.type, ex.id).toBe(preview[0].type)
      applyExample(ex)
      const inserted = locationsOf(useStore.getState().project)
      expect(inserted.length).toBe(1)
      expect(mapOf(inserted[0])).toEqual(mapOf(preview[0]))
      // Applying it again adds nothing: the name is already there.
      applyExample(ex)
      expect(locationsOf(useStore.getState().project).length).toBe(1)
      useStore.getState().undo()
      expect(locationsOf(useStore.getState().project)).toEqual([])
    }
  })

  it('links landmark buildings from the Town planner in the village example', () => {
    const p = previewProject(createProject('T'), WORLD_GUIDE.examples.find((e) => e.id === 'riverVillage')!)
    const map = mapOf(locationsOf(p)[0])!
    expect(map.layers.landmarks.objects.filter((o) => o.kind === 'landmark').map((o) => o.label).sort()).toEqual(['School', 'Tavern'])
  })

  it('explains locations in the help, the concept card and the empty state', () => {
    expect(MODULE_HELP[WORLD_DOC].tips.filter((t) => t.startsWith('Locations')).length).toBe(2)
    expect(WORLD_GUIDE.concepts.locations.diagram).toBe('mapLayers')
    expect(WORLD_GUIDE.empty.locations).toBeTruthy()
  })

  it('shows the teaching empty state, the concept card and the example picker in the editor', async () => {
    useStore.getState().loadProject(createProject('UI'), 'x')
    window.location.hash = '#/doc/design.world?s=locations'
    render(<App />)
    expect(await screen.findByText(/Locations are the places the player visits/)).toBeTruthy()
    expect(screen.getByText(/How a location map is built/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /example/i })[0])
    expect(await screen.findByText('Walled river village')).toBeTruthy()
    expect(screen.getByText('Crypt with a boss room')).toBeTruthy()
  })
})
