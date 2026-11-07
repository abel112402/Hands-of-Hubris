import type { ModuleGuide } from '../../core/guides/types'
import { PLAYER_GUIDE } from './player'
import { ITEMS_GUIDE } from './items'
import { COMBAT_GUIDE } from './combat'
import { TIME_GUIDE } from './timeWeather'
import { TRADE_GUIDE } from './trade'
import { STORY_GUIDE } from './story'
import { UI_GUIDE } from './ui'
import { OPEN_QUESTIONS_GUIDE } from './openQuestions'
import { VISION_GUIDE } from './vision'
import { ROADMAP_GUIDE } from './roadmap'
import { CORE_LOOP_GUIDE } from './coreLoop'
import { DIFFICULTY_GUIDE } from './difficulty'
import { DIPLOMACY_GUIDE } from './diplomacy'
import { WORLD_GUIDE } from './world'
import { TOWN_GUIDE } from './town'
import { NPC_GUIDE } from './npc'
import { ARCHITECTURE_GUIDE } from './architecture'

/** Guides per module. A module without an entry shows no Guide tab, map or examples. */
export const GUIDES: Record<string, ModuleGuide> = {
  'overview.vision': VISION_GUIDE,
  'overview.roadmap': ROADMAP_GUIDE,
  'design.coreLoop': CORE_LOOP_GUIDE,
  'design.difficulty': DIFFICULTY_GUIDE,
  'design.factions': DIPLOMACY_GUIDE,
  'design.world': WORLD_GUIDE,
  'design.town': TOWN_GUIDE,
  'design.npc': NPC_GUIDE,
  'technical.architecture': ARCHITECTURE_GUIDE,
  'design.player': PLAYER_GUIDE,
  'design.items': ITEMS_GUIDE,
  'design.combat': COMBAT_GUIDE,
  'design.timeWeather': TIME_GUIDE,
  'design.trade': TRADE_GUIDE,
  'design.story': STORY_GUIDE,
  'design.ui': UI_GUIDE,
  'design.openQuestions': OPEN_QUESTIONS_GUIDE,
}

export const guideOf = (docId: string): ModuleGuide | undefined => GUIDES[docId]
