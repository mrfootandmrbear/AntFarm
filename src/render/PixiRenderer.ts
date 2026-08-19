import {
  Application,
  Assets,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
} from 'pixi.js';
import { Cell, DIR_ANGLES } from '../sim/constants';
import type { SimulationEngine } from '../sim/SimulationEngine';
import type { World } from '../sim/World';

const assetUrls = import.meta.glob('../../assets/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

function assetUrl(name: string): string | undefined {
  const hit = Object.entries(assetUrls).find(([k]) => k.endsWith(`/${name}`));
  return hit?.[1];
}

function sortedUrls(prefix: string): string[] {
  return Object.entries(assetUrls)
    .filter(([k]) => k.includes(`/${prefix}`) && k.endsWith('.png'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}

interface TexSamp {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

/**
 * Draws the simulation with PixiJS. The world grid becomes a GPU texture fed
 * directly from a typed-array pixel buffer; ants are pooled sprites from the
 * Deposit sheets. The renderer only reads simulation state.
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

  private antContainer!: Container;
  private fallbackAnt!: Texture;
  private walkTextures: Texture[] = [];
  private carryTextures: Texture[] = [];
  private antPool: Sprite[] = [];

  private cellNoise!: Int8Array;
  private foodTex: TexSamp | null = null;
  private nestTex: TexSamp | null = null;
  private rockTex: TexSamp | null = null;

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

    this.fallbackAnt = this.makeAntTexture();
    this.walkTextures = await this.loadTextures(sortedUrls('ant-walk-'));
    this.carryTextures = await this.loadTextures(sortedUrls('ant-carry-'));
    if (this.walkTextures.length === 0) this.walkTextures = [this.fallbackAnt];
    if (this.carryTextures.length === 0) this.carryTextures = this.walkTextures;

    this.antContainer = new Container();
    this.app.stage.addChild(this.antContainer);

    this.foodTex = await this.loadSamp(assetUrl('food.png'));
    this.nestTex = await this.loadSamp(assetUrl('nest.png'));
    this.rockTex = await this.loadSamp(assetUrl('rock.png'));

    this.cellNoise = new Int8Array(w * h);
    for (let i = 0; i < this.cellNoise.length; i++) {
      this.cellNoise[i] = ((Math.random() * 10) | 0) - 5;
    }
  }

  private async loadTextures(urls: string[]): Promise<Texture[]> {
    const out: Texture[] = [];
    for (const url of urls) {
      try {
        const tex = (await Assets.load(url)) as Texture;
        out.push(tex);
      } catch {
        // leave fallback
      }
    }
    return out;
  }

  private async loadSamp(url: string | undefined): Promise<TexSamp | null> {
    if (!url) return null;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
      bmp.close();
      return { w: img.width, h: img.height, data: img.data };
    } catch {
      return null;
    }
  }

  private makeAntTexture(): Texture {
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
    this.updateTerrain();
    this.updateVapor();
    this.updateAnts(engine);
  }

  private sample(tex: TexSamp, x: number, y: number): [number, number, number, number] {
    const u = ((x * 13 + 7) % tex.w + tex.w) % tex.w;
    const v = ((y * 11 + 3) % tex.h + tex.h) % tex.h;
    const i = (v * tex.w + u) * 4;
    return [tex.data[i], tex.data[i + 1], tex.data[i + 2], tex.data[i + 3]];
  }

  private updateTerrain(): void {
    const world = this.world;
    const w = world.width;
    const h = world.height;
    const cells = world.cells;
    const buf = this.terrainBuf;
    const noiseArr = this.cellNoise;
    const tick = world.tickCount;

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
          case Cell.WALL: {
            const samp = this.rockTex ? this.sample(this.rockTex, x, y) : null;
            if (samp && samp[3] > 40) {
              r = samp[0] * 0.65 + 40;
              g = samp[1] * 0.65 + 35;
              b = samp[2] * 0.65 + 30;
            } else {
              r = 90 + noise;
              g = 85 + noise;
              b = 80 + noise;
            }
            break;
          }
          case Cell.WATER: {
            const shimmer = Math.sin(x * 0.3 + y * 0.2 + tick * 0.04) * 8;
            r = 40 + shimmer;
            g = 100 + shimmer;
            b = 170 + shimmer * 0.5;
            break;
          }
          case Cell.FOOD: {
            const brightness = 0.5 + world.foodAmount[i] * 0.5;
            const samp = this.foodTex ? this.sample(this.foodTex, x, y) : null;
            if (samp && samp[3] > 40) {
              r = samp[0] * brightness;
              g = samp[1] * brightness;
              b = samp[2] * brightness;
            } else {
              r = 80 * brightness + noise;
              g = 180 * brightness + noise;
              b = 50 * brightness + noise * 0.3;
            }
            break;
          }
          case Cell.NEST: {
            const pulse = Math.sin(tick * 0.03) * 8;
            const samp = this.nestTex ? this.sample(this.nestTex, x, y) : null;
            if (samp && samp[3] > 40) {
              r = samp[0] + pulse * 0.4;
              g = samp[1] + pulse * 0.2;
              b = samp[2];
            } else {
              r = 140 + pulse + noise;
              g = 70 + pulse * 0.3;
              b = 45 + pulse * 0.3;
            }
            break;
          }
          default:
            r = 0;
            g = 0;
            b = 0;
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

  private updateVapor(): void {
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
      // Combined scent: returning trail is warmer/denser; home trail is cooler mist.
      const fv = food[i];
      const hv = home[i];
      const dens = Math.min(fv / 5 + hv / 8, 1);
      if (dens < 0.02) {
        buf[p] = 0;
        buf[p + 1] = 0;
        buf[p + 2] = 0;
        buf[p + 3] = 0;
        continue;
      }
      const t = fv / (fv + hv + 0.0001);
      buf[p] = 210 - t * 40;
      buf[p + 1] = 170 + t * 50;
      buf[p + 2] = 110 + (1 - t) * 80;
      buf[p + 3] = Math.min(dens * 150, 140);
    }

    this.vaporSource.update();
  }

  private updateAnts(engine: SimulationEngine): void {
    const cs = this.cellSize;
    const half = cs / 2;
    const tick = engine.world.tickCount;
    const walkN = this.walkTextures.length;
    const carryN = this.carryTextures.length;
    const usingFallback = this.walkTextures[0] === this.fallbackAnt;
    const scale = usingFallback ? 1 : (cs * 2.8) / 110;
    let s = 0;

    for (const ant of engine.ants) {
      if (!ant.alive) continue;
      let sprite = this.antPool[s];
      if (!sprite) {
        sprite = new Sprite(this.walkTextures[0]);
        sprite.anchor.set(0.5);
        this.antContainer.addChild(sprite);
        this.antPool[s] = sprite;
      }
      sprite.visible = true;
      sprite.x = ant.x * cs + half;
      sprite.y = ant.y * cs + half;
      if (usingFallback) {
        sprite.rotation = DIR_ANGLES[ant.dir];
        sprite.scale.set(1);
        sprite.tint = ant.carrying ? 0xdca028 : 0x1e140f;
      } else {
        // Sheets are head-up; dir 0 is up.
        sprite.rotation = DIR_ANGLES[ant.dir] + Math.PI / 2;
        sprite.scale.set(scale);
        sprite.tint = 0xffffff;
        const frame = (tick + ant.x * 3 + ant.y) % (ant.carrying ? carryN : walkN);
        sprite.texture = ant.carrying
          ? this.carryTextures[frame]
          : this.walkTextures[frame];
      }
      s++;
    }

    for (let i = s; i < this.antPool.length; i++) {
      if (this.antPool[i].visible) this.antPool[i].visible = false;
    }
  }
}
