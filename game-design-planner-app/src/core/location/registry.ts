import type { LocationTypeDef } from './types'
import { CAVE } from './types/cave'
import { DUNGEON } from './types/dungeon'
import { DWELLING } from './types/dwelling'
import { CITY, VILLAGE } from './types/settlement'
import { WORLD } from './types/world'

/** Location types that have a generator. To add one: write its definition in `types/` and list it here. */
export const LOCATION_TYPES: LocationTypeDef[] = [WORLD, CITY, VILLAGE, DUNGEON, CAVE, DWELLING]

export const getLocationType = (id: unknown): LocationTypeDef | undefined => LOCATION_TYPES.find((t) => t.id === id)
