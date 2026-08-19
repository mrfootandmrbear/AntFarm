/**
 * Headless success test: CORE / ADAPTATION / MEMORY.
 *
 * Do not optimize for fastest food delivery. Optimize for legible emergence.
 * A conveyor-belt lock-in or an immortal trail is a failed run.
 */
import { AntKind, Cell, SimConfig } from '../sim/constants';
import { Rng } from '../sim/Rng';
import { SimulationEngine } from '../sim/SimulationEngine';

const W = 120;
const H = 80;
const NEST = { x: 24, y: 40 };
const FOOD = { x: 96, y: 40 };
const ANTS = 100;
const DEFAULT_SEED = 1842;

export interface KindResult {
  pass: boolean;
  notes: string[];
}

export interface EvalReport {
  seed: number;
  firstDiscovery: number | null;
  firstDelivery: number | null;
  stableRecruitment: number | null;
  foodDeliveredPct: number;
  corridorPeak: number;
  wallAdaptation: boolean;
  detourVisits: number;
  oldTrailDecayPct: number;
  resumeSpread: number;
  trailSpread: number;
  core: KindResult;
  adaptation: KindResult;
  memory: KindResult;
  pulse?: PulseResult;
  relocation?: RelocationResult;
  rivalry?: RivalryResult;
  predation?: PredationResult;
  multiFood?: MultiFoodResult;
  chokepoint?: ChokepointResult;
  soak?: SoakResult;
}

export interface PulseResult {
  pass: boolean;
  notes: string[];
  abundanceAnts: number;
  abundanceStore: number;
  abundanceFoodLeft: number;
  abundanceDelivered: number;
  scarcityAnts: number;
}

export interface RelocationResult {
  pass: boolean;
  notes: string[];
  newDeliveryTicks: number | null;
  oldCorridorAfter: number;
  newCorridorAfter: number;
}

export interface RivalryResult {
  pass: boolean;
  notes: string[];
  /** Mean harvesters / fire ants within the pile's neighborhood, late in the run. */
  harvestersAtPile: number;
  fireAtPile: number;
  controlHarvestersAtPile: number;
  harvestersAlive: number;
  fireAlive: number;
  controlHarvestersAlive: number;
  harvesterDelivered: number;
  fireDelivered: number;
}

export interface PredationResult {
  pass: boolean;
  notes: string[];
  startAnts: number;
  huntedAnts: number;
  controlAnts: number;
  lizardsAlive: number;
}

export interface MultiFoodResult {
  pass: boolean;
  notes: string[];
  nearTrail: number;
  farTrail: number;
  nearEaten: number;
  farEaten: number;
  delivered: number;
}

export interface ChokepointResult {
  pass: boolean;
  notes: string[];
  corridorCells: number;
  firstThrough: number | null;
  firstDelivery: number | null;
  transits: number;
  pastTheWall: number;
  corridorTrail: number;
  delivered: number;
}

export interface SoakResult {
  pass: boolean;
  notes: string[];
  ticks: number;
  endAnts: number;
  minAnts: number;
  maxAnts: number;
  minStore: number;
  maxStore: number;
  granaryCeiling: number;
  foodLeft: number;
  delivered: number;
  sampledCells: number;
  nonFiniteCells: number;
}

function makeEngine(seed: number): SimulationEngine {
  const engine = new SimulationEngine(W, H, seed);
  engine.allowSpawn = false;
  engine.allowWater = false;
  engine.fillDisk(NEST.x, NEST.y, 3, Cell.NEST);
  engine.fillDisk(FOOD.x, FOOD.y, 4, Cell.FOOD);
  engine.spawnAntsNear(NEST.x, NEST.y, ANTS);
  engine.world.initialFoodMass = engine.world.totalFoodMass();
  return engine;
}

function corridorMass(engine: SimulationEngine): number {
  const x0 = NEST.x + 8;
  const x1 = FOOD.x - 8;
  return engine.world.fieldMassRect(engine.world.foodField, x0, NEST.y - 5, x1, NEST.y + 5);
}

function tickUntil(
  engine: SimulationEngine,
  maxTick: number,
  pred: () => boolean,
): boolean {
  while (engine.world.tickCount < maxTick) {
    engine.tick();
    if (pred()) return true;
  }
  return false;
}

