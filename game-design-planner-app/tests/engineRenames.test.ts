import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildBundle } from '../src/core/engine/bundle'
import { describeWrite, writeExport } from '../src/core/engine/folder'
import { ownMoves, renameIn } from '../src/core/engine/renames'
import type { EngineId } from '../src/core/engine/adapter'
import { MemoryFolder } from './memoryFolder'

const fs: { readFileSync: (p: string, e: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
/** The example with its player controller renamed in the plan (same planner ID). */
const renamed = () => {
  const p = cinderholm()
  const c = p.documents['technical.architecture'].data.classes.find((x: { id: string }) => x.id === 'clsPly01')
  c.name = 'IslandPlayer'
  return p
}

describe('renames in your files', () => {
  it('changes whole names only, longest first', () => {
    expect(renameIn('class UHealth : public UHealthBase // Health, HealthBar', [['Health', 'Vitality'], ['UHealth', 'UVitality'], ['UHealthBase', 'UVitalityBase']])).toBe('class UVitality : public UVitalityBase // Vitality, HealthBar')
    expect(renameIn('#include "Classes/A/Old.h"', [['Classes/A/Old.h', 'Classes/B/New.h']])).toBe('#include "Classes/B/New.h"')
  })

  it('pairs old and new files by planner ID and skips unsafe paths', () => {
    const before = [{ plannerId: 'c1', ownFiles: ['Unity/Scripts/Classes/A/Old.cs'], tokens: ['Old'] }, { plannerId: 'c2', ownFiles: ['../evil.cs'], tokens: ['X'] }]
    const after = [{ plannerId: 'c1', ownFiles: ['Unity/Scripts/Classes/B/New.cs'], tokens: ['New'] }, { plannerId: 'c2', ownFiles: ['Unity/Scripts/Classes/X.cs'], tokens: ['Y'] }]
    expect(ownMoves(before, after)).toEqual([{ plannerId: 'c1', from: 'Unity/Scripts/Classes/A/Old.cs', to: 'Unity/Scripts/Classes/B/New.cs', replace: [['Old', 'New']] }])
    // An index written before ownFiles existed (Unity): the file is named after the class.
    expect(ownMoves([{ plannerId: 'c1', own: 'Unity/Scripts/Classes/A/Old.cs' }], after)[0].replace).toEqual([['Old', 'New']])
    expect(ownMoves('not an index', after)).toEqual([])
  })
})

describe.each([
  ['unity', 'Unity/Scripts/Classes/GameplayPlayer/CinderPlayerController.cs', 'Unity/Scripts/Classes/GameplayPlayer/IslandPlayer.cs', '.meta', 'partial class IslandPlayer'],
  ['godot', 'Godot/Scripts/Classes/gameplay_player/cinder_player_controller.gd', 'Godot/Scripts/Classes/gameplay_player/island_player.gd', '.uid', 'class_name IslandPlayer\nextends IslandPlayerBase'],
  ['unreal', 'Unreal/Source/PlannerGame/Classes/GameplayPlayer/CinderPlayerController.h', 'Unreal/Source/PlannerGame/Classes/GameplayPlayer/IslandPlayer.h', '', 'class PLANNERGAME_API AIslandPlayer : public AIslandPlayerBase'],
] as const)('%s: a renamed class keeps your code', (engine, from, to, sidecar, expected) => {
  it('moves your file to the new name, with the names inside it, and never loses your code', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    await writeExport(dir, buildBundle(cinderholm(), engine as EngineId, 'T').files)
    const mine = dir.read(from)! + '\n// my code\n'
    dir.put(from, mine)
    if (sidecar) dir.put(from + sidecar, 'guid: 1234')
    const r = await writeExport(dir, buildBundle(renamed(), engine as EngineId, 'T').files)
    expect(dir.read(from)).toBeUndefined()
    const moved = dir.read(to)!
    expect(moved).toContain(expected)
    expect(moved).toContain('// my code')
    expect(moved).not.toMatch(/CinderPlayerController/)
    if (sidecar) {
      expect(dir.read(to + sidecar)).toBe('guid: 1234')
      expect(dir.read(from + sidecar)).toBeUndefined()
    }
    expect(r.moved).toContain(`${from} → ${to}`)
    expect(describeWrite(r)).toMatch(/moved with their renamed class/)
    if (engine === 'unreal') {
      const cpp = dir.read(to.replace(/\.h$/, '.cpp'))!
      expect(cpp).toContain('#include "Classes/GameplayPlayer/IslandPlayer.h"')
      expect(cpp).toContain('void AIslandPlayer::')
    }
  })

  it('leaves a file you already made at the new name alone', async () => {
    const dir = new MemoryFolder('HoHPlanner')
    await writeExport(dir, buildBundle(cinderholm(), engine as EngineId, 'T').files)
    dir.put(to, '// already here')
    const r = await writeExport(dir, buildBundle(renamed(), engine as EngineId, 'T').files)
    expect(r.moved).toEqual([])
    expect(dir.read(to)).toBe('// already here')
    expect(dir.read(from)).toBeDefined()
  })
})
