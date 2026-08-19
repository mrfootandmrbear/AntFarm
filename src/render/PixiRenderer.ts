import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
} from 'pixi.js';
import { Cell, DIR_ANGLES } from '../sim/constants';
import type { SimulationEngine } from '../sim/SimulationEngine';
import type { World } from '../sim/World';

export type PheromoneType = 'food' | 'home';

const ANT_COLOR = 0x1e140f;
const ANT_CARRYING_COLOR = 0xdca028;

/**
 * Draws the simulation with PixiJS. The world grid becomes a GPU texture fed
 * directly from a typed-array pixel buffer (nearest-neighbor scaled up to cell
 * size); ants are pooled sprites. The renderer only reads simulation state.
 */
export class PixiRenderer {
  app!: Application;
  private world!: World;
  cellSize = 4;

  // View options driven by the UI.
  showPheromones = false;
  pheromoneType: PheromoneType = 'food';

  private terrainBuf!: Uint8Array;
  private terrainSource!: BufferImageSource;
  private terrainSprite!: Sprite;

  private antContainer!: Container;
  private antTexture!: Texture;
  private antPool: Sprite[] = [];

  private cellNoise!: Int8Array;

  async init(parent: HTMLElement, world: World, cellSize = 4): Promise<void> {
    this.world = world;
    this.cellSize = cellSize;
    const w = world.width;
    const h = world.height;

    this.app = new Application();
    await this.app.init({
      width: w * cellSize,
      height: h * cellSize,
      background: 0x1a1a2e,
      antialias: false,
      autoDensity: false,
    });
    this.app.ticker.maxFPS = 60;
    parent.appendChild(this.app.canvas);

    // Terrain: one RGBA pixel per cell, scaled up on the GPU.
    this.terrainBuf = new Uint8Array(w * h * 4);
    this.terrainSource = new BufferImageSource({
      resource: this.terrainBuf,
      width: w,
      height: h,
      format: 'rgba8unorm',
    });
    this.terrainSource.scaleMode = 'nearest';
    this.terrainSprite = new Sprite(new Texture({ source: this.terrainSource }));
    this.terrainSprite.scale.set(cellSize);
    this.app.stage.addChild(this.terrainSprite);

    // Ants.
    this.antTexture = this.makeAntTexture();
    this.antContainer = new Container();
    this.app.stage.addChild(this.antContainer);

    // Static per-cell brightness jitter for a bit of texture.
    this.cellNoise = new Int8Array(w * h);
    for (let i = 0; i < this.cellNoise.length; i++) {
      this.cellNoise[i] = ((Math.random() * 10) | 0) - 5;
    }
  }

  private makeAntTexture(): Texture {
    const rx = Math.max(1.5, this.cellSize * 0.7);
    const ry = Math.max(1, this.cellSize * 0.45);
    const g = new Graphics();
    // Body points along +x so rotation by the heading angle looks right.
    g.ellipse(0, 0, rx, ry).fill(0xffffff);
    g.circle(rx * 0.6, 0, ry * 0.7).fill(0xffffff); // slight head bump
    const tex = this.app.renderer.generateTexture(g);
    g.destroy();
    return tex;
  }

  render(engine: SimulationEngine): void {
    this.updateTerrain();
    this.updateAnts(engine);
  }

  private updateTerrain(): void {
    const world = this.world;
    const w = world.width;
    const h = world.height;
    const cells = world.cells;
    const buf = this.terrainBuf;
    const noiseArr = this.cellNoise;
    const tick = world.tickCount;
    const showPhero = this.showPheromones;
    const pheroField = this.pheromoneType === 'food' ? world.foodField : world.homeField;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const cell = cells[i];
        const noise = noiseArr[i];
        let r: number;
        let g: number;
        let b: number;

        switch (cell) {
          case Cell.EMPTY:
          case Cell.DIRT:
            r = 139 + noise;
            g = 115 + noise;
            b = 72 + (noise >> 1);
            break;
          case Cell.WALL:
            r = 90 + noise;
            g = 85 + noise;
            b = 80 + noise;
            break;
          case Cell.WATER: {
            const shimmer = Math.sin(x * 0.3 + y * 0.2 + tick * 0.04) * 8;
            r = 40 + shimmer;
            g = 100 + shimmer;
            b = 170 + shimmer * 0.5;
            break;
          }
          case Cell.FOOD: {
            const brightness = 0.5 + world.foodAmount[i] * 0.5;
            r = 80 * brightness + noise;
            g = 180 * brightness + noise;
            b = 50 * brightness + noise * 0.3;
            break;
          }
          case Cell.NEST: {
            const pulse = Math.sin(tick * 0.03) * 8;
            r = 140 + pulse + noise;
            g = 70 + pulse * 0.3;
            b = 45 + pulse * 0.3;
            break;
          }
          default:
            r = 0;
            g = 0;
            b = 0;
        }

        if (showPhero && cell !== Cell.WALL && cell !== Cell.WATER) {
          const phero = pheroField.getAt(i);
          if (phero > 0.01) {
            const intensity = Math.min(phero / 4, 1) * 0.8;
            const inv = 1 - intensity;
            if (this.pheromoneType === 'food') {
              r = r * inv + 100 * intensity;
              g = g * inv + 255 * intensity;
              b = b * inv + 100 * intensity;
            } else {
              r = r * inv + 100 * intensity;
              g = g * inv + 150 * intensity;
              b = b * inv + 255 * intensity;
            }
          }
        }

        const p = i << 2;
        buf[p] = r < 0 ? 0 : r > 255 ? 255 : r;
        buf[p + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        buf[p + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        buf[p + 3] = 255;
      }
    }

    this.terrainSource.update();
  }

  private updateAnts(engine: SimulationEngine): void {
    const cs = this.cellSize;
    const half = cs / 2;
    let s = 0;

    for (const ant of engine.ants) {
      if (!ant.alive) continue;
      let sprite = this.antPool[s];
      if (!sprite) {
        sprite = new Sprite(this.antTexture);
        sprite.anchor.set(0.5);
        this.antContainer.addChild(sprite);
        this.antPool[s] = sprite;
      }
      sprite.visible = true;
      sprite.x = ant.x * cs + half;
      sprite.y = ant.y * cs + half;
      sprite.rotation = DIR_ANGLES[ant.dir];
      sprite.tint = ant.carrying ? ANT_CARRYING_COLOR : ANT_COLOR;
      s++;
    }

    for (let i = s; i < this.antPool.length; i++) {
      if (this.antPool[i].visible) this.antPool[i].visible = false;
    }
  }
}
