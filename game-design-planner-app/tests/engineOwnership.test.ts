import { describe, expect, it } from 'vitest'
import { buildReferenceSlice } from './fixtures/referenceSlice3d'
import { buildBundle } from '../src/core/engine/bundle'
import { interruptedWrite, previewExport, readText, restoreLastWrite, writeExport, type FolderFile } from '../src/core/engine/folder'
import { BACKUP_DIR, backupStamp, planExport, unmodified, type PlanInput } from '../src/core/engine/ownership'
import { fnv1a } from '../src/core/engine/manifest'
import type { Entity, Project } from '../src/core/model/types'
import { MemoryFolder } from './memoryFolder'

/**
 * plans/UNITY_PLAYABLE_GAME_GENERATION_PLAN.md, phase 5: preview, ownership, conflicts, backup, rollback and restore.
 * The Unity bridge runs the same cases from Tests/Editor/Fixtures/ownership-cases.json (UPDATE_BRIDGE_FIXTURES=1 rewrites it).
 */
const fs: { readFileSync: (p: string, e: string) => string; writeFileSync: (p: string, t: string) => void } = await import('node:fs' as string)
const env: Record<string, string | undefined> = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env) ?? {}
const files = (p: Project = buildReferenceSlice()) => buildBundle(p, 'unity', '2026-01-01T00:00:00.000Z').files
const ITEM = 'Data/Item/item.brass_key.json'
const at = (n: number) => ({ now: new Date(Date.UTC(2026, 10, 21, 12, 0, n)) })
const backups = (dir: MemoryFolder) => [...(dir.dirs.get(BACKUP_DIR)?.dirs.keys() ?? [])].sort()
const withValue = (v: number) => {
  const p = buildReferenceSlice()
  ;(p.documents['design.items'].data.items as Entity[])[0].value = v
  return p
}

describe('preview and conflicts', () => {
  it('previews without writing, and stops before writing anything when a generated file was changed by hand', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    await writeExport(dir, files(), at(1))
    dir.put(ITEM, '{ "edited": "by me" }')
    dir.log.length = 0
    const plan = await previewExport(dir, files(withValue(7)))
    expect(dir.log).toEqual([])
    expect(plan.conflicts).toEqual([{ path: ITEM, action: 'conflict', reason: 'changed since the last export' }])
    const r = await writeExport(dir, files(withValue(7)), at(2))
    expect(r).toMatchObject({ stopped: true, written: 0, conflicts: [ITEM] })
    expect(dir.log).toEqual([])
    expect(dir.read(ITEM)).toBe('{ "edited": "by me" }')
  })

  it('treats a file it never wrote at a target path as a conflict, also on the first write', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    dir.put(ITEM, 'someone else’s')
    expect(await writeExport(dir, files(), at(1))).toMatchObject({ stopped: true, conflicts: [ITEM] })
  })

  it('does not count CRLF line endings (a Git checkout) as a change', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    await writeExport(dir, files(), at(1))
    dir.put(ITEM, dir.read(ITEM)!.replace(/\n/g, '\r\n'))
    const r = await writeExport(dir, files(withValue(7)), at(2))
    expect(r.stopped).toBe(false)
    expect(dir.read(ITEM)).toContain('"value": 7')
  })

  it('overwrites conflicts only when asked, after backing them up, and restore puts them back', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    await writeExport(dir, files(), at(1))
    dir.put(ITEM, '{ "edited": "by me" }')
    const r = await writeExport(dir, files(withValue(7)), { overwrite: true, ...at(2) })
    expect(r).toMatchObject({ stopped: false, conflicts: [ITEM], backup: `${BACKUP_DIR}/20261121-120002-000` })
    expect(dir.read(ITEM)).toContain('"value": 7')
    expect(dir.read(`${r.backup}/${ITEM}`)).toBe('{ "edited": "by me" }')
    expect(JSON.parse(dir.read(`${r.backup}/journal.json`)!)).toMatchObject({ state: 'done', by: 'planner', backedUp: expect.arrayContaining([ITEM, 'hoh-engine.json']) })

    expect(await restoreLastWrite(dir)).toMatch(/\d+ files? put back/)
    expect(dir.read(ITEM)).toBe('{ "edited": "by me" }')
    expect(JSON.parse(dir.read(`${r.backup}/journal.json`)!).state).toBe('restored')
  })
})