export function runEval(seed = DEFAULT_SEED): EvalReport {
  const notesCore: string[] = [];
  const notesAdapt: string[] = [];
  const notesMem: string[] = [];

  // ---- CORE: discover → deliver → trail ----
  const engine = makeEngine(seed);
  let firstDiscovery: number | null = null;
  let firstDelivery: number | null = null;
  let stableRecruitment: number | null = null;
  let recruitStreak = 0;
  let corridorPeak = 0;
  let trailSpread = 0;

  const coreHorizon = 4500;
  while (engine.world.tickCount < coreHorizon) {
    engine.tick();
    const t = engine.world.tickCount;
    if (firstDiscovery === null && engine.carryingCount() > 0) firstDiscovery = t;
    if (firstDelivery === null && engine.world.foodDelivered > 0.05) firstDelivery = t;

    const carrying = engine.carryingCount();
    if (firstDiscovery !== null && t >= firstDiscovery + 80 && carrying >= 6) {
      recruitStreak++;
      if (recruitStreak >= 40 && stableRecruitment === null) {
        stableRecruitment = t;
        trailSpread = engine.searchingSpread();
      }
    } else {
      recruitStreak = 0;
    }

    const c = corridorMass(engine);
    if (c > corridorPeak) corridorPeak = c;

    if (stableRecruitment !== null && firstDelivery !== null && t >= firstDelivery + 80) break;
    if (stableRecruitment !== null && t >= stableRecruitment + 900) break;
  }

  const delivered = engine.world.foodDelivered;
  const initial = engine.world.initialFoodMass || 1;
  // Each pickup is 0.1 food units; nest store += 0.1 per delivery.
  const foodDeliveredPct = (delivered / initial) * 100;

  if (firstDiscovery === null) notesCore.push('no food discovery');
  else if (firstDiscovery < 70) notesCore.push('discovery too fast (little wander)');
  else if (firstDiscovery > 2800) notesCore.push('discovery very late');

  if (firstDelivery === null) notesCore.push('no food delivered to nest');
  if (stableRecruitment === null) notesCore.push('no stable recruitment (trail did not establish)');
  if (corridorPeak < 8) notesCore.push(`food-scent corridor weak (${corridorPeak.toFixed(1)})`);

  // Instant conveyor: discovered and fully recruited with almost no gap.
  if (
    firstDiscovery !== null &&
    stableRecruitment !== null &&
    stableRecruitment - firstDiscovery < 60
  ) {
    notesCore.push('conveyor-belt lock-in (recruitment immediately after discovery)');
  }

  const corePass =
    firstDiscovery !== null &&
    firstDiscovery >= 70 &&
    firstDelivery !== null &&
    stableRecruitment !== null &&
    corridorPeak >= 8 &&
    !(stableRecruitment - firstDiscovery < 60);

  // ---- ADAPTATION: rock wall across the corridor ----
  const midX = Math.floor((NEST.x + FOOD.x) / 2);
  engine.placeWallWithGap(midX, 4, H - 5, 10, 4); // gap at the north
  const storeBeforeWall = engine.world.foodDelivered;
  let detourVisits = 0;
  const adaptHorizon = engine.world.tickCount + 3500;
  while (engine.world.tickCount < adaptHorizon) {
    engine.tick();
    for (const a of engine.ants) {
      if (!a.alive) continue;
      if (Math.abs(a.x - midX) <= 1 && a.y <= 16) detourVisits++;
    }
  }
  const deliveredAfterWall = engine.world.foodDelivered - storeBeforeWall;
  const wallAdaptation = deliveredAfterWall >= 0.4 && detourVisits >= 20;
  if (deliveredAfterWall < 0.4) notesAdapt.push('no meaningful delivery after wall');
  if (detourVisits < 20) notesAdapt.push('ants did not use the northern gap');
  if (wallAdaptation) notesAdapt.push('colony found the gap and kept foraging');

  // ---- MEMORY: remove food, wait for remaining returners, watch trail forget ----
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (engine.world.get(x, y) === Cell.FOOD) engine.world.set(x, y, Cell.DIRT);
    }
  }
  const settleCap = engine.world.tickCount + 2000;
  while (engine.world.tickCount < settleCap && engine.carryingCount() > 0) {
    engine.tick();
  }
  const mass0 = engine.world.fieldMass(engine.world.foodField);
  const forgetTicks = 350;
  const forgetEnd = engine.world.tickCount + forgetTicks;
  while (engine.world.tickCount < forgetEnd) engine.tick();
  const mass1 = engine.world.fieldMass(engine.world.foodField);
  const oldTrailDecayPct = mass0 > 0.01 ? ((mass0 - mass1) / mass0) * 100 : 100;
  const resumeSpread = engine.searchingSpread();

  if (oldTrailDecayPct < 20) notesMem.push('trail barely decayed (immortal scent)');
  if (oldTrailDecayPct > 90 && mass0 > 5) notesMem.push('trail vanished immediately (no memory)');
  if (resumeSpread < 8) notesMem.push('searchers still clumped; exploration did not resume');
  const memoryPass =
    oldTrailDecayPct >= 20 &&
    oldTrailDecayPct <= 90 &&
    resumeSpread >= 8;

  if (memoryPass) notesMem.push('unreinforced trail faded; colony spread back out');

  return {
    seed,
    firstDiscovery,
    firstDelivery,
    stableRecruitment,
    foodDeliveredPct,
    corridorPeak,
    wallAdaptation,
    detourVisits,
    oldTrailDecayPct,
    resumeSpread,
    trailSpread,
    core: { pass: corePass, notes: notesCore },
    adaptation: { pass: wallAdaptation, notes: notesAdapt },
    memory: { pass: memoryPass, notes: notesMem },
  };
}

