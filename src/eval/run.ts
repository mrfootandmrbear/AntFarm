/**
 * Headless success test: CORE / ADAPTATION / MEMORY.
 *
 * Do not optimize for fastest food delivery. Optimize for legible emergence.
 * A conveyor-belt lock-in or an immortal trail is a failed run.
 */
import { AntKind, Cell } from '../sim/constants';
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
  console.log(formatReport(report));
  process.exit(report.core.pass ? 0 : 1);
}
