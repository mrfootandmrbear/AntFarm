import { Cell, CellType, SimConfig, Under, UnderType } from './constants';
import { DiffusingField } from './DiffusingField';
import { deriveSeed, Rng } from './Rng';

/**
 * The spatial state of the simulation: terrain grid, per-cell food amount, and
 * the pheromone fields. Holds no agents and does no orchestration — the
 * {@link SimulationEngine} drives ticks and owns the ants.
 */
export class World {
  readonly width: number;
  readonly height: number;

  /** Terrain type per cell ({@link Cell}). */
  cells: Uint8Array;
  /** Remaining food fraction (0..1) for FOOD cells. */
  foodAmount: Float32Array;
  /**
   * Surface relief per cell, 0.0 = the original flat ground. Positive is raised
   * (a mound), negative is a hollow. Ants pay to climb it and the renderer shades
   * it; nothing about passability depends on it.
   */
  heightMap: Float32Array;
  /** True once any cell has been raised or lowered — lets flat worlds skip work. */
  hasRelief = false;

  /**
   * What lies beneath each surface cell ({@link Under}). Same dimensions as the
   * terrain grid — the underground is a plan view of the nest, sharing x and y
   * with the ground above it and carrying its own depth per cell.
   */
  underground: Uint8Array;
  /** How far below the surface each passage cell sits. Meaningless where SOLID. */
  tunnelDepth: Float32Array;
  /** Which colony cut each passage cell: 0 nobody, 1 harvester, 2 fire. */
  tunnelOwner: Uint8Array;
  /** Count of passage cells, so an untouched world can skip the whole layer. */
  tunnelCount = 0;
  /** Scratch buffer for {@link settleHeight}, allocated on first use. */
  private heightDelta: Float32Array | null = null;

  /** Trail back toward the nest (laid by searching ants). */
  readonly homeField: DiffusingField;
  /** Trail back toward food (laid by returning ants). */
  readonly foodField: DiffusingField;
  /** Fire-ant home trail (searching fire ants). */
  readonly fireHomeField: DiffusingField;
  /** Fire-ant food trail (returning fire ants). */
  readonly fireFoodField: DiffusingField;

  /** Diffusion mask: 1 where a cell blocks pheromone flow (walls, water). */
  readonly blocked: Uint8Array;

  nestFoodStore = 0;
  fireNestFoodStore = 0;
  /** Cumulative harvester deliveries; never spent. Eval uses this, not the granary. */
  foodDelivered = 0;
  fireFoodDelivered = 0;
  tickCount = 0;
  readonly rng: Rng;
  /** Original world seed; combined with a spawn index to seed each ant's own Rng. */
  readonly seed: number;
  /** Monotonic count of ants ever spawned, used to derive unique per-ant seeds. */
  antSpawnCount = 0;
  /** Starting food mass, set by eval/scenes so delivery % is meaningful. */
  initialFoodMass = 0;

  constructor(width: number, height: number, seed = 1) {
    this.width = width;
    this.height = height;
    const size = width * height;

    this.cells = new Uint8Array(size);
    this.cells.fill(Cell.DIRT);
    this.foodAmount = new Float32Array(size);
    this.heightMap = new Float32Array(size);
    this.underground = new Uint8Array(size);
    this.tunnelDepth = new Float32Array(size);
    this.tunnelOwner = new Uint8Array(size);
    this.blocked = new Uint8Array(size);
    this.seed = seed;
    this.rng = new Rng(seed);

    const p = SimConfig.pheromone;
    const opts = {
      evaporation: p.evaporation,
      diffusion: p.diffusion,
      minThreshold: p.minThreshold,
      max: p.max,
    };
    this.homeField = new DiffusingField(width, height, opts);
    this.foodField = new DiffusingField(width, height, opts);
    this.fireHomeField = new DiffusingField(width, height, opts);
    this.fireFoodField = new DiffusingField(width, height, opts);
  }

  clear(): void {
    this.cells.fill(Cell.DIRT);
    this.foodAmount.fill(0);
    this.heightMap.fill(0);
    this.hasRelief = false;
    this.underground.fill(Under.SOLID);
    this.tunnelDepth.fill(0);
    this.tunnelOwner.fill(0);
    this.tunnelCount = 0;
    this.blocked.fill(0);
    this.homeField.clear();
    this.foodField.clear();
    this.fireHomeField.clear();
    this.fireFoodField.clear();
    this.nestFoodStore = 0;
    this.fireNestFoodStore = 0;
    this.foodDelivered = 0;
    this.fireFoodDelivered = 0;
    this.tickCount = 0;
    this.antSpawnCount = 0;
    this.initialFoodMass = 0;
  }