/** E10/E11-lite: food should sustain a colony; no food should not. Spawn is on. */
export function runPulse(seed = DEFAULT_SEED): PulseResult {
  const notes: string[] = [];
  const horizon = 22000;

  const rich = new SimulationEngine(W, H, seed);
  rich.allowWater = false;
  rich.fillDisk(NEST.x, NEST.y, 3, Cell.NEST);
  rich.fillDisk(FOOD.x, FOOD.y, 4, Cell.FOOD);
  rich.spawnAntsNear(NEST.x, NEST.y, ANTS);
  while (rich.world.tickCount < horizon) rich.tick();

  const poor = new SimulationEngine(W, H, seed);
  poor.allowWater = false;
  poor.fillDisk(NEST.x, NEST.y, 3, Cell.NEST);
  poor.spawnAntsNear(NEST.x, NEST.y, ANTS);
  while (poor.world.tickCount < horizon) poor.tick();

  const abundanceAnts = rich.aliveCount();
  const abundanceStore = rich.world.nestFoodStore;
  const abundanceFoodLeft = rich.world.totalFoodMass();
  const abundanceDelivered = rich.world.foodDelivered;
  const scarcityAnts = poor.aliveCount();

  if (abundanceAnts < 70) notes.push(`abundance colony collapsed (${abundanceAnts} ants)`);
  if (abundanceDelivered < 2) notes.push('abundance delivered almost nothing');
  if (scarcityAnts > 25) notes.push(`scarcity colony did not shrink (${scarcityAnts} ants)`);

  const pass = abundanceAnts >= 70 && abundanceDelivered >= 2 && scarcityAnts <= 25;
  if (pass) notes.push('food sustains the mound; empty world does not');

  return {
    pass,
    notes,
    abundanceAnts,
    abundanceStore,
    abundanceFoodLeft,
    abundanceDelivered,
    scarcityAnts,
  };
}

/** E07: after a trail exists, move the food. Old scent should yield; a new corridor should work. */
export function runRelocation(seed = DEFAULT_SEED): RelocationResult {
  const notes: string[] = [];
  const engine = makeEngine(seed);
  const food2 = { x: FOOD.x, y: 12 };

  let disc: number | null = null;
  let rec: number | null = null;
  let streak = 0;
  while (engine.world.tickCount < 4500) {
    engine.tick();
    const t = engine.world.tickCount;
    if (disc === null && engine.carryingCount() > 0) disc = t;
    const carrying = engine.carryingCount();
    if (disc !== null && t >= disc + 80 && carrying >= 6) {
      streak++;
      if (streak >= 40 && rec === null) rec = t;
    } else streak = 0;
    if (rec !== null && engine.world.foodDelivered > 0.05) break;
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (engine.world.get(x, y) === Cell.FOOD) engine.world.set(x, y, Cell.DIRT);
    }
  }
  engine.fillDisk(food2.x, food2.y, 4, Cell.FOOD);

  const delivered0 = engine.world.foodDelivered;
  const start = engine.world.tickCount;
  let newDeliveryTicks: number | null = null;
  while (engine.world.tickCount < start + 4000) {
    engine.tick();
    if (newDeliveryTicks === null && engine.world.foodDelivered >= delivered0 + 0.4) {
      newDeliveryTicks = engine.world.tickCount - start;
    }
  }

  const oldCorridorAfter = engine.world.fieldMassRect(
    engine.world.foodField,
    NEST.x + 8,
    NEST.y - 5,
    FOOD.x - 8,
    NEST.y + 5,
  );
  const newCorridorAfter = engine.world.fieldMassRect(
    engine.world.foodField,
    NEST.x + 8,
    food2.y - 6,
    FOOD.x - 8,
    food2.y + 6,
  );

  if (newDeliveryTicks === null) notes.push('no deliveries from the new pile');
  if (newCorridorAfter < 12) notes.push(`new corridor weak (${newCorridorAfter.toFixed(1)})`);
  if (newCorridorAfter < oldCorridorAfter * 0.45) {
    notes.push('old corridor still dominates after the move');
  }

  const pass =
    newDeliveryTicks !== null &&
    newCorridorAfter >= 12 &&
    newCorridorAfter >= oldCorridorAfter * 0.45;
  if (pass) notes.push('moved food; traffic found the new pile');

  return { pass, notes, newDeliveryTicks, oldCorridorAfter, newCorridorAfter };
}

