import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
} from 'pixi.js';
import { Cell } from '../sim/constants';
import type { SimulationEngine } from '../sim/SimulationEngine';
import type { World } from '../sim/World';
import { FireAntRenderer } from './FireAntRenderer';
import { HarvesterRenderer } from './HarvesterRenderer';
import { LizardRenderer } from './LizardRenderer';
import { assetUrl, loadTexture } from './textures';

/**
 * Draws the simulation with PixiJS. The world grid becomes a GPU texture fed
 * directly from a typed-array pixel buffer; the creatures are delegated to one
 * renderer per species. The renderer only reads simulation state.
 */
export class PixiRenderer {
  app!: Application;
  private world!: World;
  cellSize = 4;

  /** Soft vapor overlay. Player-facing name is "Scent". */
  showPheromones = true;

  private terrainBuf!: Uint8Array;
  private terrainSource!: BufferImageSource;
  private terrainSprite!: Sprite;

  private vaporBuf!: Uint8Array;
  private vaporSource!: BufferImageSource;
  private vaporSprite!: Sprite;

  private sceneryContainer!: Container;
  private creatureLayer!: Container;
  private readonly harvesters = new HarvesterRenderer();
  private readonly fireAnts = new FireAntRenderer();
  private readonly lizards = new LizardRenderer();
  private fallbackCreature!: Texture;

  /** Live food-pile sprites — scale/alpha refresh every frame as ants eat. */
  private foodPatches: { sprite: Sprite; cells: number[]; baseScale: number }[] = [];

  private cellNoise!: Int8Array;
  private foodSpriteTex: Texture | null = null;
  private nestSpriteTex: Texture | null = null;
  private fireNestSpriteTex: Texture | null = null;
  private rockSpriteTex: Texture | null = null;
  private sceneryDirty = true;
  private sceneryTick = -1;

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

    this.vaporBuf = new Uint8Array(w * h * 4);
    this.vaporSource = new BufferImageSource({
      resource: this.vaporBuf,
      width: w,
      height: h,
      format: 'rgba8unorm',
    });
    this.vaporSource.scaleMode = 'linear';
    this.vaporSprite = new Sprite(new Texture({ source: this.vaporSource }));
    this.vaporSprite.scale.set(cellSize);
    this.vaporSprite.alpha = 0.85;
    this.vaporSprite.blendMode = 'normal';
    this.app.stage.addChild(this.vaporSprite);

    this.sceneryContainer = new Container();
    this.app.stage.addChild(this.sceneryContainer);

    this.sceneryContainer = new Container();
    this.app.stage.addChild(this.sceneryContainer);

    this.creatureLayer = new Container();
    this.creatureLayer.sortableChildren = true;
    this.app.stage.addChild(this.creatureLayer);

    // Every creature renderer shares one drawn shape for when its art is missing.
    this.fallbackCreature = this.makeCreatureTexture();
    this.harvesters.initLayer(this.creatureLayer);
    this.fireAnts.initLayer(this.creatureLayer);
    this.lizards.initLayer(this.creatureLayer);
    await this.harvesters.init(this.fallbackCreature);
    await this.fireAnts.init(this.fallbackCreature);
    await this.lizards.init(this.fallbackCreature);

    this.foodSpriteTex = await loadTexture(assetUrl('food.png'));
    this.nestSpriteTex = await loadTexture(assetUrl('nest.png'));
    this.fireNestSpriteTex = await loadTexture(assetUrl('fire-nest.png'));
    this.rockSpriteTex = await loadTexture(assetUrl('rock.png'));

