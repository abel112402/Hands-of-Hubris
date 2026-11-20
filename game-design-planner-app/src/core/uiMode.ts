/**
 * Guided or Studio (plans/UI_V3_PLAN.md, "Newcomer vs expert: two modes, one UI"). Guided, the default, keeps
 * the newcomer aids: detail fields behind chips, fog on the Atlas, the Next-step pill, example-first empty
 * states. Studio shows every field and drops those aids. A device preference like the theme, never project data.
 * Also remembers the companion's pin and whether the "try Studio" suggestion was dismissed.
 */
import { useSyncExternalStore } from 'react'

export type UiMode = 'guided' | 'studio'
export const UI_MODE_KEY = 'hohplan:uiMode'
export const COMPANION_PIN_KEY = 'hohplan:companionPinned'
export const STUDIO_OFFER_KEY = 'hohplan:studioOffer'
/** Finished walkthrough steps after which Guided suggests Studio once. */
export const STUDIO_OFFER_AT = 10

const storage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
/** In-memory values, so choices apply even when storage is blocked. */
const memory: Record<string, string | null> = {}
const read = (key: string) => (key in memory ? memory[key] : storage()?.getItem(key) ?? null)
function write(key: string, value: string | null) {
  try {
    if (value === null) storage()?.removeItem(key)
    else storage()?.setItem(key, value)
  } catch {
    /* storage full or blocked: still applies to this visit */
  }
  memory[key] = value
  notify()
}

export const getUiMode = (): UiMode => (read(UI_MODE_KEY) === 'studio' ? 'studio' : 'guided')
/** Guided is stored as no choice, like the interface version's default. */
export const setUiMode = (m: UiMode) => write(UI_MODE_KEY, m === 'studio' ? 'studio' : null)
export const getCompanionPinned = () => read(COMPANION_PIN_KEY) === '1'
export const setCompanionPinned = (on: boolean) => write(COMPANION_PIN_KEY, on ? '1' : null)
export const studioOfferDismissed = () => read(STUDIO_OFFER_KEY) === 'dismissed'
export const dismissStudioOffer = () => write(STUDIO_OFFER_KEY, 'dismissed')

/** Forgets in-memory values so stored ones are read again (tests). */
export function resetUiModeMemory() {
  for (const k of Object.keys(memory)) delete memory[k]
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export const useUiMode = (): UiMode => useSyncExternalStore(subscribe, getUiMode, () => 'guided')
export const useCompanionPinned = (): boolean => useSyncExternalStore(subscribe, getCompanionPinned, () => false)
export const useStudioOfferDismissed = (): boolean => useSyncExternalStore(subscribe, studioOfferDismissed, () => false)
