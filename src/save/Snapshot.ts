/**
 * Serializing a live world to plain JSON and back, exactly.
 *
 * "Exactly" is the whole point: a world that reloads must keep running the same
 * story it would have run, so the PRNG state and every Float32 pheromone value
 * round-trip bit-for-bit (typed-array bytes, base64) rather than through decimal
 * text. Nothing here touches the DOM or localStorage — {@link SaveStore} does
 * that — and nothing here is used by the eval harness, which always starts from
 * a fresh seed by design.
 */
import { Ant, AntState, AntStateType } from '../sim/Ant';
import { AntKind, AntKindType, Cell } from '../sim/constants';
import { DiffusingField } from '../sim/DiffusingField';
import { Lizard } from '../sim/Lizard';
import { SimulationEngine } from '../sim/SimulationEngine';

export const SNAPSHOT_VERSION = 2;

/** A Float32 array as either raw bytes or index/value pairs, whichever is smaller. */
export type FloatBlob =
  | { kind: 'dense'; length: number; data: string }
  | { kind: 'sparse'; length: number; indices: string; values: string };

export interface AntSnapshot {
  x: number;
  y: number;
  nestX: number;
  nestY: number;
  kind: AntKindType;
  state: AntStateType;
  carrying: boolean;
  dir: number;
  energy: number;
  stuckTimer: number;
  digCooldown: number;
  returnTicks: number;
  prey: boolean;
  /** Cumulative turn for lost-ant recovery; absent in pre-abort-trip saves. */
  cumulativeTurn?: number;
  /** This ant's own Rng state; absent in pre-per-ant-seeding saves. */
  rngState?: number;
}

export interface LizardSnapshot {
  x: number;
  y: number;
  dir: number;
  energy: number;
  eatingTicks: number;
  tongueCooldown: number;
  swarmTicks: number;
}

export interface WorldSnapshot {
  version: number;
  savedAt: number;
  width: number;
  height: number;
  tickCount: number;
  /** Raw mulberry32 state, so the resumed world draws the same numbers. */
  rngState: number;
  /** Count of ants ever spawned, so newly hatched ants keep drawing fresh per-ant seeds. */
  antSpawnCount?: number;
  nestFoodStore: number;
  fireNestFoodStore: number;
  foodDelivered: number;
  fireFoodDelivered: number;
  initialFoodMass: number;
  allowSpawn: boolean;
  allowWater: boolean;
  cells: string;
  foodAmount: FloatBlob;
  /** Surface relief. Added in version 2; older saves are simply flat. */
  heightMap: FloatBlob;
  homeField: FloatBlob;
  foodField: FloatBlob;
  fireHomeField: FloatBlob;
  fireFoodField: FloatBlob;
  ants: AntSnapshot[];
  lizards: LizardSnapshot[];
}

// ---------- base64 for typed arrays ----------

const CHUNK = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function viewBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/** Trails are mostly empty grid; index/value pairs beat raw bytes below half full. */
function encodeFloats(values: Float32Array): FloatBlob {
  let nonZero = 0;
  for (let i = 0; i < values.length; i++) if (values[i] !== 0) nonZero++;

  if (nonZero * 2 >= values.length) {
    return { kind: 'dense', length: values.length, data: bytesToBase64(viewBytes(values)) };
  }

  const indices = new Uint32Array(nonZero);
  const packed = new Float32Array(nonZero);
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === 0) continue;
    indices[n] = i;
    packed[n] = values[i];
    n++;
  }
  return {
    kind: 'sparse',
    length: values.length,
    indices: bytesToBase64(viewBytes(indices)),
    values: bytesToBase64(viewBytes(packed)),
  };
}

/** Fill `target` in place from a blob. Throws if the saved length disagrees. */
function decodeFloatsInto(blob: FloatBlob, target: Float32Array): void {
  if (blob.length !== target.length) {
    throw new Error(`float blob length ${blob.length} != ${target.length}`);
  }
  target.fill(0);
  if (blob.kind === 'dense') {
    const bytes = base64ToBytes(blob.data);
    target.set(new Float32Array(bytes.buffer, bytes.byteOffset, blob.length));
    return;
  }
  const idxBytes = base64ToBytes(blob.indices);
  const valBytes = base64ToBytes(blob.values);
  const indices = new Uint32Array(idxBytes.buffer, idxBytes.byteOffset, idxBytes.byteLength / 4);
  const values = new Float32Array(valBytes.buffer, valBytes.byteOffset, valBytes.byteLength / 4);
  for (let i = 0; i < indices.length; i++) target[indices[i]] = values[i];
}

// ---------- snapshot ----------

