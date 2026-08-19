export interface DiffusingFieldOptions {
  /** Per-step multiplier applied everywhere (0..1). Lower = faster evaporation. */
  evaporation?: number;
  /** Fraction of a cell's value blended toward its neighbor average each step (0..1). */
  diffusion?: number;
  /** Values below this snap to 0, keeping the field sparse. */
  minThreshold?: number;
  /** Clamp ceiling applied on deposit. */
  max?: number;
}

/**
 * A scalar field on a 2D grid that spreads and fades over time — the reusable
 * simulation "Lego" from the AntFarm plan.
 *
 * Agents `deposit()` into it; each `diffuse()` step blends every cell toward the
 * average of its unblocked 8-neighbors and then evaporates. Blocked cells (walls,
 * water, ...) hold no value and are excluded from neighbor averaging.
 *
 * Used for pheromones today; equally suited to smell, moisture, heat, nutrients.
 */
export class DiffusingField {
  readonly width: number;
  readonly height: number;
  /** Live values. Read directly (hot path) via {@link getAt} or this array. */
  current: Float32Array;
  private next: Float32Array;

  readonly evaporation: number;
  readonly diffusion: number;
  readonly minThreshold: number;
  readonly max: number;

  constructor(width: number, height: number, opts: DiffusingFieldOptions = {}) {
    this.width = width;
    this.height = height;
    this.current = new Float32Array(width * height);
    this.next = new Float32Array(width * height);
    this.evaporation = opts.evaporation ?? 0.993;
    this.diffusion = opts.diffusion ?? 0.015;
    this.minThreshold = opts.minThreshold ?? 0.001;
    this.max = opts.max ?? Infinity;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  get(x: number, y: number): number {
    return this.current[y * this.width + x];
  }

  getAt(i: number): number {
    return this.current[i];
  }

  /** Add `amount` at (x, y), clamped to `max`. */
  deposit(x: number, y: number, amount: number): void {
    const i = y * this.width + x;
    const v = this.current[i] + amount;
    this.current[i] = v > this.max ? this.max : v;
  }

  clear(): void {
    this.current.fill(0);
    this.next.fill(0);
  }

  /**
   * Advance one diffusion + evaporation step.
   * @param blocked Mask of length width*height; a non-zero entry marks a cell that
   *   blocks flow and holds no value.
   */
  diffuse(blocked: Uint8Array): void {
    const w = this.width;
    const h = this.height;
    const cur = this.current;
    const next = this.next;
    const diffusion = this.diffusion;
    const evaporation = this.evaporation;
    const minThreshold = this.minThreshold;

    next.fill(0);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (blocked[i]) continue; // stays 0

        let sum = 0;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const ni = ny * w + nx;
            if (blocked[ni]) continue;
            sum += cur[ni];
            neighbors++;
          }
        }

        let value: number;
        if (neighbors > 0) {
          const avg = sum / neighbors;
          value = (cur[i] * (1 - diffusion) + avg * diffusion) * evaporation;
        } else {
          value = cur[i] * evaporation;
        }
        next[i] = value < minThreshold ? 0 : value;
      }
    }

    this.current = next;
    this.next = cur;
  }
}
