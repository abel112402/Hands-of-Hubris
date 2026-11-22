import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildBundle } from '../src/core/engine/bundle'
import { exportFolderIn, folderState, readText, writeExport } from '../src/core/engine/folder'
import { MemoryFolder } from './memoryFolder'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
const files = (p = cinderholm()) => buildBundle(p, 'unity', 'T').files

describe('writing the export into a linked folder', () => {
  // Writes of the export itself, without the backup and journal under .hoh-backup/.
  const exportLog = (dir: MemoryFolder) => dir.log.filter((l) => !l.includes('.hoh-backup'))

  it('writes everything once, the manifest last, then only what changed', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    const first = await writeExport(dir, files())
    expect(first).toMatchObject({ written: files().length, unchanged: 0, deleted: 0, keptYours: 0, codeChanged: true, stopped: false })
    expect(exportLog(dir).at(-1)).toBe('write hoh-engine.json')
    expect(dir.read('Data/Item/item.plank.json')).toContain('"name": "Plank"')

    dir.log.length = 0
    expect(await writeExport(dir, files())).toMatchObject({ written: 0, deleted: 0, codeChanged: false })
    expect(dir.log).toEqual([])

    const p = cinderholm()
    p.documents['design.items'].data.items[0].value = 3
    const r = await writeExport(dir, files(p))
    expect(r.written).toBe(3) // the record, ir/engine-ir.json and the manifest with the new hashes
    expect(exportLog(dir)).toContain('write Data/Item/item.plank.json')
    expect(exportLog(dir).at(-1)).toBe('write hoh-engine.json')
    expect(r.codeChanged).toBe(false)
  })

  it('never overwrites your class files, removes generated files the plan dropped, and keeps files it did not write', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    const p = cinderholm()
    await writeExport(dir, files(p))
    dir.put('Data/Item/item.plank.json.meta', 'guid')
    dir.put('Unity/Scripts/Classes/GameplayPlayer/Health.cs', '// mine')
    dir.put('Unity/Scripts/Generated/MyHelper.cs', '// mine too')
    p.documents['design.items'].data.items.splice(0, 1) // Plank leaves the plan
    const r = await writeExport(dir, files(p))
    expect(dir.read('Unity/Scripts/Classes/GameplayPlayer/Health.cs')).toBe('// mine')
    expect(r.keptYours).toBe(7)
    expect(r.deleted).toBe(1)
    expect(dir.read('Data/Item/item.plank.json')).toBeUndefined()
    expect(dir.read('Data/Item/item.plank.json.meta')).toBeUndefined()
    // Never deleted: the planner did not write it.
    expect(r.keptNotOurs).toEqual(['Unity/Scripts/Generated/MyHelper.cs'])
    expect(await readText(dir, 'Unity/Scripts/Generated/MyHelper.cs')).toBe('// mine too')
  })

  it('deletes nothing in a folder that held no export before', async () => {
    const dir = new MemoryFolder('Assets')
    dir.put('Data/Saves/slot1.json', 'precious')
    const r = await writeExport(dir, files())
    expect(r.deleted).toBe(0)
    expect(dir.read('Data/Saves/slot1.json')).toBe('precious')
  })

  it('recognises a Unity project and an earlier export', async () => {
    const unity = new MemoryFolder('MyGame')
    unity.put('Assets/Scenes/Main.unity', 'x')
    unity.put('ProjectSettings/ProjectVersion.txt', 'x')
    expect(await folderState(unity)).toMatchObject({ unityProject: true, hasExport: false, empty: false })
    const { folder, path } = await exportFolderIn(unity)
    expect(path).toBe('Assets/HoHPlanner')
    await writeExport(folder, files())
    expect(unity.read('Assets/HoHPlanner/hoh-engine.json')).toBeTruthy()
    expect(await folderState(folder)).toMatchObject({ hasExport: true, projectName: 'Cinderholm (example)' })
    expect(await folderState(new MemoryFolder('empty'))).toMatchObject({ empty: true, hasExport: false })
    expect((await exportFolderIn(folder)).path).toBe('')
  })
})

describe('saving again without changes', () => {
  it('does not rewrite the manifest only for a new export time', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    const p = cinderholm()
    await writeExport(dir, buildBundle(p, 'unity', '2026-01-01T00:00:00Z').files)
    dir.log.length = 0
    const r = await writeExport(dir, buildBundle(p, 'unity', '2026-02-02T00:00:00Z').files)
    expect(r.written).toBe(0)
    expect(dir.log).toEqual([])
    expect(JSON.parse(dir.read('hoh-engine.json')!).exportedAt).toBe('2026-01-01T00:00:00Z')
  })
})
