import { Cell, CellType, SimConfig } from './constants';
import { DiffusingField } from './DiffusingField';
import { Rng } from './Rng';

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

  /** Trail back toward the nest (laid by searching ants). */
  readonly homeField: DiffusingField;
  /** Trail back toward food (laid by returning ants). */
  readonly foodField: DiffusingField;

  /** Diffusion mask: 1 where a cell blocks pheromone flow (walls, water). */
  readonly blocked: Uint8Array;

  nestFoodStore = 0;
  tickCount = 0;
  readonly rng: Rng;
  /** Starting food mass, set by eval/scenes so delivery % is meaningful. */
  initialFoodMass = 0;

  constructor(width: number, height: number, seed = 1) {
    this.width = width;
    this.height = height;
    const size = width * height;

    this.cells = new Uint8Array(size);
    this.cells.fill(Cell.DIRT);
    this.foodAmount = new Float32Array(size);
    this.blocked = new Uint8Array(size);
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
  }

  clear(): void {
    this.cells.fill(Cell.DIRT);
    this.foodAmount.fill(0);
    this.blocked.fill(0);
    this.homeField.clear();
    this.foodField.clear();
    this.nestFoodStore = 0;
    this.tickCount = 0;
    this.initialFoodMass = 0;
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
    this.cells[i] = type;
    this.foodAmount[i] = type === Cell.FOOD ? 1.0 : 0;
    this.blocked[i] = type === Cell.WALL || type === Cell.WATER ? 1 : 0;
  }

  isPassable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const c = this.cells[this.idx(x, y)];
    return c === Cell.DIRT || c === Cell.EMPTY || c === Cell.FOOD || c === Cell.NEST;
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
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (let ny = 0; ny < this.height; ny++) {
      for (let nx = 0; nx < this.width; nx++) {
        if (this.cells[this.idx(nx, ny)] === Cell.NEST) {
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
}

const DIR4 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];
