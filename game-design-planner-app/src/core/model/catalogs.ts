import type { Catalog, Registry } from './types'

const cat = (label: string, items: string[]): Catalog => ({
  label,
  items: items.map((l) => ({ id: l.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label: l })),
})

export const defaultCatalogs = (): Record<string, Catalog> => ({
  difficulties: cat('Difficulty levels', ['Easy', 'Medium', 'Hard']),
  npcStats: cat('NPC stats', [
    'Strength',
    'Intelligence',
    'Speed',
    'Kindness',
    'Cunning',
    'Health',
    'Stability',
    'Mana',
    'Talent',
  ]),
  needs: cat('NPC needs', ['Food', 'Drink', 'Housing', 'Entertainment', 'Safety']),
  resources: cat('Resources', ['Wood', 'Stone', 'Ore', 'Metal', 'Food', 'Drink', 'Gold']),
  rarities: cat('Item rarities', ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']),
  qualities: cat('Item qualities', ['Poor', 'Normal', 'Good', 'Excellent', 'Masterwork']),
  itemTypes: cat('Item types', [
    'Building item',
    'Resource item',
    'Tool',
    'Machine',
    'Weapon',
    'Armor',
    'Consumable',
    'Accessory',
    'Decoration',
    'Beacon',
    'Valuable',
  ]),
  casts: cat('Player casts', [
    'Warrior',
    'Assassin',
    'Ranger',
    'Light wizard',
    'Dark wizard',
    'Nature wizard',
    'Builder',
  ]),
  damageTypes: cat('Damage types', ['Physical', 'Fire', 'Light', 'Dark', 'Nature']),
  professions: cat('NPC professions', ['Builder', 'Miner', 'Lumberjack', 'Farmer', 'Innkeeper', 'Teacher', 'Merchant', 'Blacksmith']),
  timeOfDay: cat('Times of day', ['Dawn', 'Day', 'Dusk', 'Night']),
  survivalStats: cat('Survival stats', ['Hunger', 'Thirst', 'Health', 'Sanity']),
  worldModifiers: cat('World modifiers', ['Monster spawn rate', 'Hunger / thirst decay', 'Movement speed', 'Crop growth', 'NPC morale', 'Loot rarity', 'Corruption growth']),
})

/**
 * Adds default catalogs a project does not have yet (it was saved before they existed).
 * Existing catalogs, including edited or emptied ones, are never changed. Returns the ids added.
 */
export function addMissingCatalogs(registry: Registry): string[] {
  const added: string[] = []
  for (const [id, c] of Object.entries(defaultCatalogs())) {
    if (registry.catalogs[id]) continue
    registry.catalogs[id] = c
    added.push(id)
  }
  return added
}

export const defaultRegistry = (): Registry => ({
  catalogs: defaultCatalogs(),
  customFields: {},
  entityTypes: [],
})
