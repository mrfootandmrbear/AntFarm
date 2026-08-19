import { Container, Sprite, Texture } from 'pixi.js';
import { DIR_ANGLES } from '../sim/constants';
import type { Ant } from '../sim/Ant';
import { loadFrames } from './textures';

/**
 * A container of reusable sprites, one per visible creature.
 *
 * Creatures come and go every tick; allocating a Sprite for each would churn
 * the GPU. Instead the pool grows to the high-water mark and hides the tail.
 */
export class SpritePool {
  readonly container = new Container();
  private sprites: Sprite[] = [];
  private used = 0;

  /** Take the next sprite, creating it on first use. */
  next(initial: Texture): Sprite {
    let sprite = this.sprites[this.used];
    if (!sprite) {
      sprite = new Sprite(initial);
      sprite.anchor.set(0.5);
      this.container.addChild(sprite);
      this.sprites[this.used] = sprite;
    }
    sprite.visible = true;
    this.used++;
    return sprite;
  }

  begin(): void {
    this.used = 0;
  }

  /** Hide whatever the frame did not claim. */
  end(): void {
    for (let i = this.used; i < this.sprites.length; i++) {
      if (this.sprites[i].visible) this.sprites[i].visible = false;
    }
  }
}

/** What one ant species looks like. The behavior is identical; the art is not. */
export interface AntSpecies {
  /** Asset filename prefixes, most specific first; the first set that exists wins. */
  walkPrefixes: string[];
  carryPrefixes: string[];
  /** Sprite scale is `cellSize * spriteCells / sourcePixels` — art is drawn at
   *  different resolutions, so both numbers are per-species. */
  spriteCells: number;
  sourcePixels: number;
  tint: number;
  /** Tints for the drawn-shape fallback, which has no art to keep. */
  fallbackTint: number;
  fallbackCarryTint: number;
}

/**
 * Draws one species of ant. Species differ only in art, scale and tint, so the
 * walk/carry animation and heading live here once instead of behind a per-species
 * branch in the main renderer.
 */
export abstract class AntSpeciesRenderer {
  protected abstract readonly species: AntSpecies;

  private readonly pool = new SpritePool();
  private walk: Texture[] = [];
  private carry: Texture[] = [];
  private fallback!: Texture;
  private usingFallback = false;

  get container(): Container {
    return this.pool.container;
  }

  async init(fallback: Texture): Promise<void> {
    this.fallback = fallback;
    this.walk = await this.firstAvailable(this.species.walkPrefixes);
    this.carry = await this.firstAvailable(this.species.carryPrefixes);
    if (this.walk.length === 0) this.walk = [fallback];
    if (this.carry.length === 0) this.carry = this.walk;
    this.usingFallback = this.walk[0] === fallback;
  }

  private async firstAvailable(prefixes: string[]): Promise<Texture[]> {
    for (const prefix of prefixes) {
      const frames = await loadFrames(prefix);
      if (frames.length > 0) return frames;
    }
    return [];
  }

  /** Draw every live ant this renderer owns. `ants` may hold other species. */
  update(ants: readonly Ant[], tick: number, cellSize: number): void {
    const half = cellSize / 2;
    const scale = this.usingFallback
      ? 1
      : (cellSize * this.species.spriteCells) / this.species.sourcePixels;
    const walkN = this.walk.length;
    const carryN = this.carry.length;

    this.pool.begin();
    for (const ant of ants) {
      if (!ant.alive || !this.owns(ant)) continue;
      const sprite = this.pool.next(this.walk[0]);
      sprite.x = ant.x * cellSize + half;
      sprite.y = ant.y * cellSize + half;

      if (this.usingFallback) {
        sprite.rotation = DIR_ANGLES[ant.dir];
        sprite.scale.set(1);
        sprite.tint = ant.carrying ? this.species.fallbackCarryTint : this.species.fallbackTint;
        continue;
      }

      // The art faces up; headings are measured from the +x axis.
      sprite.rotation = DIR_ANGLES[ant.dir] + Math.PI / 2;
      sprite.scale.set(scale);
      sprite.tint = this.species.tint;
      // Offset by position so a column of ants does not march in lockstep.
      const frame = (tick + ant.x * 3 + ant.y) % (ant.carrying ? carryN : walkN);
      sprite.texture = ant.carrying ? this.carry[frame] : this.walk[frame];
    }
    this.pool.end();
  }

  /** True when this ant belongs to this species. */
  protected abstract owns(ant: Ant): boolean;
}