  /** Next deterministic per-ant seed, independent of the world's own Rng stream. */
  nextAntSeed(): number {
    return deriveSeed(this.seed, this.antSpawnCount++);
  }

  totalFoodMass(): number {
    let s = 0;
    for (let i = 0; i < this.foodAmount.length; i++) s += this.foodAmount[i];
    return s;
  }

  fieldMass(field: DiffusingField): number {
    let s = 0;
    const a = field.current;
    for (let i = 0; i < a.length; i++) s += a[i];
    return s;
  }

  /** Sum of a field inside [x0,x1] x [y0,y1] (inclusive, clamped). */
  fieldMassRect(field: DiffusingField, x0: number, y0: number, x1: number, y1: number): number {
    const w = this.width;
    const a = field.current;
    const xa = Math.max(0, Math.min(x0, x1));
    const xb = Math.min(w - 1, Math.max(x0, x1));
    const ya = Math.max(0, Math.min(y0, y1));
    const yb = Math.min(this.height - 1, Math.max(y0, y1));
    let s = 0;
    for (let y = ya; y <= yb; y++) {
      const row = y * w;
      for (let x = xa; x <= xb; x++) s += a[row + x];
    }
    return s;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): number {
    return this.cells[this.idx(x, y)];
  }

  set(x: number, y: number, type: CellType): void {
    const i = this.idx(x, y);
    const was = this.cells[i];
    this.cells[i] = type;
    this.foodAmount[i] = type === Cell.FOOD ? 1.0 : 0;
    this.blocked[i] = type === Cell.WALL || type === Cell.WATER ? 1 : 0;

    // A mound is a doorway: painting one opens the way below it, and painting
    // it away seals that doorway again unless ants have already cut past it.
    const isNest = type === Cell.NEST || type === Cell.FIRE_NEST;
    const wasNest = was === Cell.NEST || was === Cell.FIRE_NEST;
    if (isNest) {
      this.carve(i, Under.ENTRANCE, 0, type === Cell.FIRE_NEST ? 2 : 1);
    } else if (wasNest && this.underground[i] === Under.ENTRANCE) {
      this.underground[i] = Under.SOLID;
      this.tunnelOwner[i] = 0;
      this.tunnelCount--;
    }
  }

  /** Underground cell type at (x, y). Out of bounds reads as solid earth. */
  under(x: number, y: number): number {
    if (!this.inBounds(x, y)) return Under.SOLID;
    return this.underground[this.idx(x, y)];
  }

  /** True where an ant below ground can stand: tunnel, chamber or entrance. */
  isPassage(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.underground[this.idx(x, y)] !== Under.SOLID;
  }

  /**
   * Turn one cell of solid earth into passage. Idempotent on the cell count, so
   * promoting a tunnel to a chamber does not double-count it.
   */
  carve(i: number, type: UnderType, depth: number, owner: number): void {
    if (this.underground[i] === Under.SOLID) this.tunnelCount++;
    this.underground[i] = type;
    this.tunnelDepth[i] = depth;
    this.tunnelOwner[i] = owner;
  }

