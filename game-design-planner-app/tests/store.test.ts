import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'

afterEach(() => vi.useRealTimers())

describe('store mutate', () => {
  it('keeps an edit made in the same millisecond as the previous one', () => {
    vi.useFakeTimers({ now: Date.parse('2026-06-01T12:00:00Z') })
    useStore.getState().loadProject(createProject('T', false), 'x')
    useStore.getState().mutate((p) => void (p.meta.name = 'A'))
    // Same clock reading: the timestamp does not change, so the edit is the only patch.
    useStore.getState().mutate((p) => void (p.meta.name = 'B'))
    expect(useStore.getState().project.meta.name).toBe('B')
    expect(useStore.getState().past).toHaveLength(2)
  })

  it('records nothing when the edit changes nothing', () => {
    useStore.getState().loadProject(createProject('T', false), 'x')
    useStore.getState().mutate(() => {})
    expect(useStore.getState().past).toHaveLength(0)
    expect(useStore.getState().dirty).toBe(false)
  })
})
