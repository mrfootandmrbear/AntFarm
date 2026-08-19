import {
  Application,
  Assets,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
} from 'pixi.js';
import { AntKind, Cell, DIR_ANGLES } from '../sim/constants';
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

  private sceneryContainer!: Container;
  private antContainer!: Container;
  private lizardContainer!: Container;
  private fallbackAnt!: Texture;
  private walkTextures: Texture[] = [];
  private carryTextures: Texture[] = [];
  private fireWalkTextures: Texture[] = [];
  private fireCarryTextures: Texture[] = [];
  private lizardWalkTextures: Texture[] = [];
  private lizardTongueTex: Texture | null = null;
  private antPool: Sprite[] = [];
  private lizardPool: Sprite[] = [];

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

    this.fallbackAnt = this.makeAntTexture();
    this.walkTextures = await this.loadTextures(sortedUrls('ant-walk-'));
    this.carryTextures = await this.loadTextures(sortedUrls('ant-carry-'));
    this.fireWalkTextures = await this.loadTextures(sortedUrls('fire-ant-walk-'));
    this.fireCarryTextures = await this.loadTextures(sortedUrls('fire-ant-carry-'));
    this.lizardWalkTextures = await this.loadTextures(sortedUrls('lizard-walk-'));
    const tongueUrl = assetUrl('lizard-tongue.png');
    if (tongueUrl) {
      const loaded = await this.loadTextures([tongueUrl]);
      this.lizardTongueTex = loaded[0] ?? null;
    }
    if (this.walkTextures.length === 0) this.walkTextures = [this.fallbackAnt];
    if (this.carryTextures.length === 0) this.carryTextures = this.walkTextures;
    if (this.fireWalkTextures.length === 0) this.fireWalkTextures = this.walkTextures;
    if (this.fireCarryTextures.length === 0) this.fireCarryTextures = this.fireWalkTextures;
    if (this.lizardWalkTextures.length === 0) this.lizardWalkTextures = [this.fallbackAnt];

    this.antContainer = new Container();
    this.app.stage.addChild(this.antContainer);
    this.lizardContainer = new Container();
    this.app.stage.addChild(this.lizardContainer);

    this.foodSpriteTex = await this.loadTexture(assetUrl('food.png'));
    this.nestSpriteTex = await this.loadTexture(assetUrl('nest.png'));
    this.fireNestSpriteTex = await this.loadTexture(assetUrl('fire-nest.png'));
    this.rockSpriteTex = await this.loadTexture(assetUrl('rock.png'));

    this.cellNoise = new Int8Array(w * h);
    for (let i = 0; i < this.cellNoise.length; i++) {
      this.cellNoise[i] = ((Math.random() * 10) | 0) - 5;
    }
  }

  private async loadTexture(url: string | undefined): Promise<Texture | null> {
    if (!url) return null;
    try {
      return (await Assets.load(url)) as Texture;
    } catch {
      return null;
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
    this.updateScenery();
    this.updateAnts(engine);
    this.updateLizards(engine);
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
      buf[p + 3] = Math.min(dens * 118, 112);
    }

    this.vaporSource.update();
  }

  /** Draw one coherent illustration per patch instead of stamping every grid cell. */
  private updateScenery(): void {
    const tick = this.world.tickCount;
    if (!this.sceneryDirty && (tick === this.sceneryTick || tick % 20 !== 0)) return;
    this.sceneryDirty = false;
    this.sceneryTick = tick;
    this.sceneryContainer.removeChildren().forEach((child) => child.destroy());

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

        const stride = type === Cell.WALL ? Math.max(1, Math.floor(members.length / 12)) : members.length;
        const points = type === Cell.WALL ? members.filter((_, i) => i % stride === 0) : [members[0]];
        for (const point of points) {
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);
          const x = type === Cell.WALL ? point % w : sx / members.length;
          const y = type === Cell.WALL ? (point / w) | 0 : sy / members.length;
          sprite.x = (x + 0.5) * this.cellSize;
          sprite.y = (y + 0.5) * this.cellSize;
          const diameter = type === Cell.WALL ? 5.5 : Math.max(5, Math.min(12, Math.sqrt(members.length) * 2.3));
          const target = diameter * this.cellSize;
          sprite.scale.set(target / Math.max(texture.width, texture.height));
          sprite.rotation = type === Cell.WALL ? ((point * 17) % 9 - 4) * 0.04 : 0;
          sprite.alpha = type === Cell.FOOD ? 0.95 : 1;
          this.sceneryContainer.addChild(sprite);
        }
      }
    }
  }

  private updateAnts(engine: SimulationEngine): void {
    const cs = this.cellSize;
    const half = cs / 2;
    const tick = engine.world.tickCount;
    let s = 0;

    for (const ant of engine.ants) {
      if (!ant.alive) continue;
      const isFire = ant.kind === AntKind.FIRE;
      const walk = isFire ? this.fireWalkTextures : this.walkTextures;
      const carry = isFire ? this.fireCarryTextures : this.carryTextures;
      const walkN = walk.length;
      const carryN = carry.length;
      const usingFallback = walk[0] === this.fallbackAnt;
      const scale = usingFallback ? 1 : isFire ? (cs * 3.0) / 70 : (cs * 3.25) / 110;
      let sprite = this.antPool[s];
      if (!sprite) {
        sprite = new Sprite(walk[0]);
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
        sprite.tint = ant.carrying ? 0xdca028 : isFire ? 0x2a1814 : 0x1e140f;
      } else {
        sprite.rotation = DIR_ANGLES[ant.dir] + Math.PI / 2;
        sprite.scale.set(scale);
        sprite.tint = isFire ? 0xb8b0b0 : 0xffffff;
        const frame = (tick + ant.x * 3 + ant.y) % (ant.carrying ? carryN : walkN);
        sprite.texture = ant.carrying ? carry[frame] : walk[frame];
      }
      s++;
    }

    for (let i = s; i < this.antPool.length; i++) {
      if (this.antPool[i].visible) this.antPool[i].visible = false;
    }
  }

  private updateLizards(engine: SimulationEngine): void {
    const cs = this.cellSize;
    const half = cs / 2;
    const tick = engine.world.tickCount;
    const walk = this.lizardWalkTextures;
    const walkN = walk.length;
    const tongue = this.lizardTongueTex;
    const usingFallback = walk[0] === this.fallbackAnt;
    const scale = usingFallback ? 2.4 : (cs * 6.2) / 130;
    let s = 0;

    for (const lizard of engine.lizards) {
      if (!lizard.alive) continue;
      let sprite = this.lizardPool[s];
      if (!sprite) {
        sprite = new Sprite(walk[0]);
        sprite.anchor.set(0.5);
        this.lizardContainer.addChild(sprite);
        this.lizardPool[s] = sprite;
      }
      sprite.visible = true;
      sprite.x = lizard.x * cs + half;
      sprite.y = lizard.y * cs + half;
      sprite.rotation = DIR_ANGLES[lizard.dir] + Math.PI / 2;
      sprite.scale.set(scale);
      if (lizard.swarmTicks > 0) sprite.tint = 0xffc8b0;
      else sprite.tint = 0xffffff;
      if (lizard.eatingTicks > 0 && tongue) {
        sprite.texture = tongue;
      } else {
        const frame = (tick + lizard.x * 2 + lizard.y) % walkN;
        sprite.texture = walk[frame];
      }
      s++;
    }

    for (let i = s; i < this.lizardPool.length; i++) {
      if (this.lizardPool[i].visible) this.lizardPool[i].visible = false;
    }
  }
}