describe('idempotence, rollback and recovery', () => {
  it('writes nothing and makes no backup the second time', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    await writeExport(dir, files(), at(1))
    const before = backups(dir)
    dir.log.length = 0
    expect(await writeExport(dir, files(), at(2))).toMatchObject({ written: 0, deleted: 0, stopped: false })
    expect(dir.log).toEqual([])
    expect(backups(dir)).toEqual(before)
  })

  it('rolls a write back when it fails half-way, keeping the folder as it was', async () => {
    class Failing extends MemoryFolder {
      fail = false
      override async getFileHandle(name: string, o?: { create?: boolean }): Promise<FolderFile> {
        const h = await super.getFileHandle(name, o)
        if (!this.fail || name !== 'hoh-engine.json' || !o?.create) return h
        this.fail = false // fails once: the write, not the rollback
        return { ...h, createWritable: async () => ({ write: async () => undefined, close: async () => Promise.reject(new Error('Disk full.')) }) }
      }
    }
    const dir = new Failing('HoHPlanner')
    await writeExport(dir, files(), at(1))
    const item = dir.read(ITEM)
    dir.fail = true
    await expect(writeExport(dir, files(withValue(7)), at(2))).rejects.toThrow('Disk full. The folder was put back as it was before this write.')
    expect(dir.read(ITEM)).toBe(item)
  })

  it('reports a write that never finished', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    await writeExport(dir, files(), at(1))
    expect(await interruptedWrite(dir)).toBeNull()
    dir.put(`${BACKUP_DIR}/20991231-000000-000/journal.json`, JSON.stringify({ format: 'hoh-write-journal', v: 1, stamp: '20991231-000000-000', by: 'unity', state: 'writing', created: [], backedUp: [] }))
    expect(await interruptedWrite(dir)).toMatchObject({ by: 'unity', state: 'writing' })
  })

  it('keeps the last five backups', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    for (let i = 1; i <= 8; i++) await writeExport(dir, files(withValue(i)), at(i))
    expect(backups(dir)).toEqual([4, 5, 6, 7, 8].map((i) => backupStamp(at(i).now)))
  })
})

