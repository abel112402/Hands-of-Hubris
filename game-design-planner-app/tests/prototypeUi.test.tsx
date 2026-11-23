import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '../src/core/i18n'
import { App } from '../src/App'
import { useStore } from '../src/core/store/store'
import { deserializeProject } from '../src/core/persistence/serialize'
import { DATA_DOC } from '../src/core/dataDriven'
import { mapOf } from '../src/core/location/schema'
import { ObjectPanel } from '../src/ui/editors/location/ObjectPanel'
import type { Entity, Project } from '../src/core/model/types'
import { buildReferenceSlice, IDS } from './fixtures/referenceSlice3d'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 6: in Engine export, the user sees what will really work, what
 * blocks playing, and where each missing piece is filled; and can place a player start and an item on the map.
 */
const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
afterEach(cleanup)

async function open(p: Project) {
  useStore.getState().loadProject(p, 'x')
  window.location.hash = `#/doc/${DATA_DOC}?s=schemas`
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Engine export' }))
  return screen.findByRole('region', { name: 'Playable prototype' })
}
const proto = () => useStore.getState().project.documents['technical.architecture'].data.prototype as Record<string, unknown>
const row = (panel: HTMLElement, label: string) => within(panel).getByRole('checkbox', { name: label }).closest('tr') as HTMLElement

describe('Playable prototype panel', () => {
  it('shows the reference slice as playable: every chosen system works and nothing blocks', async () => {
    const panel = await open(buildReferenceSlice())
    expect(within(panel).getByRole('status').textContent).toContain('Playable')
    expect((within(panel).getByLabelText('Camera / perspective') as HTMLSelectElement).value).toBe('Third-person')
    expect(row(panel, 'Interaction (pick up, use)').textContent).toContain('Working module, set up by the plan')
    expect(row(panel, 'Player movement and camera').textContent).toContain('Working module, set up by the plan')
    expect(row(panel, 'Inventory').textContent).toContain('Working module, set up by the plan')
    expect(row(panel, 'Save and load').textContent).toContain('Working module, set up by the plan')
    expect(within(panel).queryByRole('region', { name: 'Frames you finish in code' })).toBeNull()
    expect(row(panel, 'Inventory').textContent).toContain('Data complete')
    expect(within(panel).queryByRole('region', { name: 'Blocks playing' })).toBeNull()
    expect(panel.textContent).toContain('Placeholders: 4 records have no art in the plan yet')
  })

  it('points an incomplete plan to where each missing piece is filled', async () => {
    const p = buildReferenceSlice()
    delete (p.documents['design.story'].data.quests as Entity[])[0].collectItems
    for (const l of Object.values(mapOf((p.documents['design.world'].data.locations as Entity[])[0])!.layers)) for (const o of l.objects) delete o.spawn
    const panel = await open(p)
    const movement = row(panel, 'Player movement and camera')
    expect(movement.textContent).toContain('A player start on a location map')
    expect(within(movement).getByRole('link', { name: /Fix in World & Biomes › Locations/ }).getAttribute('href')).toBe('#/doc/design.world?s=locations')
    expect(within(row(panel, 'Quests and rewards')).getByRole('link', { name: /Fix in Story & Quests › Quests \(collectItems\)/ }).getAttribute('href')).toBe('#/doc/design.story?s=quests')
    expect(within(panel).getByRole('status').textContent).toMatch(/Not playable yet — 7 blocking problems/)
  })

  it('changes the profile and systems as undoable steps, and offers to choose a missing dependency', async () => {
    const panel = await open(buildReferenceSlice())
    fireEvent.change(within(panel).getByLabelText('Camera / perspective'), { target: { value: 'First-person' } })
    expect(proto().perspective).toBe('First-person')
    expect(within(panel).getByRole('region', { name: 'Blocks playing' }).textContent).toMatch(/Camera \/ perspective “First-person” is not supported for this engine\. Supported: Third-person\./)
    useStore.getState().undo()
    expect(proto().perspective).toBe('Third-person')

    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Interaction (pick up, use)' }))
    expect(proto().interaction).toBeUndefined()
    fireEvent.click(within(row(panel, 'Inventory')).getByRole('button', { name: 'Choose Interaction (pick up, use)' }))
    expect(proto().interaction).toBe(true)
  })

  it('explains that a plan without a prototype gets none, and opts in from the first choice', async () => {
    const panel = await open(deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project)
    expect(panel.textContent).toContain('This plan asks for no playable prototype')
    expect(within(panel).queryByRole('status')).toBeNull()
    fireEvent.change(within(panel).getByLabelText('Dimension'), { target: { value: '3D' } })
    expect(within(panel).getByRole('status').textContent).toMatch(/Not playable yet/)
    expect(within(panel).getByRole('region', { name: 'Blocks playing' }).textContent).toMatch(/choose the camera \/ perspective/)
  })
})

