import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { entityRoute } from '../../core/palette'
import { getModule, getSections } from '../../core/modules/registry'
import type { Project } from '../../core/model/types'
import { useStore } from '../../core/store/store'

/** Asks the open planner page to show its section map (EditorPageV3 listens). */
export const SECTION_MAP_EVENT = 'hoh:v3:section-map'

/** The single-key shortcuts, for the palette's help line and the tests. */
export const SHORTCUTS = { nextSection: 'j', prevSection: 'k', atlas: 'a', map: 'm', hints: '.', nextStep: 'n', search: '/' } as const

export type ShortcutAction = { kind: 'go'; to: string } | { kind: 'map' } | { kind: 'hints' } | { kind: 'palette' }

/**
 * What a key does on the page in view (pure). J / K step through the planner's sections, A opens the Atlas,
 * M the section map, `.` the hints, N the walkthrough's next step and `/` the search. Undefined = not a shortcut
 * here, so the key keeps its normal meaning.
 */
export function shortcutAction(key: string, ctx: { project: Project; docId?: string; sectionId?: string; nextLink?: string }): ShortcutAction | undefined {
  const k = key.length === 1 ? key.toLowerCase() : key
  if (k === SHORTCUTS.atlas) return { kind: 'go', to: '/' }
  if (k === SHORTCUTS.search) return { kind: 'palette' }
  if (k === SHORTCUTS.hints) return { kind: 'hints' }
  if (k === SHORTCUTS.nextStep) return ctx.nextLink ? { kind: 'go', to: ctx.nextLink } : undefined
  const mod = ctx.docId ? getModule(ctx.docId) : undefined
  if (!mod) return undefined
  if (k === SHORTCUTS.map) return { kind: 'map' }
  if (k !== SHORTCUTS.nextSection && k !== SHORTCUTS.prevSection) return undefined
  const sections = getSections(mod, ctx.project.registry)
  const at = Math.max(0, sections.findIndex((s) => s.id === ctx.sectionId))
  const to = sections[at + (k === SHORTCUTS.nextSection ? 1 : -1)]
  return to ? { kind: 'go', to: entityRoute(mod.id, to.id) } : undefined
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName))

/**
 * Wires `shortcutAction` to the keyboard. It listens on the window, after the page's own handlers (the map
 * editor's tool keys run on the document and mark their keys handled), and stays out of the way while the user
 * types, holds a modifier, or works in a modal sheet or the palette.
 */
export function useShortcuts(opts: { docId?: string; sectionId?: string; nextLink?: string; openPalette: () => void; openHints: () => void }) {
  const nav = useNavigate()
  const latest = useRef(opts)
  useEffect(() => {
    latest.current = opts
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || isTyping(e.target)) return
      if (document.querySelector('[aria-modal="true"]')) return
      const o = latest.current
      const action = shortcutAction(e.key, { project: useStore.getState().project, docId: o.docId, sectionId: o.sectionId, nextLink: o.nextLink })
      if (!action) return
      e.preventDefault()
      if (action.kind === 'go') nav(action.to)
      else if (action.kind === 'palette') o.openPalette()
      else if (action.kind === 'hints') o.openHints()
      else window.dispatchEvent(new Event(SECTION_MAP_EVENT))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])
}
