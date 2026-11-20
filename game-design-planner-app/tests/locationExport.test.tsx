import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../src/core/persistence/file', async (original) => ({ ...(await original<typeof import('../src/core/persistence/file')>()), downloadText: vi.fn(), downloadBlob: vi.fn() }))

import '../src/core/i18n'
import { App } from '../src/App'
import { mapNav } from '../src/core/location/analysis'
import { exportAssets } from '../src/core/export/markdown'
import { LOCATION_JSON_FORMAT, locationJson } from '../src/core/location/export/json'
import { tiledMap, tilesetSvg, WALK_TILES } from '../src/core/location/export/tiled'
import { gridWalls, universalVtt } from '../src/core/location/export/vtt'
import { generateMap } from '../src/core/location/generate'
import { toRad } from '../src/core/location/geometry'
import { decodeRle } from '../src/core/location/raster'
import { getLocationType } from '../src/core/location/registry'
import type { LocationMap } from '../src/core/location/types'
import { createProject } from '../src/core/model/project'
import type { Entity } from '../src/core/model/types'
import { getModule } from '../src/core/modules/registry'
import { downloadText } from '../src/core/persistence/file'
import { useStore } from '../src/core/store/store'
import { WORLD_DOC } from '../src/core/world'

afterEach(cleanup)

const project = createProject('Export')
const dungeon: Entity = { id: 'd', name: 'Vault', type: 'Dungeon', size: 'Large', keyLocks: 1, secretRooms: 1, traps: true }
const vault = generateMap(project, dungeon, 7)!
const all = (map: LocationMap) => Object.values(map.layers).flatMap((l) => l.objects)

describe('engine data (JSON)', () => {
  it('holds every object with its metadata, in drawing order, without editor-only fields', () => {
    const json = locationJson(dungeon, vault)
    expect(json).toMatchObject({ format: LOCATION_JSON_FORMAT, version: 1, name: 'Vault', type: 'Dungeon', size: { w: vault.w, h: vault.h }, seed: vault.seed })
    expect(json.layers.map((l) => l.id)).toEqual(getLocationType('Dungeon')!.layers.map((l) => l.id))
    const objects = json.layers.flatMap((l) => l.objects)
    expect(objects).toHaveLength(all(vault).length)
    expect(objects.some((o) => 'pinned' in o || 'ctrl' in o)).toBe(false)
    expect(json.locks.map((l) => l.lock)).toContain('red')
    expect(json.keys.map((k) => k.key)).toEqual(['red'])
    expect(json.spawns.some((s) => s.role === 'boss')).toBe(true)
    expect(json.lights.length).toBeGreaterThan(0)
    expect(json.graph!.edges.some((e) => e.lock === 'red')).toBe(true)
    expect(JSON.parse(JSON.stringify(json))).toEqual(json)
  })

  it('carries the walkability and light grids, readable cell by cell', () => {
    const json = locationJson(dungeon, vault)
    const nav = mapNav(vault)
    const cost = decodeRle(json.nav.cost, json.nav.cols * json.nav.rows)!
    expect(Array.from(cost)).toEqual(Array.from(nav.cost, (c) => Math.min(51, c)))
    expect(Array.from(decodeRle(json.nav.tags, nav.cols * nav.rows)!)).toEqual(Array.from(nav.tags))
    const light = decodeRle(json.light.level, json.light.cols * json.light.rows)!
    expect(Math.max(...light)).toBeLessThanOrEqual(10)
    expect(json.nav.legend).toEqual({ water: 1, door: 2, locked: 4, secret: 8 })
  })

  it('leaves secrets, creatures and keys out of the player version', () => {
    const player = locationJson(dungeon, vault, { player: true }).layers.flatMap((l) => l.objects)
    expect(player.some((o) => o.secret || o.kind === 'marker' || o.kind === 'key' || o.kind === 'trap')).toBe(false)
  })

  it('goes into the project ZIP next to each map picture', () => {
    const p = createProject('Zip')
    p.documents[WORLD_DOC].data.locations = [{ ...dungeon, map: vault }]
    const assets = exportAssets(p, getModule(WORLD_DOC)!)
    expect(assets.map((a) => a.path)).toEqual(['location_maps/d.svg', 'location_maps/d.json'])
    expect(JSON.parse(assets[1].content as string).format).toBe(LOCATION_JSON_FORMAT)
  })
})