    this.cellNoise = new Int8Array(w * h);
    for (let i = 0; i < this.cellNoise.length; i++) {
      this.cellNoise[i] = ((Math.random() * 10) | 0) - 5;
    }
  }

  private makeCreatureTexture(): Texture {
    const rx = Math.max(1.5, this.cellSize * 0.7);
    const ry = Math.max(1, this.cellSize * 0.45);
    const g = new Graphics();
    g.ellipse(0, 0, rx, ry).fill(0xffffff);
    g.circle(rx * 0.6, 0, ry * 0.7).fill(0xffffff);
    const tex = this.app.renderer.generateTexture(g);
    g.destroy();
    return tex;
  }

  render(engine: SimulationEngine): void {
    const tick = engine.world.tickCount;
    this.updateTerrain();
    this.updateVapor(tick);
    this.updateScenery();
    this.updateFoodDepletion();
    this.harvesters.update(engine.ants, tick, this.cellSize);
    this.fireAnts.update(engine.ants, tick, this.cellSize);
    this.lizards.update(engine.lizards, tick, this.cellSize);
  }

  invalidateScenery(): void {
    this.sceneryDirty = true;
  }

  private updateTerrain(): void {
    const world = this.world;
    const w = world.width;
    const h = world.height;
    const cells = world.cells;
    const buf = this.terrainBuf;
    const noiseArr = this.cellNoise;
    const tick = world.tickCount;
    const height = world.heightMap;
    const relief = world.hasRelief;

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
            {
              const broad = Math.sin(x * 0.055) * 5 + Math.cos(y * 0.047) * 4 + Math.sin((x + y) * 0.021) * 3;
              r = 145 + broad + noise * 0.45;
              g = 119 + broad * 0.72 + noise * 0.35;
              b = 75 + broad * 0.35 + (noise >> 2);
            }
            break;
          case Cell.WALL: {
            r = 91 + noise * 0.4;
            g = 82 + noise * 0.35;
            b = 68 + noise * 0.25;
            break;
          }
          case Cell.WATER: {
            const shimmer = Math.sin(x * 0.3 + y * 0.2 + tick * 0.04) * 8;
            r = 40 + shimmer;
            g = 100 + shimmer;
            b = 170 + shimmer * 0.5;
            // Shore foam: lighten cells bordering dry ground.
            if (
              (x > 0 && cells[i - 1] !== Cell.WATER) ||
              (x + 1 < w && cells[i + 1] !== Cell.WATER) ||
              (y > 0 && cells[i - w] !== Cell.WATER) ||
              (y + 1 < h && cells[i + w] !== Cell.WATER)
            ) {
              r += 28;
              g += 32;
              b += 18;
            }
            break;
          }
          case Cell.FOOD: {
            const brightness = 0.5 + world.foodAmount[i] * 0.5;
            r = 92 * brightness + noise;
            g = 146 * brightness + noise;
            b = 53 * brightness + noise * 0.3;
            break;
          }
          case Cell.NEST: {
            const pulse = Math.sin(tick * 0.03) * 8;
            r = 142 + pulse + noise;
            g = 79 + pulse * 0.3;
            b = 49 + pulse * 0.3;
            break;
          }
          case Cell.FIRE_NEST: {
            const pulse = Math.sin(tick * 0.03) * 8;
            r = 96 + pulse + noise;
            g = 43 + pulse * 0.2;
            b = 29;
            break;
          }
          default:
            r = 0;
            g = 0;
            b = 0;
        }

        // Relief: raised ground catches the light, hollows sit in shadow, and a
        // slope facing the (fixed, upper-left) sun gets a rim of highlight so a
        // dome reads as a dome rather than a bright disc.
        if (relief) {
          const hHere = height[i];
          const dhx = (x + 1 < w ? height[i + 1] : hHere) - hHere;
          const dhy = (y + 1 < h ? height[i + w] : hHere) - hHere;
          let slope = (dhx + dhy) * 3.4;
          if (slope > 0.34) slope = 0.34;
          else if (slope < -0.34) slope = -0.34;
          const lit = 1 + hHere * 0.32 + slope;
          r *= lit;
          g *= lit;
          b *= lit;
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

  private updateVapor(tick: number): void {
    const world = this.world;
    const w = world.width;
    const h = world.height;
    const buf = this.vaporBuf;
    const show = this.showPheromones;
    this.vaporSprite.visible = show;
    if (!show) {
      buf.fill(0);
      this.vaporSource.update();
      return;
    }

    const food = world.foodField.current;
    const home = world.homeField.current;
    const fireFood = world.fireFoodField.current;
    const fireHome = world.fireHomeField.current;
    const blocked = world.blocked;

    for (let i = 0; i < w * h; i++) {
      const p = i << 2;
      if (blocked[i]) {
        buf[p] = 0;
        buf[p + 1] = 0;
        buf[p + 2] = 0;
        buf[p + 3] = 0;
        continue;
      }
      // Combined scent: harvester trails are warm/cool mist; fire-ant trails are redder haze.
      const fv = food[i];
      const hv = home[i];
      const ff = fireFood[i];
      const fh = fireHome[i];
      const rawDens = Math.min(fv / 5 + hv / 8 + ff / 5 + fh / 8, 1);
      const dens = Math.pow(rawDens, 0.72);
      if (dens < 0.02) {
        buf[p] = 0;
        buf[p + 1] = 0;
        buf[p + 2] = 0;
        buf[p + 3] = 0;
        continue;
      }
      const ix = i % w;
      const iy = (i / w) | 0;
      const drift = 0.88 + Math.sin(tick * 0.018 + ix * 0.11 + iy * 0.09) * 0.12;
      const harvest = fv + hv;
      const fire = ff + fh;
      const t = fv / (harvest + 0.0001);
      let r = 210 - t * 40;
      let g = 170 + t * 50;
      let b = 110 + (1 - t) * 80;
      if (fire > harvest * 0.35) {
        r = 210 + Math.min(fire * 8, 40);
        g = 90 + t * 30;
        b = 50;
      }
      buf[p] = r;
      buf[p + 1] = g;
      buf[p + 2] = b;
      buf[p + 3] = Math.min(dens * 118 * drift, 112);
    }

    this.vaporSource.update();
  }

  /** Shrink and fade food sprites as the pile is eaten — reads depletion at a glance. */
  private updateFoodDepletion(): void {
    const world = this.world;
    const amounts = world.foodAmount;
    for (const patch of this.foodPatches) {
      let total = 0;
      for (const c of patch.cells) total += amounts[c];
      const avg = total / patch.cells.length;
      const fullness = 0.35 + avg * 0.65;
      patch.sprite.alpha = 0.45 + avg * 0.55;
      patch.sprite.scale.set(patch.baseScale * fullness);
    }
  }

  /** Draw one coherent illustration per patch instead of stamping every grid cell. */
  private updateScenery(): void {
    const tick = this.world.tickCount;
    if (!this.sceneryDirty && (tick === this.sceneryTick || tick % 20 !== 0)) return;
    this.sceneryDirty = false;
    this.sceneryTick = tick;
    this.sceneryContainer.removeChildren().forEach((child) => child.destroy());
    this.foodPatches = [];

    const { width: w, height: h, cells } = this.world;
    const seen = new Uint8Array(w * h);
    const types = [Cell.FOOD, Cell.NEST, Cell.FIRE_NEST, Cell.WALL];
    for (const type of types) {
      const texture = type === Cell.FOOD ? this.foodSpriteTex : type === Cell.NEST ? this.nestSpriteTex : type === Cell.FIRE_NEST ? this.fireNestSpriteTex : this.rockSpriteTex;
      if (!texture) continue;
      for (let start = 0; start < cells.length; start++) {
        if (seen[start] || cells[start] !== type) continue;
        const queue = [start];
        seen[start] = 1;
        const members: number[] = [];
        let sx = 0;
        let sy = 0;
        for (let q = 0; q < queue.length; q++) {
          const at = queue[q];
          members.push(at);
          const x = at % w;
          const y = (at / w) | 0;
          sx += x;
          sy += y;
          const near = [at - 1, at + 1, at - w, at + w];
          for (const next of near) {
            if (next < 0 || next >= cells.length || seen[next] || cells[next] !== type) continue;
            const nx = next % w;
            if (Math.abs(nx - x) > 1) continue;
            seen[next] = 1;
            queue.push(next);
          }
        }

        const cx = sx / members.length;
        const cy = sy / members.length;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.x = (cx + 0.5) * this.cellSize;
        sprite.y = (cy + 0.5) * this.cellSize;
        const diameter = Math.max(5, Math.min(14, Math.sqrt(members.length) * 2.3));
        const target = diameter * this.cellSize;
        const baseScale = target / Math.max(texture.width, texture.height);
        sprite.scale.set(baseScale);
        if (type === Cell.FOOD) {
          this.foodPatches.push({ sprite, cells: members, baseScale });
          sprite.alpha = 0.95;
        } else if (type === Cell.WALL) {
          sprite.alpha = 0.92;
          sprite.rotation = ((members[0] * 17) % 7 - 3) * 0.06;
        } else {
          sprite.alpha = 1;
        }
        this.sceneryContainer.addChild(sprite);
      }
    }
  }
}
