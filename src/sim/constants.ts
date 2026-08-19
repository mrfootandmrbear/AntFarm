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

/**
 * What sits beneath a surface cell, stored in the world's second Uint8Array grid.
 *
 * The underground is a plan view, not a side view: it shares the surface grid's
 * x/y and carries a separate per-cell depth, so a shaft that descends shows up
 * as a track of increasing depth rather than as a column of cells.
 */
export const Under = {
  SOLID: 0,
  TUNNEL: 1,
  CHAMBER: 2,
  ENTRANCE: 3,
} as const;
export type UnderType = (typeof Under)[keyof typeof Under];

export const UnderNames: Record<number, string> = {
  [Under.SOLID]: 'Solid earth',
  [Under.TUNNEL]: 'Tunnel',
  [Under.CHAMBER]: 'Chamber',
  [Under.ENTRANCE]: 'Entrance',
};

/** Which layer an ant is on. Surface ants and underground ants never meet. */
export const Layer = {
  SURFACE: 0,
  UNDERGROUND: 1,
} as const;
export type LayerType = (typeof Layer)[keyof typeof Layer];

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
    bumpKillChance: 0.20,
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
    /** Height one fire-ant pellet adds at the crown of the mound. */
    fireDeposit: 0.05,
    /** Pellets landing beyond this range from the nest are not mound-building. */
    fireMoundRadius: 8,
    /** Harvester rim deposit — deliberately smaller, and capped low. */
    harvesterDeposit: 0.008,
    harvesterDiskRadius: 5,
    harvesterRimMax: 0.16,
    /** Height a harvester scrapes off the cell it stands on, keeping the disk flat. */
    harvesterClear: 0.01,
    /** A pellet still held after this long is scattered where the ant stands. */
    soilCarryTicks: 900,
    /** How much of a proper deposit that scattered spoil is worth. */
    spoilFraction: 0.12,
  },
  /**
   * The nest below the nest.
   *
   * Ants descend at an entrance, excavate, and bring the spoil back up — which
   * is where {@link SimConfig.mound}'s pellets come from once a colony has a
   * tunnel network. Depth is carried per cell in centimetre-ish units so a
   * plan-view grid can still say how far down a passage sits.
   */
  underground: {
    /** Deepest a passage can go. Harvester brood chambers live near this. */
    maxDepth: 120,
    /**
     * Chance per tick that an ant standing on its own doorway goes below to
     * work. Most of a real colony is underground at any moment; foragers are
     * the minority. Fire ants are the more aggressive diggers of the two.
     */
    fireDescendChance: 0.06,
    harvesterDescendChance: 0.07,
    /**
     * How long a shift below runs. Most of it is not digging — an ant moves
     * around the works, and cuts new passage only now and then. That is what
     * keeps a useful number of ants visible in the tunnels without the network
     * eating the whole map: the population below is descents x shift length,
     * but the network only grows by descents x cells cut per shift.
     *
     * Kept short: a shift this long pulled too much of the colony off the
     * surface at once (a 100-ant colony ran ~22% underground at steady state),
     * which starved corridor throughput in the chokepoint scenario even
     * though nothing about digging itself favored either species there. It
     * also turned out to be the thing keeping the fire-rivalry contest
     * unstable across seeds — shorter shifts hold both species' surface
     * numbers steadier, so the pile fight actually reflects bump/adjacent
     * kill chance instead of who happened to be underground.
     */
    shiftTicks: 400,
    /**
     * Hard cap on a shift. An ant that cannot find its way out — a plateau at
     * max depth, or a network the player carved apart — digs straight up and
     * takes its chances rather than being lost down there forever.
     */
    abandonTicks: 1500,
    /**
     * Chance per tick underground that an ant at a working face cuts passage.
     * This is where "fire ants are aggressive diggers" lives — not in how much
     * of the colony is below, which has to stay close between the two species
     * or the raiders simply stop turning up to raid.
     */
    fireDigChance: 0.006,
    harvesterDigChance: 0.003,
    /** Pellets an ant can hold. A full load ends the shift early. */
    loadCapacity: 3,
    /** Depth an ant must reach before it starts cutting rather than walking in. */
    workDepth: 24,
    /** Energy per tunnel cell excavated — far cheaper than surface digging. */
    digCost: 0.0008,
    /** Depth gained per cell of new tunnel. */
    descendStep: 6,
    /**
     * Fire-ant chambers emerge from density: a freshly cut cell with at least
     * this many passage neighbours is already a void, so it becomes a chamber.
     */
    fireChamberNeighbours: 6,
    /** Nothing may be cut further than this from the colony's own entrance. */
    maxSpread: 34,
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
