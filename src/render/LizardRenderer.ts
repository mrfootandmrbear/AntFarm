import { Container, Texture } from 'pixi.js';
import { DIR_ANGLES } from '../sim/constants';
import type { Lizard } from '../sim/Lizard';
import { SpritePool } from './CreatureRenderer';
import { assetUrl, loadFrames, loadTexture } from './textures';

const SPRITE_CELLS = 6.2;
const SOURCE_PIXELS = 130;
const FALLBACK_SCALE = 2.4;
/** Warm flush while ants are swarming it. */
const HARASSED_TINT = 0xffc8b0;
const NORMAL_TINT = 0xffffff;

/**
 * Horned lizards: big, slow, and mostly still. The one thing worth seeing is
 * the tongue — a separate pose held for the length of a feed, not an animation.
 */
export class LizardRenderer {
  private pool!: SpritePool;
  private walk: Texture[] = [];
  private tongue: Texture | null = null;
  private usingFallback = false;

  initLayer(layer: Container): void {
    this.pool = new SpritePool(layer);
  }

  async init(fallback: Texture): Promise<void> {
    this.walk = await loadFrames('lizard-walk-');
    this.tongue = await loadTexture(assetUrl('lizard-tongue.png'));
    if (this.walk.length === 0) this.walk = [fallback];
    this.usingFallback = this.walk[0] === fallback;
  }

  update(lizards: readonly Lizard[], tick: number, cellSize: number): void {
    const half = cellSize / 2;
    const scale = this.usingFallback
      ? FALLBACK_SCALE
      : (cellSize * SPRITE_CELLS) / SOURCE_PIXELS;
    const walkN = this.walk.length;

    this.pool.begin();
    for (const lizard of lizards) {
      if (!lizard.alive) continue;
      const sprite = this.pool.next(this.walk[0], lizard.y);
      sprite.x = lizard.x * cellSize + half;
      sprite.tint = lizard.swarmTicks > 0 ? HARASSED_TINT : NORMAL_TINT;
      const baseRot = DIR_ANGLES[lizard.dir] + Math.PI / 2;
      if (lizard.eatingTicks > 0 && this.tongue) {
        sprite.texture = this.tongue;
        // Flick out on even phases, retract on odd — reads as a tongue strike.
        const phase = lizard.eatingTicks % 6;
        const extend = phase >= 3 ? (phase - 2) / 3 : phase / 3;
        const flick = 0.85 + extend * 0.35;
        sprite.scale.set(scale * flick);
        sprite.rotation = baseRot + (extend - 0.5) * 0.18;
      } else {
        sprite.texture = this.walk[(tick + lizard.x * 2 + lizard.y) % walkN];
        sprite.scale.set(scale);
        sprite.rotation = baseRot;
      }
      sprite.y = lizard.y * cellSize + half;
    }
    this.pool.end();
  }
}
