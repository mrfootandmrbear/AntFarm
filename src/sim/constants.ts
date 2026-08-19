/** Terrain cell types stored in the world's Uint8Array grid. */
export const Cell = {
  EMPTY: 0,
  DIRT: 1,
  WALL: 2,
  WATER: 3,
  FOOD: 4,
  NEST: 5,
  FIRE_NEST: 6,
} as const;

export type CellType = (typeof Cell)[keyof typeof Cell];

export const CellNames: Record<number, string> = {
  [Cell.EMPTY]: 'Empty',
  [Cell.DIRT]: 'Dirt',
  [Cell.WALL]: 'Wall',
  [Cell.WATER]: 'Water',
  [Cell.FOOD]: 'Food',
  [Cell.NEST]: 'Nest',
  [Cell.FIRE_NEST]: 'Fire nest',
};

/** Colony faction. Harvesters are the default Ant. */
export const AntKind = {
  HARVESTER: 0,
  FIRE: 1,
} as const;
export type AntKindType = (typeof AntKind)[keyof typeof AntKind];

/**
 * The 8 movement directions, indexed clockwise starting from "up".
 * Shared by the agent logic and the renderer (for heading rotation).
 */
export const DIRS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 }, // 0 up
  { dx: 1, dy: -1 }, // 1 up-right
  { dx: 1, dy: 0 }, // 2 right
  { dx: 1, dy: 1 }, // 3 down-right
  { dx: 0, dy: 1 }, // 4 down
  { dx: -1, dy: 1 }, // 5 down-left
  { dx: -1, dy: 0 }, // 6 left
  { dx: -1, dy: -1 }, // 7 up-left
];

/** Precomputed heading angle (radians) for each direction index. */
export const DIR_ANGLES: number[] = DIRS.map((d) => Math.atan2(d.dy, d.dx));

/** Tunable simulation parameters, centralized so behavior is easy to iterate on. */
export const SimConfig = {
  // Pheromone field dynamics (per diffuse step).
  pheromone: {
    evaporation: 0.990,
    diffusion: 0.02,
    minThreshold: 0.001,
    max: 10,
    /** Searching ants: weak home trail so returners can find the nest. */
    exploreDeposit: 0.28,
    /** Returning ants: stronger food trail so searchers can recruit. */
    foodDeposit: 0.85,
  },
  ant: {
    energyDrainPerTick: 0.00005,
    digEnergyCost: 0.005,
    foodEnergyGain: 0.3,
    nestEnergyGain: 0.5,
    /** Food taken from nest stores when a hungry searcher rests on the mound. */
    nestSip: 0.02,
    /** Energy restored per unit of nest food sipped. */
    nestSipEnergy: 5,
    /** Drop cargo and search again if the nest hasn't been found. */
    giveUpReturnTicks: 1800,
  },
  colony: {
    maxAnts: 120,
    spawnIntervalTicks: 50,
    initialAnts: 40,
    /** Nest food spent to hatch one ant. No free hatches. */
    spawnCost: 0.25,
    /** Granary must hold this much before a hatch, so stores are visible. */
    spawnMinStore: 0.5,
  },
  fireAnt: {
    /** Same-cell bump: aggressive but not an instant wipe. */
    bumpKillChance: 0.11,
    /** Neighboring cell: slow displacement along shared trails. */
    adjacentKillChance: 0.003,
    /** Harvesters clustered on a fire ant can sting back. */
    swarmDefenseCount: 2,
    swarmDefenseChance: 0.02,
  },
  lizard: {
    energyDrainPerTick: 0.00006,
    moveEveryTicks: 3,
    eatRadius: 2,
    tongueCooldown: 55,
    eatEnergyGain: 0.2,
    sitScent: 0.28,
    swarmCount: 5,
    swarmDamage: 0.003,
    maxLizards: 12,
  },
  world: {
    diffuseIntervalTicks: 2,
    cullIntervalTicks: 100,
    waterIntervalTicks: 3,
  },
  save: {
    /** Ticks between silent auto-saves of the live world. */
    autoSaveIntervalTicks: 500,
  },
} as const;