  /** Surface height at (x, y). Out of bounds reads as flat ground. */
  heightAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.heightMap[this.idx(x, y)];
  }

  /**
   * Raise (or lower, with a negative delta) the ground at one cell.
   * Returns the height actually applied, which is less than `delta` once the
   * cell has hit the ceiling — callers that move soil use that to know whether
   * the pellet went anywhere.
   */
  raiseHeight(x: number, y: number, delta: number): number {
    if (!this.inBounds(x, y) || delta === 0) return 0;
    const cfg = SimConfig.terrain;
    const i = this.idx(x, y);
    const before = this.heightMap[i];
    let after = before + delta;
    if (after > cfg.maxHeight) after = cfg.maxHeight;
    else if (after < cfg.minHeight) after = cfg.minHeight;
    if (after === before) return 0;
    this.heightMap[i] = after;
    this.hasRelief = true;
    return after - before;
  }

  /**
   * One settling step for loose soil: any cell standing more than the angle of
   * repose above its lowest neighbour sheds part of the excess into it.
   *
   * This is what turns a stream of pellets dropped near a nest entrance into a
   * dome. Deltas are accumulated first and applied after, so the result does not
   * depend on which corner of the grid the scan started from.
   */
  settleHeight(): void {
    if (!this.hasRelief) return;
    const cfg = SimConfig.terrain;
    const w = this.width;
    const h = this.height;
    const height = this.heightMap;
    if (!this.heightDelta) this.heightDelta = new Float32Array(height.length);
    const delta = this.heightDelta;
    delta.fill(0);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const here = height[i];
        let lowest = here;
        let lowestIdx = -1;
        for (let d = 0; d < 4; d++) {
          const nx = x + DIR4[d].dx;
          const ny = y + DIR4[d].dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (height[ni] < lowest) {
            lowest = height[ni];
            lowestIdx = ni;
          }
        }
        if (lowestIdx < 0) continue;
        const excess = here - lowest - cfg.angleOfRepose;
        if (excess <= 0) continue;
        const moved = excess * cfg.slumpRate * 0.5;
        delta[i] -= moved;
        delta[lowestIdx] += moved;
      }
    }

    const max = cfg.maxHeight;
    const min = cfg.minHeight;
    for (let i = 0; i < height.length; i++) {
      if (delta[i] === 0) continue;
      const v = height[i] + delta[i];
      height[i] = v > max ? max : v < min ? min : v;
    }
  }

  /**
   * Drop a pellet of soil. A pellet is loose, not a brick: most of it lands on
   * the target cell and the rest spills into the four neighbours, so a stream of
   * deposits builds a slope rather than a tower of one-cell spikes that ants
   * then have to climb between slump steps.
   */
  dropSoil(x: number, y: number, amount: number): void {
    if (amount === 0) return;
    this.raiseHeight(x, y, amount * 0.6);
    for (let d = 0; d < 4; d++) {
      this.raiseHeight(x + DIR4[d].dx, y + DIR4[d].dy, amount * 0.1);
    }
  }

  isPassable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const c = this.cells[this.idx(x, y)];
    return (
      c === Cell.DIRT ||
      c === Cell.EMPTY ||
      c === Cell.FOOD ||
      c === Cell.NEST ||
      c === Cell.FIRE_NEST
    );
  }

  isDiggable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.cells[this.idx(x, y)] === Cell.DIRT;
  }

  dig(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    if (this.cells[i] === Cell.DIRT) {
      this.cells[i] = Cell.EMPTY;
      this.blocked[i] = 0;
    }
  }

  /** Trickle water into adjacent empty cells. Gated by the caller's interval. */
  updateWater(): void {
    const dirs = DIR4;
    const cells = this.cells;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (cells[this.idx(x, y)] !== Cell.WATER) continue;
        if (this.rng.next() > 0.15) continue;
        const d = dirs[this.rng.int(4)];
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (cells[ni] === Cell.EMPTY) {
          cells[ni] = Cell.WATER;
          this.blocked[ni] = 1;
        }
      }
    }
  }

  findNestCell(): { x: number; y: number } | null {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.cells[this.idx(x, y)] === Cell.NEST) return { x, y };
      }
    }
    return null;
  }

  /** Nearest NEST cell to (x, y) by Manhattan distance, or null if none exist. */
  findNearestNest(x: number, y: number): { x: number; y: number } | null {
    return this.findNearestCell(x, y, Cell.NEST);
  }

  findFireNestCell(): { x: number; y: number } | null {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.cells[this.idx(x, y)] === Cell.FIRE_NEST) return { x, y };
      }
    }
    return null;
  }

  findNearestCell(x: number, y: number, type: CellType): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let ny = 0; ny < this.height; ny++) {
      for (let nx = 0; nx < this.width; nx++) {
        if (this.cells[this.idx(nx, ny)] === type) {
          const d = Math.abs(nx - x) + Math.abs(ny - y);
          if (d < bestDist) {
            bestDist = d;
            best = { x: nx, y: ny };
          }
        }
      }
    }
    return best;
  }

  /** True if a nest mound of either colony sits in the Chebyshev neighborhood. */
  nestNearby(x: number, y: number, radius = 2): boolean {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const c = this.cells[this.idx(nx, ny)];
        if (c === Cell.NEST || c === Cell.FIRE_NEST) return true;
      }
    }
    return false;
  }
}

const DIR4 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];
