/**
 * Tiny seeded PRNG (mulberry32). Simulation code must use this — not Math.random —
 * so eval runs are reproducible. Renderer cosmetic noise may still use Math.random.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return (this.next() * n) | 0;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Current internal state, so a saved world resumes the same sequence. */
  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

/**
 * Deterministically derives a per-entity seed from a world seed and an index,
 * so each entity gets its own independent Rng stream without consuming the
 * world's own sequence (mirrors AntGame's `"${seed}-${index}"` per-ant seeding).
 */
export function deriveSeed(seed: number, index: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ index, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
