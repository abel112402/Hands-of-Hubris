import { createContext, useContext } from 'react'

/**
 * Where a section's own tools (a collection's views, filter, count, CSV and Add) render in v3: a slot in the
 * section header, so they share its row instead of adding a toolbar row above the data. Null = no header slot
 * (classic interface, or a section shown outside the v3 page): the section keeps its own toolbar.
 */
export const SectionToolsSlot = createContext<HTMLElement | null>(null)

export const useSectionToolsSlot = () => useContext(SectionToolsSlot)
