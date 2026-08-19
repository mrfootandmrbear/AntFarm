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
    /**
     * Lost-ant recovery: cumulative turning (in eighth-turns, reset on pickup/delivery)
     * past this forces a fresh random heading — catches ants oscillating in place that
     * stuckTimer's "no passable neighbor" check doesn't.
     */
    abortTurnThreshold: 70,
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
  /**
   * Surface relief. Height is stored per cell in world units where 1.0 reads as
   * "a mature fire-ant mound" — tall enough to see, small enough that an ant can
   * still climb it. Negative height is a scrape or a puddle basin.
   */
  terrain: {
    maxHeight: 1.2,
    minHeight: -0.7,
    /** Height added/removed per sculpt paint step at the brush centre. */
    sculptStep: 0.05,
    /**
     * Uphill weight penalty. A candidate cell `dh` higher than the ant's own is
     * weighted by `1 / (1 + uphillCost * dh)` — exactly 1 on flat ground, so a
     * world with no relief behaves bit-for-bit like one with no height at all.
     *
     * At the angle of repose below, the steepest slope a pile can hold, this is
     * a 0.79x penalty. Relief nudges traffic around a mound; it is not a wall,
     * and an ant can always climb its own nest.
     */
    uphillCost: 3,
    /** Downhill weight bonus: `1 + downhillGain * -dh`. Ants drift downslope. */
    downhillGain: 1,
    /** Loose soil slumps every N ticks — the mound settles instead of spiking. */
    slumpIntervalTicks: 12,
    /** Slope a pile holds without sliding (height units per cell). */
    angleOfRepose: 0.09,
    /** Fraction of the excess above the repose slope that moves per slump step. */
    slumpRate: 0.22,
  },
  /**
   * Excavated soil coming back to the surface.
   *
   * Fire ants pelletize spoil and dump it on the mound, so digging below is
   * literally what raises the ground above — a colony that keeps expanding keeps
   * building. Harvesters carry spoil out to the edge of their clearing instead,
   * which is why their nests read as a flat disk with a low rim and no mound.
   */
  mound: {
    /**
     * Chance per tick that an ant standing on its own mound turns around and
     * excavates below it, coming back up with a pellet. This is the colony's
     * real soil supply — surface digging runs out once the neighbourhood is
     * hollow, but there is always more earth underneath. Fire ants are the
     * aggressive diggers of the two.
     */
    fireExcavateChance: 0.08,
    harvesterExcavateChance: 0.03,
    /** Height one fire-ant pellet adds at the crown of the mound. */
    fireDeposit: 0.15,
    /** Pellets landing beyond this range from the nest are not mound-building. */
    fireMoundRadius: 8,
    /** Harvester rim deposit — deliberately smaller, and capped low. */
    harvesterDeposit: 0.02,
    harvesterDiskRadius: 5,
    harvesterRimMax: 0.16,
    /** Height a harvester scrapes off the cell it stands on, keeping the disk flat. */
    harvesterClear: 0.01,
    /** A pellet still held after this long is scattered where the ant stands. */
    soilCarryTicks: 900,
    /** How much of a proper deposit that scattered spoil is worth. */
    spoilFraction: 0.12,
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