/**
 * E_FIRE: one pile between a harvester mound and a fire mound.
 *
 * Fire ants should end up holding contested food. A control run without the
 * fire colony is the reference — otherwise a scenario where harvesters simply
 * starve would look like a win for the raiders.
 */
export function runFireRivalry(seed = DEFAULT_SEED): RivalryResult {
  const notes: string[] = [];
  const pile = { x: 60, y: 40 };
  const harvNest = { x: 24, y: 40 };
  const fireNest = { x: 96, y: 40 };
  const perColony = 60;
  const horizon = 2000;
  const pileRadius = 8;

  function build(withFire: boolean): SimulationEngine {
    const e = new SimulationEngine(W, H, seed);
    e.allowSpawn = false;
    e.allowWater = false;
    e.fillDisk(harvNest.x, harvNest.y, 3, Cell.NEST);
    if (withFire) e.fillDisk(fireNest.x, fireNest.y, 3, Cell.FIRE_NEST);
    e.fillDisk(pile.x, pile.y, 5, Cell.FOOD);
    e.spawnAntsNear(harvNest.x, harvNest.y, perColony);
    if (withFire) e.spawnAntsNear(fireNest.x, fireNest.y, perColony, AntKind.FIRE);
    e.world.initialFoodMass = e.world.totalFoodMass();
    return e;
  }

  function atPile(e: SimulationEngine, kind: number): number {
    let n = 0;
    for (const a of e.ants) {
      if (!a.alive || a.kind !== kind) continue;
      if (Math.max(Math.abs(a.x - pile.x), Math.abs(a.y - pile.y)) <= pileRadius) n++;
    }
    return n;
  }

  /** Mean occupancy over the last 30% of the run, once the contest has settled. */
  function occupancy(e: SimulationEngine): { harv: number; fire: number } {
    const lateStart = Math.floor(horizon * 0.7);
    let harv = 0;
    let fire = 0;
    let samples = 0;
    while (e.world.tickCount < horizon) {
      e.tick();
      const t = e.world.tickCount;
      if (t % 10 !== 0 || t < lateStart) continue;
      harv += atPile(e, AntKind.HARVESTER);
      fire += atPile(e, AntKind.FIRE);
      samples++;
    }
    const n = Math.max(1, samples);
    return { harv: harv / n, fire: fire / n };
  }

  const contested = build(true);
  const contestedOcc = occupancy(contested);
  const control = build(false);
  const controlOcc = occupancy(control);

  const fireAlive = contested.fireAliveCount();
  const harvestersAlive = contested.aliveCount() - fireAlive;
  const controlHarvestersAlive = control.aliveCount();
  const harvesterLosses = perColony - harvestersAlive;
  const fireLosses = perColony - fireAlive;

  if (contestedOcc.fire < contestedOcc.harv * 1.5) {
    notes.push(
      `fire ants did not take the pile (${contestedOcc.fire.toFixed(2)} vs ${contestedOcc.harv.toFixed(2)})`,
    );
  }
  if (harvestersAlive > controlHarvestersAlive * 0.6) {
    notes.push(
      `harvesters barely paid for the contest (${harvestersAlive} vs ${controlHarvestersAlive} uncontested)`,
    );
  }
  if (fireLosses >= harvesterLosses) {
    notes.push(`raid cost the raiders more (${fireLosses} fire vs ${harvesterLosses} harvester)`);
  }

  const pass =
    contestedOcc.fire >= contestedOcc.harv * 1.5 &&
    harvestersAlive <= controlHarvestersAlive * 0.6 &&
    fireLosses < harvesterLosses;
  if (pass) notes.push('fire ants displaced harvesters from the shared pile');

  return {
    pass,
    notes,
    harvestersAtPile: contestedOcc.harv,
    fireAtPile: contestedOcc.fire,
    controlHarvestersAtPile: controlOcc.harv,
    harvestersAlive,
    fireAlive,
    controlHarvestersAlive,
    harvesterDelivered: contested.world.foodDelivered,
    fireDelivered: contested.world.fireFoodDelivered,
  };
}

