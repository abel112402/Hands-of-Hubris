/**
 * Which interface generation to show: Classic (`v2`) or the Design Atlas (`v3`,
 * plans/UI_V3_PLAN.md). A device preference like the theme, never project data, so switching it cannot
 * change or dirty a project. v3 is the default since its Phase 2 (2026-11-19); Classic stays available.
 */
import { useSyncExternalStore } from 'react'

export type UiVersion = 'v2' | 'v3'
export const UI_VERSION_KEY = 'hohplan:uiVersion'
export const UI_VERSIONS: readonly UiVersion[] = ['v2', 'v3']

const storage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** The stored choice; anything missing or unknown means `v3`, the default. */
export function getUiVersion(): UiVersion {
  return storage()?.getItem(UI_VERSION_KEY) === 'v2' ? 'v2' : 'v3'
}

const listeners = new Set<() => void>()
/** Set by the switch, so the choice applies even when storage is blocked. */
let override: UiVersion | null = null
const current = () => override ?? getUiVersion()

export function setUiVersion(v: UiVersion) {
  try {
    // The default (v3) is stored as no choice, so a later change of default reaches everyone who never chose.
    if (v === 'v3') storage()?.removeItem(UI_VERSION_KEY)
    else storage()?.setItem(UI_VERSION_KEY, v)
  } catch {
    /* storage full or blocked: the choice still applies to this visit */
  }
  override = v
  listeners.forEach((l) => l())
}

/** Forgets the in-memory choice so the stored one is read again (tests). */
export function resetUiVersionOverride() {
  override = null
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useUiVersion = (): UiVersion => useSyncExternalStore(subscribe, current, () => 'v3')
