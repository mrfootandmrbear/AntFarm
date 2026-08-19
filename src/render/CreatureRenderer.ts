import { Container, Sprite, Texture } from 'pixi.js';
import { DIR_ANGLES, Layer, type LayerType } from '../sim/constants';
import type { Ant } from '../sim/Ant';
import { loadFrames } from './textures';

/**
 * A container of reusable sprites, one per visible creature.
 *
 * Creatures come and go every tick; allocating a Sprite for each would churn
 * the GPU. Instead the pool grows to the high-water mark and hides the tail.
 */
export class SpritePool {
  private sprites: Sprite[] = [];
  private used = 0;

  constructor(readonly container: Container) {}

  /** Take the next sprite, creating it on first use. */
  next(initial: Texture, depth = 0): Sprite {
    let sprite = this.sprites[this.used];
    if (!sprite) {
      sprite = new Sprite(initial);
      sprite.anchor.set(0.5);
      this.container.addChild(sprite);
      this.sprites[this.used] = sprite;
    }
    sprite.visible = true;
    sprite.zIndex = depth;
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
  /** Brown tint when hauling an excavated soil pellet. */
  fallbackSoilTint: number;
  /** Multiply walk/carry art by this when hauling spoil. */
  soilTint: number;
}

/**
 * Draws one species of ant. Species differ only in art, scale and tint, so the
 * walk/carry animation and heading live here once instead of behind a per-species
 * branch in the main renderer.
 */
export abstract class AntSpeciesRenderer {
  protected abstract readonly species: AntSpecies;

  private pool!: SpritePool;
  private walk: Texture[] = [];
  private carry: Texture[] = [];
  private fallback!: Texture;
  private usingFallback = false;

  initLayer(layer: Container): void {
    this.pool = new SpritePool(layer);
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

  /**
   * Draw every live ant this renderer owns on the given layer. `ants` may hold
   * other species and the other layer — surface and underground ants never
   * share a frame, per {@link Layer}.
   */
  update(ants: readonly Ant[], tick: number, cellSize: number, layer: LayerType = Layer.SURFACE): void {
    const half = cellSize / 2;
    const scale = this.usingFallback
      ? 1
      : (cellSize * this.species.spriteCells) / this.species.sourcePixels;
    const walkN = this.walk.length;
    const carryN = this.carry.length;

    this.pool.begin();
    for (const ant of ants) {
      if (!ant.alive || ant.layer !== layer || !this.owns(ant)) continue;
      const sprite = this.pool.next(this.walk[0], ant.y);
      sprite.x = ant.x * cellSize + half;
      sprite.y = ant.y * cellSize + half;

      if (this.usingFallback) {
        sprite.rotation = DIR_ANGLES[ant.dir];
        sprite.scale.set(1);
        sprite.tint = ant.carrying
          ? this.species.fallbackCarryTint
          : ant.soilLoad > 0
            ? this.species.fallbackSoilTint
            : this.species.fallbackTint;
        continue;
      }

      // The art faces up; headings are measured from the +x axis.
      sprite.rotation = DIR_ANGLES[ant.dir] + Math.PI / 2;
      sprite.scale.set(scale);
      const haulingSoil = ant.soilLoad > 0 && !ant.carrying;
      sprite.tint = haulingSoil ? this.species.soilTint : this.species.tint;
      // Offset by position so a column of ants does not march in lockstep.
      const frame =
        (tick + ant.x * 3 + ant.y) %
        (ant.carrying || haulingSoil ? carryN : walkN);
      sprite.texture = ant.carrying || haulingSoil ? this.carry[frame] : this.walk[frame];
    }
    this.pool.end();
  }

  /** True when this ant belongs to this species. */
  protected abstract owns(ant: Ant): boolean;
}
