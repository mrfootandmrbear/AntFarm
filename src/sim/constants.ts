/** Terrain cell types stored in the world's Uint8Array grid. */
export const Cell = {
  EMPTY: 0,
  DIRT: 1,
  WALL: 2,
  WATER: 3,
  FOOD: 4,
  NEST: 5,
} as const;

export type CellType = (typeof Cell)[keyof typeof Cell];

export const CellNames: Record<number, string> = {
  [Cell.EMPTY]: 'Empty',
  [Cell.DIRT]: 'Dirt',
  [Cell.WALL]: 'Wall',
  [Cell.WATER]: 'Water',
  [Cell.FOOD]: 'Food',
  [Cell.NEST]: 'Nest',
};

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
    energyDrainPerTick: 0.0001,
    digEnergyCost: 0.005,
    foodEnergyGain: 0.3,
    nestEnergyGain: 0.5,
    /** Drop cargo and search again if the nest hasn't been found. */
    giveUpReturnTicks: 1800,
  },
  colony: {
    maxAnts: 120,
    spawnIntervalTicks: 50,
    initialAnts: 40,
  },
  world: {
    diffuseIntervalTicks: 2,
    cullIntervalTicks: 100,
    waterIntervalTicks: 3,
  },
} as const;
