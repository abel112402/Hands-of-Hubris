/** Damage per hit when the Damage model leaves the formula empty: armor with diminishing returns, then resistance. */
export const DEFAULT_DAMAGE_FORMULA = 'attack * 100 / (100 + armor) * (1 - resist / 100) * crit'
