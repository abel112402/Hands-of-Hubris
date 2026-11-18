import { create } from 'zustand'
import { isCostume, type CostumeId } from '../../core/mascots/cast'

const STORAGE_KEY = 'hohplan:mascot:muted'

function readMuted(): CostumeId[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter(isCostume) : []
  } catch {
    return []
  }
}

/**
 * Hubi's wardrobe: costumes the user switched off. Browser-local like the personality level, never in the
 * project. A muted costume never appears; its lines fall back to the neutral flavor text (or nothing).
 */
export const useWardrobe = create<{ muted: CostumeId[]; toggle: (c: CostumeId) => void }>((set, get) => ({
  muted: readMuted(),
  toggle: (c) => {
    const muted = get().muted.includes(c) ? get().muted.filter((x) => x !== c) : [...get().muted, c]
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(muted))
    } catch {
      /* storage unavailable: keep it for this session only */
    }
    set({ muted })
  },
}))

export const useCostumeOn = (c: CostumeId) => useWardrobe((s) => !s.muted.includes(c))
export const costumeOn = (c: CostumeId) => !useWardrobe.getState().muted.includes(c)
