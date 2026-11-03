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
})

export const defaultRegistry = (): Registry => ({
  catalogs: defaultCatalogs(),
  customFields: {},
  entityTypes: [],
})
