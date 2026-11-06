import type { ModuleGuide } from '../../core/guides/types'
import { PLAYER_GUIDE } from './player'
import { ITEMS_GUIDE } from './items'
import { COMBAT_GUIDE } from './combat'
import { TIME_GUIDE } from './timeWeather'
import { TRADE_GUIDE } from './trade'
import { STORY_GUIDE } from './story'
import { UI_GUIDE } from './ui'

/** Guides per module. A module without an entry shows no Guide tab, map or examples. */
export const GUIDES: Record<string, ModuleGuide> = {
  'design.player': PLAYER_GUIDE,
  'design.items': ITEMS_GUIDE,
  'design.combat': COMBAT_GUIDE,
  'design.timeWeather': TIME_GUIDE,
  'design.trade': TRADE_GUIDE,
  'design.story': STORY_GUIDE,
  'design.ui': UI_GUIDE,
}

export const guideOf = (docId: string): ModuleGuide | undefined => GUIDES[docId]