/**
 * E_LIZARD: a colony with a horned lizard loose in it should shrink.
 *
 * Paired with a lizard-free control so the drop has to be predation rather than
 * the colony quietly starving.
 */
export function runLizardPredation(seed = DEFAULT_SEED): PredationResult {
  const notes: string[] = [];
  const ants = 80;
  const horizon = 6000;

  function build(withLizard: boolean): SimulationEngine {
    const e = new SimulationEngine(W, H, seed);
    e.allowSpawn = false;
    e.allowWater = false;
    e.fillDisk(NEST.x, NEST.y, 3, Cell.NEST);
    e.fillDisk(FOOD.x, FOOD.y, 4, Cell.FOOD);
    e.spawnAntsNear(NEST.x, NEST.y, ants);
    if (withLizard) e.spawnLizardAt(Math.floor((NEST.x + FOOD.x) / 2), NEST.y);
    e.world.initialFoodMass = e.world.totalFoodMass();
    return e;
  }

  const hunted = build(true);
  while (hunted.world.tickCount < horizon) hunted.tick();
  const control = build(false);
  while (control.world.tickCount < horizon) control.tick();

  const startAnts = ants;
  const huntedAnts = hunted.aliveCount();
  const controlAnts = control.aliveCount();
  const lizardsAlive = hunted.lizardCount();

  if (huntedAnts > startAnts * 0.75) {
    notes.push(`colony barely shrank with a lizard in it (${huntedAnts}/${startAnts})`);
  }
  if (controlAnts < startAnts * 0.9) {
    notes.push(`control colony shrank on its own (${controlAnts}/${startAnts}) — not predation`);
  }
  if (lizardsAlive < 1) notes.push('lizard died before the horizon');

  const pass =
    huntedAnts <= startAnts * 0.75 && controlAnts >= startAnts * 0.9 && lizardsAlive >= 1;
  if (pass) notes.push('lizard ate its way through the colony; control held steady');

  return { pass, notes, startAnts, huntedAnts, controlAnts, lizardsAlive };
}

/**
 * E_MULTI_FOOD: two piles at different distances from one nest.
 *
 * The worry is first-discovery lock-in — a colony that finds the near pile,
 * paves a trail to it, and never notices the far one. Both piles should end up
 * with a food trail of their own and visible bites taken out of them.
 */
export function runMultiFood(seed = DEFAULT_SEED): MultiFoodResult {
  const notes: string[] = [];
  const near = { x: 52, y: 22 };
  const far = { x: 100, y: 58 };
  const horizon = 6000;

  const engine = new SimulationEngine(W, H, seed);
  engine.allowSpawn = false;
  engine.allowWater = false;
  engine.fillDisk(NEST.x, NEST.y, 3, Cell.NEST);
  engine.fillDisk(near.x, near.y, 4, Cell.FOOD);
  engine.fillDisk(far.x, far.y, 4, Cell.FOOD);
  engine.spawnAntsNear(NEST.x, NEST.y, ANTS);
  engine.world.initialFoodMass = engine.world.totalFoodMass();

  const pileMass = (p: { x: number; y: number }): number => {
    let s = 0;
    for (let y = p.y - 6; y <= p.y + 6; y++) {
      for (let x = p.x - 6; x <= p.x + 6; x++) {
        if (engine.world.inBounds(x, y)) s += engine.world.foodAmount[engine.world.idx(x, y)];
      }
    }
    return s;
  };
  const pileTrail = (p: { x: number; y: number }): number =>
    engine.world.fieldMassRect(engine.world.foodField, p.x - 7, p.y - 7, p.x + 7, p.y + 7);

  const nearStart = pileMass(near);
  const farStart = pileMass(far);
  while (engine.world.tickCount < horizon) engine.tick();

  const nearTrail = pileTrail(near);
  const farTrail = pileTrail(far);
  const nearEaten = nearStart - pileMass(near);
  const farEaten = farStart - pileMass(far);

  if (nearTrail < 20) notes.push(`near pile has no trail (${nearTrail.toFixed(1)})`);
  if (farTrail < 20) notes.push(`far pile has no trail (${farTrail.toFixed(1)})`);
  if (nearEaten < 2) notes.push(`near pile untouched (${nearEaten.toFixed(1)} eaten)`);
  if (farEaten < 2) notes.push(`far pile untouched (${farEaten.toFixed(1)} eaten)`);

  const pass = nearTrail >= 20 && farTrail >= 20 && nearEaten >= 2 && farEaten >= 2;
  if (pass) notes.push('both piles carry their own trail; neither was ignored');

  return {
    pass,
    notes,
    nearTrail,
    farTrail,
    nearEaten,
    farEaten,
    delivered: engine.world.foodDelivered,
  };
}

