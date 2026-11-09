import { getModule } from '../core/modules/registry'
import { Icon, type IconName } from './Icon'

/**
 * Line icon per planner, keyed by module id. The module's emoji (`PlannerModule.icon`) stays the
 * source for Markdown export and is the fallback for modules missing here.
 */
export const MODULE_ICONS: Record<string, IconName> = {
  'overview.vision': 'target',
  'overview.glossary': 'book',
  'overview.roadmap': 'map',
  'design.coreLoop': 'loop',
  'design.difficulty': 'scale',
  'design.factions': 'landmark',
  'design.world': 'globe',
  'design.town': 'town',
  'design.npc': 'npc',
  'design.player': 'user',
  'design.items': 'backpack',
  'design.combat': 'swords',
  'design.timeWeather': 'moon',
  'design.trade': 'coins',
  'design.story': 'scroll',
  'design.ui': 'monitor',
  'design.openQuestions': 'help',
  'technical.architecture': 'layers',
  'technical.coding': 'code',
  'technical.dataDriven': 'database',
  'technical.save': 'save',
  'technical.ai': 'bot',
  'technical.performance': 'zap',
  'technical.tools': 'wrench',
  'technical.adr': 'decision',
  'artAudio.art': 'palette',
  'artAudio.audio': 'music',
  'artAudio.assets': 'package',
  'production.milestones': 'flag',
  'production.backlog': 'clipboard',
  'production.risks': 'warning',
  'production.team': 'users',
  'production.release': 'rocket',
  'qa.testPlan': 'flask',
  'qa.balance': 'chart',
  'qa.bugs': 'bug',
  'templates.featureSpec': 'pen',
  'custom.entities': 'blocks',
}

/** Decorative: the planner title next to it carries the label. */
export function ModuleIcon({ id, className }: { id: string; className?: string }) {
  const name = MODULE_ICONS[id]
  if (name) return <Icon name={name} className={'module-icon' + (className ? ` ${className}` : '')} strokeWidth={1.75} />
  return <span className={'module-icon' + (className ? ` ${className}` : '')} aria-hidden="true">{getModule(id)?.icon}</span>
}