describe('ownership rules (shared with the Unity bridge)', () => {
  const base = (over: Partial<PlanInput>): PlanInput => ({ next: new Map(), disk: () => null, oldManifest: null, generatedOnDisk: [], yoursPrefixes: ['Unity/Scripts/Classes/'], ownedPrefixes: ['Unity/Scripts/Generated/', 'Data/'], manifestPath: 'hoh-engine.json', ...over })
  const manifest = (files: Record<string, string>) => JSON.stringify({ files: Object.entries(files).map(([path, text]) => ({ path, hash: fnv1a(text) })) })
  type Case = { name: string; next: Record<string, string>; disk: Record<string, string>; old: Record<string, string> | null; generatedOnDisk: string[]; expected: Record<string, string> }
  const CASES: Case[] = [
    { name: 'create, unchanged and update', next: { 'Data/a.json': 'A2', 'Data/b.json': 'B' }, disk: { 'Data/a.json': 'A1', 'Data/b.json': 'B' }, old: { 'Data/a.json': 'A1', 'Data/b.json': 'B' }, generatedOnDisk: ['Data/a.json', 'Data/b.json'], expected: { 'Data/a.json': 'update', 'Data/b.json': 'unchanged' } },
    { name: 'edited by you', next: { 'Data/a.json': 'A2' }, disk: { 'Data/a.json': 'mine' }, old: { 'Data/a.json': 'A1' }, generatedOnDisk: ['Data/a.json'], expected: { 'Data/a.json': 'conflict' } },
    { name: 'CRLF is not an edit', next: { 'Data/a.json': 'x\ny2' }, disk: { 'Data/a.json': 'x\r\ny' }, old: { 'Data/a.json': 'x\ny' }, generatedOnDisk: ['Data/a.json'], expected: { 'Data/a.json': 'update' } },
    { name: 'yours is kept', next: { 'Unity/Scripts/Classes/P.cs': 'new' }, disk: { 'Unity/Scripts/Classes/P.cs': 'mine' }, old: { 'Unity/Scripts/Classes/P.cs': 'old' }, generatedOnDisk: [], expected: { 'Unity/Scripts/Classes/P.cs': 'keepYours' } },
    { name: 'dropped: delete what it wrote, keep what it did not', next: {}, disk: { 'Data/gone.json': 'G', 'Data/mine.json': 'M', 'Unity/Scripts/Generated/E.cs': 'edited' }, old: { 'Data/gone.json': 'G', 'Unity/Scripts/Generated/E.cs': 'E' }, generatedOnDisk: ['Data/gone.json', 'Data/mine.json', 'Unity/Scripts/Generated/E.cs'], expected: { 'Data/gone.json': 'delete', 'Data/mine.json': 'keepNotOurs', 'Unity/Scripts/Generated/E.cs': 'keepNotOurs' } },
    { name: 'no previous export', next: { 'Data/a.json': 'A', 'Data/b.json': 'B' }, disk: { 'Data/a.json': 'other' }, old: null, generatedOnDisk: [], expected: { 'Data/a.json': 'conflict', 'Data/b.json': 'create' } },
    { name: 'non-ASCII text', next: { 'Data/é.json': 'Keeper’s Yard ✓ 2' }, disk: { 'Data/é.json': 'Keeper’s Yard ✓' }, old: { 'Data/é.json': 'Keeper’s Yard ✓' }, generatedOnDisk: ['Data/é.json'], expected: { 'Data/é.json': 'update' } },
  ]

  it.each(CASES)('$name', (c) => {
    const plan = planExport(base({ next: new Map(Object.entries(c.next)), disk: (p) => c.disk[p] ?? null, oldManifest: c.old && manifest(c.old), generatedOnDisk: c.generatedOnDisk }))
    expect(Object.fromEntries(plan.entries.map((e) => [e.path, e.action]))).toEqual(c.expected)
  })

  it('hashes like the bridge, and line endings do not matter', () => {
    expect(unmodified('a\r\nb', fnv1a('a\nb'))).toBe(true)
    expect(unmodified('a\nb', undefined)).toBe(false)
  })

  it('has a current fixture for the bridge', () => {
    const path = 'engine-packages/unity/com.handsofhubris.planner-bridge/Tests/Editor/Fixtures/ownership-cases.json'
    const text =
      JSON.stringify(
        {
          hashes: ['', 'a', 'Keeper’s Yard ✓', 'line\r\nbreak'].map((t) => ({ text: t, hash: fnv1a(t) })),
          cases: CASES.map((c) => ({ ...c, old: c.old && Object.fromEntries(Object.entries(c.old).map(([p, t]) => [p, fnv1a(t)])) })),
        },
        null,
        2,
      ) + '\n'
    if (env.UPDATE_BRIDGE_FIXTURES) fs.writeFileSync(path, text)
    expect(fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), 'ownership-cases.json is out of date; run the tests with UPDATE_BRIDGE_FIXTURES=1').toBe(text)
  })

  it('reads a folder it can see through readText the same way', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    await writeExport(dir, files(), at(1))
    expect(await readText(dir, ITEM)).toBe(dir.read(ITEM))
  })
})