/**
 * E_CHOKEPOINT: the only way to the food is a two-cell slot through rock.
 *
 * Traffic in both directions has to share it, and the two trails have to
 * survive being squeezed into the same cells. Rock, not dirt, so nobody digs
 * their way around the problem.
 */
export function runChokepoint(seed = DEFAULT_SEED): ChokepointResult {
  const notes: string[] = [];
  const food = { x: 100, y: 40 };
  const wallX0 = 57;
  const wallX1 = 63;
  const gapY0 = 39;
  const gapY1 = 40;
  const horizon = 8000;

  const engine = new SimulationEngine(W, H, seed);
  engine.allowSpawn = false;
  engine.allowWater = false;
  engine.fillDisk(NEST.x, NEST.y, 3, Cell.NEST);
  engine.fillDisk(food.x, food.y, 4, Cell.FOOD);
  for (let x = wallX0; x <= wallX1; x++) {
    for (let y = 0; y < H; y++) {
      if (y === gapY0 || y === gapY1) continue;
      engine.world.set(x, y, Cell.WALL);
    }
  }
  engine.spawnAntsNear(NEST.x, NEST.y, ANTS);
  engine.world.initialFoodMass = engine.world.totalFoodMass();

  let transits = 0;
  let firstThrough: number | null = null;
  let firstDelivery: number | null = null;
  while (engine.world.tickCount < horizon) {
    engine.tick();
    const t = engine.world.tickCount;
    if (firstDelivery === null && engine.world.foodDelivered > 0.05) firstDelivery = t;
    for (const a of engine.ants) {
      if (!a.alive) continue;
      if (a.x < wallX0 || a.x > wallX1) continue;
      if (a.y !== gapY0 && a.y !== gapY1) continue;
      transits++;
      if (firstThrough === null) firstThrough = t;
    }
  }

  let pastTheWall = 0;
  for (const a of engine.ants) if (a.alive && a.x > wallX1) pastTheWall++;
  const corridorTrail = engine.world.fieldMassRect(
    engine.world.foodField,
    wallX0,
    gapY0,
    wallX1,
    gapY1,
  );
  const delivered = engine.world.foodDelivered;

  if (firstThrough === null) notes.push('no ant ever entered the corridor');
  else if (firstThrough > 1500) notes.push(`corridor found very late (${firstThrough} ticks)`);
  if (transits < 300) notes.push(`corridor barely used (${transits} cell-visits)`);
  if (delivered < 0.3) notes.push('food never made it back through the corridor');
  if (corridorTrail < 1) {
    notes.push(`no food trail laid through the slot (${corridorTrail.toFixed(1)})`);
  }

  const pass =
    firstThrough !== null &&
    firstThrough <= 1500 &&
    transits >= 300 &&
    delivered >= 0.3 &&
    corridorTrail >= 1;
  if (pass) notes.push('two-way traffic squeezed through a two-cell slot and delivered');

  return {
    pass,
    notes,
    corridorCells: 2,
    firstThrough,
    firstDelivery,
    transits,
    pastTheWall,
    corridorTrail,
    delivered,
  };
}

/**
 * E_SOAK: 100k ticks of one colony on one pile, watching for slow rot.
 *
 * The granary is the thing under test. Hatching spends it, hungry searchers sip
 * it, deliveries refill it — a sign error or a missing floor shows up not in the
 * first thousand ticks but after tens of thousands, as a colony that quietly
 * dies, breeds past its cap, or banks food it never collected.
 *
 * The pile is deliberately large enough to outlast the run: a colony starving
 * because the world ran out of food is a finished story, not an instability.
 */