describe('map object: gameplay role', () => {
  it('marks an object as the player start or an item to pick up, with item and amount', () => {
    const p = buildReferenceSlice()
    useStore.getState().loadProject(p, 'x')
    const map = mapOf((p.documents['design.world'].data.locations as Entity[])[0])!
    const object = Object.values(map.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.pickup)!
    const commit = vi.fn()
    render(<ObjectPanel map={map} object={{ ...object, spawn: undefined }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    fireEvent.change(screen.getByLabelText('Gameplay'), { target: { value: 'item' } })
    const placed = (m: ReturnType<typeof mapOf>) => Object.values(m!.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.pickup)!
    expect(placed(commit.mock.calls[0][0]).spawn).toEqual({ role: 'item', refId: IDS.itemKey, count: 1 })

    cleanup()
    render(<ObjectPanel map={map} object={{ ...object, spawn: { role: 'item', refId: IDS.itemKey, count: 1 } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    fireEvent.change(screen.getByLabelText('Item to pick up'), { target: { value: IDS.itemCoin } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toMatchObject({ role: 'item', refId: IDS.itemCoin })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '0' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toMatchObject({ count: 1 })
    fireEvent.change(screen.getByLabelText('Gameplay'), { target: { value: 'player' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toEqual({ role: 'player' })
    fireEvent.change(screen.getByLabelText('Gameplay'), { target: { value: '' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toBeUndefined()
  })

  it('marks an object as an enemy of Combat, picked from the planned enemies', () => {
    const p = buildReferenceSlice()
    p.documents['design.combat'].data.enemies = [...(p.documents['design.combat'].data.enemies as Entity[]), { id: 'refEnemyCrow', name: 'Crow', hp: 5, damage: 1, attackRate: 1 }]
    useStore.getState().loadProject(p, 'x')
    const map = mapOf((p.documents['design.world'].data.locations as Entity[])[0])!
    const object = Object.values(map.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.pickup)!
    const commit = vi.fn()
    const placed = (m: ReturnType<typeof mapOf>) => Object.values(m!.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.pickup)!
    render(<ObjectPanel map={map} object={{ ...object, spawn: undefined }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    fireEvent.change(screen.getByLabelText('Gameplay'), { target: { value: 'enemy' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toEqual({ role: 'enemy', refId: IDS.enemy })

    cleanup()
    render(<ObjectPanel map={map} object={{ ...object, spawn: { role: 'enemy', refId: IDS.enemy } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    fireEvent.change(screen.getByLabelText('Enemy'), { target: { value: 'refEnemyCrow' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toEqual({ role: 'enemy', refId: 'refEnemyCrow' })

    cleanup()
    render(<ObjectPanel map={map} object={{ ...object, spawn: { role: 'enemy', refId: 'ghost' } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    expect(screen.getByRole('option', { name: 'Unknown enemy (ghost)' })).toBeTruthy()
  })

  it('marks an object as an NPC of NPC dialogue, picked from the planned characters', () => {
    const p = buildReferenceSlice()
    p.documents['design.story'].data.characters = [...(p.documents['design.story'].data.characters as Entity[]), { id: 'refCharTess', name: 'Tess' }]
    useStore.getState().loadProject(p, 'x')
    const map = mapOf((p.documents['design.world'].data.locations as Entity[])[0])!
    const object = Object.values(map.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.pickup)!
    const commit = vi.fn()
    const placed = (m: ReturnType<typeof mapOf>) => Object.values(m!.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.pickup)!
    render(<ObjectPanel map={map} object={{ ...object, spawn: undefined }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    fireEvent.change(screen.getByLabelText('Gameplay'), { target: { value: 'npc' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toEqual({ role: 'npc', refId: IDS.keeper })

    cleanup()
    render(<ObjectPanel map={map} object={{ ...object, spawn: { role: 'npc', refId: IDS.keeper } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    fireEvent.change(screen.getByLabelText('Character'), { target: { value: 'refCharTess' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toEqual({ role: 'npc', refId: 'refCharTess' })

    cleanup()
    render(<ObjectPanel map={map} object={{ ...object, spawn: { role: 'npc', refId: 'ghost' } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    expect(screen.getByRole('option', { name: 'Unknown character (ghost)' })).toBeTruthy()
  })

  it('gives a placed enemy a patrol route, picked from the lines of the map', () => {
    const p = buildReferenceSlice()
    useStore.getState().loadProject(p, 'x')
    const map = mapOf((p.documents['design.world'].data.locations as Entity[])[0])!
    const rat = Object.values(map.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.enemySpawn)!
    const commit = vi.fn()
    const placed = (m: ReturnType<typeof mapOf>) => Object.values(m!.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.enemySpawn)!
    render(<ObjectPanel map={map} object={{ ...rat, spawn: { role: 'enemy', refId: IDS.enemy } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    const select = screen.getByLabelText('Patrol route') as HTMLSelectElement
    expect(select.value).toBe('')
    expect(screen.getByRole('option', { name: 'Rat run' })).toBeTruthy()
    fireEvent.change(select, { target: { value: IDS.ratRun } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toEqual({ role: 'enemy', refId: IDS.enemy, route: IDS.ratRun })

    cleanup()
    render(<ObjectPanel map={map} object={{ ...rat, spawn: { role: 'enemy', refId: IDS.enemy, route: IDS.ratRun } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    fireEvent.change(screen.getByLabelText('Patrol route'), { target: { value: '' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toEqual({ role: 'enemy', refId: IDS.enemy })

    cleanup()
    render(<ObjectPanel map={map} object={{ ...rat, spawn: { role: 'enemy', refId: IDS.enemy, route: 'ghost' } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    expect(screen.getByRole('option', { name: 'Unknown line (ghost)' })).toBeTruthy()
  })

  it('marks an object as a merchant of Trade, picked from the planned merchants', () => {
    const p = buildReferenceSlice()
    useStore.getState().loadProject(p, 'x')
    const map = mapOf((p.documents['design.world'].data.locations as Entity[])[0])!
    const object = Object.values(map.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.pickup)!
    const commit = vi.fn()
    const placed = (m: ReturnType<typeof mapOf>) => Object.values(m!.layers).flatMap((l) => l.objects).find((o) => o.id === IDS.pickup)!
    render(<ObjectPanel map={map} object={{ ...object, spawn: undefined }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    fireEvent.change(screen.getByLabelText('Gameplay'), { target: { value: 'merchant' } })
    expect(placed(commit.mock.calls.at(-1)![0]).spawn).toEqual({ role: 'merchant', refId: IDS.merchant })
    cleanup()
    render(<ObjectPanel map={map} object={{ ...object, spawn: { role: 'merchant', refId: 'ghost' } }} layerLabel="Labels" commit={commit} onDuplicate={() => {}} onDeleted={() => {}} onMask={() => {}} />)
    expect(screen.getByRole('option', { name: 'Unknown merchant (ghost)' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Peddler' })).toBeTruthy()
  })
})