/** Capture everything needed to resume this engine exactly where it stands. */
export function captureSnapshot(engine: SimulationEngine): WorldSnapshot {
  const world = engine.world;
  const ants: AntSnapshot[] = [];
  for (const ant of engine.ants) {
    if (!ant.alive) continue;
    ants.push({
      x: ant.x,
      y: ant.y,
      nestX: ant.nestX,
      nestY: ant.nestY,
      kind: ant.kind,
      state: ant.state,
      carrying: ant.carrying,
      dir: ant.dir,
      energy: ant.energy,
      stuckTimer: ant.stuckTimer,
      digCooldown: ant.digCooldown,
      returnTicks: ant.returnTicks,
      prey: ant.prey,
      rngState: ant.rng.getState(),
      cumulativeTurn: ant.cumulativeTurn,
    });
  }

  const lizards: LizardSnapshot[] = [];
  for (const lizard of engine.lizards) {
    if (!lizard.alive) continue;
    lizards.push({
      x: lizard.x,
      y: lizard.y,
      dir: lizard.dir,
      energy: lizard.energy,
      eatingTicks: lizard.eatingTicks,
      tongueCooldown: lizard.tongueCooldown,
      swarmTicks: lizard.swarmTicks,
    });
  }

  return {
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    width: world.width,
    height: world.height,
    tickCount: world.tickCount,
    rngState: world.rng.getState(),
    antSpawnCount: world.antSpawnCount,
    nestFoodStore: world.nestFoodStore,
    fireNestFoodStore: world.fireNestFoodStore,
    foodDelivered: world.foodDelivered,
    fireFoodDelivered: world.fireFoodDelivered,
    initialFoodMass: world.initialFoodMass,
    allowSpawn: engine.allowSpawn,
    allowWater: engine.allowWater,
    cells: bytesToBase64(world.cells),
    foodAmount: encodeFloats(world.foodAmount),
    heightMap: encodeFloats(world.heightMap),
    homeField: encodeFloats(world.homeField.current),
    foodField: encodeFloats(world.foodField.current),
    fireHomeField: encodeFloats(world.fireHomeField.current),
    fireFoodField: encodeFloats(world.fireFoodField.current),
    ants,
    lizards,
  };
}

/**
 * Overwrite `engine` with a snapshot. The engine must already have the saved
 * grid size — {@link snapshotFitsEngine} checks that before a load is offered.
 */
export function applySnapshot(engine: SimulationEngine, snap: WorldSnapshot): void {
  const world = engine.world;
  if (!snapshotFitsEngine(engine, snap)) {
    throw new Error(
      `snapshot is ${snap.width}x${snap.height}, world is ${world.width}x${world.height}`,
    );
  }

  const cells = base64ToBytes(snap.cells);
  if (cells.length !== world.cells.length) {
    throw new Error(`cell count ${cells.length} != ${world.cells.length}`);
  }
  world.cells.set(cells);
  decodeFloatsInto(snap.foodAmount, world.foodAmount);

  if (snap.heightMap) decodeFloatsInto(snap.heightMap, world.heightMap);
  else world.heightMap.fill(0);
  // `hasRelief` is a cache over heightMap, so rebuild it rather than trust the file.
  world.hasRelief = false;
  for (let i = 0; i < world.heightMap.length; i++) {
    if (world.heightMap[i] !== 0) {
      world.hasRelief = true;
      break;
    }
  }

  // `blocked` is a pure function of terrain, so derive it instead of trusting the file.
  for (let i = 0; i < world.cells.length; i++) {
    const c = world.cells[i];
    world.blocked[i] = c === Cell.WALL || c === Cell.WATER ? 1 : 0;
  }

  applyField(snap.homeField, world.homeField);
  applyField(snap.foodField, world.foodField);
  applyField(snap.fireHomeField, world.fireHomeField);
  applyField(snap.fireFoodField, world.fireFoodField);

  world.tickCount = snap.tickCount;
  world.rng.setState(snap.rngState);
  world.antSpawnCount = snap.antSpawnCount ?? snap.ants.length;
  world.nestFoodStore = snap.nestFoodStore;
  world.fireNestFoodStore = snap.fireNestFoodStore;
  world.foodDelivered = snap.foodDelivered;
  world.fireFoodDelivered = snap.fireFoodDelivered;
  world.initialFoodMass = snap.initialFoodMass;
  engine.allowSpawn = snap.allowSpawn;
  engine.allowWater = snap.allowWater;

  // The constructor seed only sets the initial heading, which is overwritten below;
  // the ant's real Rng state is restored from the snapshot right after.
  engine.ants = snap.ants.map((a) => {
    const ant = new Ant(a.x, a.y, a.nestX, a.nestY, 1, a.kind ?? AntKind.HARVESTER);
    ant.state = a.state ?? AntState.SEARCHING;
    ant.carrying = a.carrying;
    ant.dir = a.dir;
    ant.energy = a.energy;
    ant.stuckTimer = a.stuckTimer;
    ant.digCooldown = a.digCooldown;
    ant.returnTicks = a.returnTicks;
    ant.prey = a.prey ?? true;
    ant.alive = true;
    if (a.rngState !== undefined) ant.rng.setState(a.rngState);
    ant.cumulativeTurn = a.cumulativeTurn ?? 0;
    return ant;
  });

  engine.lizards = snap.lizards.map((l) => {
    const lizard = new Lizard(l.x, l.y, l.dir);
    lizard.energy = l.energy;
    lizard.eatingTicks = l.eatingTicks;
    lizard.tongueCooldown = l.tongueCooldown;
    lizard.swarmTicks = l.swarmTicks;
    lizard.alive = true;
    return lizard;
  });
}

function applyField(blob: FloatBlob, field: DiffusingField): void {
  decodeFloatsInto(blob, field.current);
}

export function snapshotFitsEngine(engine: SimulationEngine, snap: WorldSnapshot): boolean {
  return snap.width === engine.world.width && snap.height === engine.world.height;
}

/** Shape check for anything parsed off disk — a corrupt save must not throw later. */
export function isWorldSnapshot(value: unknown): value is WorldSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<WorldSnapshot>;
  return (
    s.version === SNAPSHOT_VERSION &&
    typeof s.width === 'number' &&
    typeof s.height === 'number' &&
    typeof s.tickCount === 'number' &&
    typeof s.rngState === 'number' &&
    typeof s.cells === 'string' &&
    !!s.foodAmount &&
    !!s.homeField &&
    !!s.foodField &&
    !!s.fireHomeField &&
    !!s.fireFoodField &&
    Array.isArray(s.ants) &&
    Array.isArray(s.lizards)
  );
}
