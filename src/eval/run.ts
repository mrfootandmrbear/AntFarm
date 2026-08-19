/**
 * Headless success test: CORE / ADAPTATION / MEMORY.
 *
 * Do not optimize for fastest food delivery. Optimize for legible emergence.
 * A conveyor-belt lock-in or an immortal trail is a failed run.
 */
import { Cell } from '../sim/constants';
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
  console.log(formatReport(report));
  process.exit(report.core.pass ? 0 : 1);
}