export function runSoak(seed = DEFAULT_SEED, ticks = 100_000): SoakResult {
  const notes: string[] = [];
  const engine = new SimulationEngine(W, H, seed);
  engine.allowWater = false;
  engine.fillDisk(NEST.x, NEST.y, 3, Cell.NEST);
  engine.fillDisk(FOOD.x, FOOD.y, 12, Cell.FOOD);
  engine.spawnAntsNear(NEST.x, NEST.y, ANTS);
  engine.world.initialFoodMass = engine.world.totalFoodMass();

  // Nothing can be stored that was never on the ground, so the starting mass is
  // the granary's physical ceiling — no invented constant to drift out of date.
  const granaryCeiling = engine.world.initialFoodMass;
  const antCap = SimConfig.colony.maxAnts;
  const antTolerance = 5;

  let minAnts = Infinity;
  let maxAnts = 0;
  let minStore = Infinity;
  let maxStore = -Infinity;
  let storeEscaped = false;

  while (engine.world.tickCount < ticks) {
    engine.tick();
    const store = engine.world.nestFoodStore;
    if (store < minStore) minStore = store;
    if (store > maxStore) maxStore = store;
    if (!Number.isFinite(store) || store < 0 || store > granaryCeiling) storeEscaped = true;
    const alive = engine.aliveCount();
    if (alive < minAnts) minAnts = alive;
    if (alive > maxAnts) maxAnts = alive;
  }

  // Spot-check for NaN/Infinity the way a player would never notice it: pick a
  // few cells at random. The full scan behind it is cheap and catches the rest.
  const fields = [
    engine.world.homeField,
    engine.world.foodField,
    engine.world.fireHomeField,
    engine.world.fireFoodField,
  ];
  const probe = new Rng(seed ^ 0x50a4);
  let sampledCells = 0;
  let nonFiniteCells = 0;
  for (let i = 0; i < 10; i++) {
    const cell = probe.int(W * H);
    for (const field of fields) {
      sampledCells++;
      if (!Number.isFinite(field.getAt(cell))) nonFiniteCells++;
    }
  }
  for (const field of fields) {
    for (let i = 0; i < field.current.length; i++) {
      if (!Number.isFinite(field.current[i])) nonFiniteCells++;
    }
  }

  const endAnts = engine.aliveCount();
  const foodLeft = engine.world.totalFoodMass();

  if (endAnts <= 0) notes.push('colony went extinct');
  if (maxAnts > antCap + antTolerance) {
    notes.push(`colony exceeded its cap (${maxAnts} > ${antCap})`);
  }
  if (storeEscaped) {
    notes.push(
      `granary left [0, ${granaryCeiling.toFixed(0)}] (saw ${minStore.toFixed(2)}..${maxStore.toFixed(2)})`,
    );
  }
  if (nonFiniteCells > 0) notes.push(`${nonFiniteCells} non-finite pheromone cells`);
  if (foodLeft <= 0) notes.push('pile exhausted — soak no longer tests a fed colony');

  const pass =
    endAnts > 0 &&
    maxAnts <= antCap + antTolerance &&
    !storeEscaped &&
    nonFiniteCells === 0 &&
    foodLeft > 0;
  if (pass) notes.push('colony held its cap and its granary for 100k ticks');

  return {
    pass,
    notes,
    ticks,
    endAnts,
    minAnts: minAnts === Infinity ? 0 : minAnts,
    maxAnts,
    minStore: minStore === Infinity ? 0 : minStore,
    maxStore: maxStore === -Infinity ? 0 : maxStore,
    granaryCeiling,
    foodLeft,
    delivered: engine.world.foodDelivered,
    sampledCells,
    nonFiniteCells,
  };
}

