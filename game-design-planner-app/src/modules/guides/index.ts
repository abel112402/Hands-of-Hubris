import type { ModuleGuide } from '../../core/guides/types'
import { PLAYER_GUIDE } from './player'
import { ITEMS_GUIDE } from './items'
import { COMBAT_GUIDE } from './combat'

/** Guides per module. A module without an entry shows no Guide tab, map or examples. */
export const GUIDES: Record<string, ModuleGuide> = {
  'design.player': PLAYER_GUIDE,
  'design.items': ITEMS_GUIDE,
  'design.combat': COMBAT_GUIDE,
}

export const guideOf = (docId: string): ModuleGuide | undefined => GUIDES[docId]