describe('Tiled map', () => {
  it('has the walkability layer, one object layer per map layer, and the map picture', () => {
    const tmj = tiledMap(dungeon, vault, { imageName: 'Vault.png' }) as Record<string, any>
    const nav = mapNav(vault)
    expect(tmj).toMatchObject({ type: 'map', orientation: 'orthogonal', infinite: false, width: nav.cols, height: nav.rows, tilewidth: nav.cell, tileheight: nav.cell })
    const [image, tiles, ...objectLayers] = tmj.layers
    expect(image).toMatchObject({ type: 'imagelayer', image: 'Vault.png' })
    expect(tiles.data).toHaveLength(nav.cols * nav.rows)
    expect(Math.min(...tiles.data)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...tiles.data)).toBeLessThanOrEqual(WALK_TILES.length)
    expect(objectLayers.map((l: any) => l.type)).toEqual(Array(objectLayers.length).fill('objectgroup'))
    expect(objectLayers.length).toBe(Object.keys(vault.layers).length)
    expect(tmj.tilesets[0]).toMatchObject({ firstgid: 1, tilecount: WALK_TILES.length, image: 'hoh-walkability.png' })
    expect(tmj.nextobjectid).toBe(all(vault).length + 1)
    expect((tilesetSvg(8).match(/<rect/g) ?? []).length).toBe(WALK_TILES.length)
  })

  it('places a turned box so Tiled turns it about its corner back onto the same centre, and keeps metadata as properties', () => {
    const tmj = tiledMap(dungeon, vault, { imageName: 'x.png' }) as Record<string, any>
    const objects = tmj.layers.slice(2).flatMap((l: any) => l.objects)
    const turned = all(vault).filter((o) => o.w && o.h && o.rot)
    expect(turned.length).toBeGreaterThan(0)
    // Where Tiled will draw each box's centre after turning it about its top-left corner.
    const centre = (t: any) => {
      const a = toRad(t.rotation)
      return [t.x + (t.width / 2) * Math.cos(a) - (t.height / 2) * Math.sin(a), t.y + (t.width / 2) * Math.sin(a) + (t.height / 2) * Math.cos(a)]
    }
    for (const o of turned.slice(0, 20)) {
      const same = objects.filter((x: any) => x.type === o.kind && x.width === o.w && x.height === o.h)
      expect(same.some((t: any) => Math.hypot(centre(t)[0] - o.x, centre(t)[1] - o.y) < 1), o.kind + " " + o.id).toBe(true)
    }
    const corridor = objects.find((x: any) => x.type === 'corridor')
    expect(corridor.polyline.length).toBeGreaterThan(1)
    const locked = objects.find((x: any) => x.properties.some((p: any) => p.name === 'lock'))
    expect(locked.properties.find((p: any) => p.name === 'lock').value).toBe('red')
  })
})

describe('virtual tabletop (Universal VTT)', () => {
  it('has the grid, straight walls, a portal per door and the lights, from the players’ version', () => {
    const uvtt = universalVtt(vault, { gridSize: 50, pixelsPerGrid: 70, image: 'AAAA' })
    expect(uvtt.format).toBe(0.3)
    expect(uvtt.resolution).toEqual({ map_origin: { x: 0, y: 0 }, map_size: { x: vault.w / 50, y: vault.h / 50 }, pixels_per_grid: 70 })
    expect(uvtt.line_of_sight.length).toBeGreaterThan(10)
    for (const [a, b] of uvtt.line_of_sight) {
      expect(a.x === b.x || a.y === b.y).toBe(true)
      expect([a.x, b.x].every((x) => x >= 0 && x <= vault.w / 50)).toBe(true)
    }
    const doors = all(vault).filter((o) => o.kind === 'door' && !o.secret)
    expect(uvtt.portals).toHaveLength(doors.length)
    expect(uvtt.lights.length).toBeGreaterThan(0)
    expect(uvtt.lights[0].color).toMatch(/^ff[0-9a-f]{6}$/i)
    expect(uvtt.image).toBe('AAAA')
  })

  it('traces walls round open ground: one closed square of floor gives four walls', () => {
    const nav = { cell: 10, cols: 4, rows: 4, cost: Uint8Array.from([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]), tags: new Uint8Array(16), locks: new Map() }
    expect(gridWalls(nav).sort()).toEqual(
      [
        [[10, 10], [30, 10]],
        [[10, 30], [30, 30]],
        [[10, 10], [10, 30]],
        [[30, 10], [30, 30]],
      ].sort(),
    )
  })
})

describe('Export menu', () => {
  it('exports engine data from the Map view', async () => {
    const p = createProject('UI')
    p.documents[WORLD_DOC].data.locations = [{ ...dungeon, map: vault }]
    useStore.getState().loadProject(p, 'x')
    window.location.hash = '#/doc/design.world?s=locations'
    render(<App />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Map' })).find((b) => b.closest('.tabs'))!)
    fireEvent.change(screen.getByLabelText('Export format'), { target: { value: 'json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    await waitFor(() => expect(downloadText).toHaveBeenCalled())
    const [name, text] = vi.mocked(downloadText).mock.calls.at(-1)!
    expect(name).toBe('Vault.json')
    expect(JSON.parse(text).format).toBe(LOCATION_JSON_FORMAT)
  })
})