export function formatReport(r: EvalReport): string {
  const yn = (p: boolean) => (p ? 'PASS' : 'FAIL');
  return [
    `Seed ${r.seed}`,
    ``,
    `Trail formation: ${yn(r.core.pass)}`,
    `First discovery: ${r.firstDiscovery ?? 'never'} ticks`,
    `Stable recruitment: ${r.stableRecruitment ?? 'never'} ticks`,
    `Food delivered: ${r.foodDeliveredPct.toFixed(1)}%`,
    `Corridor peak: ${r.corridorPeak.toFixed(1)}`,
    `Wall adaptation: ${yn(r.adaptation.pass)} (detour visits ${r.detourVisits})`,
    `Old-trail decay: ${r.oldTrailDecayPct.toFixed(1)}%`,
    `Resume spread: ${r.resumeSpread.toFixed(1)} (trail-time ${r.trailSpread.toFixed(1)})`,
    ``,
    `CORE: ${yn(r.core.pass)}${r.core.notes.length ? ' — ' + r.core.notes.join('; ') : ''}`,
    `ADAPTATION: ${yn(r.adaptation.pass)}${r.adaptation.notes.length ? ' — ' + r.adaptation.notes.join('; ') : ''}`,
    `MEMORY: ${yn(r.memory.pass)}${r.memory.notes.length ? ' — ' + r.memory.notes.join('; ') : ''}`,
    r.pulse
      ? `PULSE: ${yn(r.pulse.pass)} — rich ${r.pulse.abundanceAnts} ants / store ${r.pulse.abundanceStore.toFixed(1)} / delivered ${r.pulse.abundanceDelivered.toFixed(1)}; poor ${r.pulse.scarcityAnts} ants${r.pulse.notes.length ? ' — ' + r.pulse.notes.join('; ') : ''}`
      : '',
    r.relocation
      ? `RELOCATE: ${yn(r.relocation.pass)} — new delivery ${r.relocation.newDeliveryTicks ?? 'never'} ticks; corridors old ${r.relocation.oldCorridorAfter.toFixed(0)} / new ${r.relocation.newCorridorAfter.toFixed(0)}${r.relocation.notes.length ? ' — ' + r.relocation.notes.join('; ') : ''}`
      : '',
    r.rivalry
      ? `FIRE: ${yn(r.rivalry.pass)} — pile fire ${r.rivalry.fireAtPile.toFixed(2)} / harvester ${r.rivalry.harvestersAtPile.toFixed(2)} (uncontested ${r.rivalry.controlHarvestersAtPile.toFixed(2)}); survivors ${r.rivalry.harvestersAlive} harvester + ${r.rivalry.fireAlive} fire vs ${r.rivalry.controlHarvestersAlive} uncontested${r.rivalry.notes.length ? ' — ' + r.rivalry.notes.join('; ') : ''}`
      : '',
    r.predation
      ? `LIZARD: ${yn(r.predation.pass)} — ${r.predation.startAnts} ants → ${r.predation.huntedAnts} hunted / ${r.predation.controlAnts} unhunted; ${r.predation.lizardsAlive} lizard${r.predation.lizardsAlive === 1 ? '' : 's'} left${r.predation.notes.length ? ' — ' + r.predation.notes.join('; ') : ''}`
      : '',
    r.multiFood
      ? `MULTI: ${yn(r.multiFood.pass)} — trails near ${r.multiFood.nearTrail.toFixed(0)} / far ${r.multiFood.farTrail.toFixed(0)}; eaten near ${r.multiFood.nearEaten.toFixed(1)} / far ${r.multiFood.farEaten.toFixed(1)}${r.multiFood.notes.length ? ' — ' + r.multiFood.notes.join('; ') : ''}`
      : '',
    r.chokepoint
      ? `CHOKE: ${yn(r.chokepoint.pass)} — ${r.chokepoint.corridorCells}-cell slot; first through ${r.chokepoint.firstThrough ?? 'never'} ticks; ${r.chokepoint.transits} cell-visits; delivered ${r.chokepoint.delivered.toFixed(1)}; slot trail ${r.chokepoint.corridorTrail.toFixed(1)}${r.chokepoint.notes.length ? ' — ' + r.chokepoint.notes.join('; ') : ''}`
      : '',
    r.soak
      ? `SOAK: ${yn(r.soak.pass)} — ${(r.soak.ticks / 1000).toFixed(0)}k ticks; ants ${r.soak.minAnts}..${r.soak.maxAnts} → ${r.soak.endAnts}; granary ${r.soak.minStore.toFixed(2)}..${r.soak.maxStore.toFixed(2)} of ${r.soak.granaryCeiling.toFixed(0)}; food left ${r.soak.foodLeft.toFixed(0)}; ${r.soak.nonFiniteCells} non-finite${r.soak.notes.length ? ' — ' + r.soak.notes.join('; ') : ''}`
      : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

const isMain = process.argv[1] && /eval\/run\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const seedArg = process.argv.find((a) => a.startsWith('--seed='));
  const seed = seedArg ? parseInt(seedArg.split('=')[1], 10) : DEFAULT_SEED;
  const report = runEval(seed);
  report.pulse = runPulse(seed);
  report.relocation = runRelocation(seed);
  report.rivalry = runFireRivalry(seed);
  report.predation = runLizardPredation(seed);
  report.multiFood = runMultiFood(seed);
  report.chokepoint = runChokepoint(seed);
  // The soak is ~20s on its own. `--skip-soak` keeps the tuner's loop short;
  // CI runs the whole thing.
  if (!process.argv.includes('--skip-soak')) report.soak = runSoak(seed);
  console.log(formatReport(report));
  process.exit(report.core.pass ? 0 : 1);
}
