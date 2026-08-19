import { Ant } from './Ant';
import { AntKind, AntKindType, Cell, CellType } from './constants';
import { SimConfig } from './constants';
import { Lizard } from './Lizard';
import { World } from './World';

/**
 * Orchestrates the simulation: owns the world + the ant agents and advances them
 * one tick at a time. Knows nothing about rendering or input.
 */
export class SimulationEngine {
  readonly world: World;
  ants: Ant[] = [];
  lizards: Lizard[] = [];
  allowSpawn = true;
  allowWater = true;

  constructor(width: number, height: number, seed = 1) {
    this.world = new World(width, height, seed);
  }

  /** Advance the simulation by one step. */
  tick(): void {
    const world = this.world;
    const cfg = SimConfig.world;

    if (this.allowWater && world.tickCount % cfg.waterIntervalTicks === 0) {
      world.updateWater();
    }

    for (const ant of this.ants) ant.update(world);
    this.resolveRaids();
    for (const lizard of this.lizards) lizard.update(world, this.ants);

    if (world.tickCount % cfg.cullIntervalTicks === 0) {
      this.ants = this.ants.filter((a) => a.alive);
      this.lizards = this.lizards.filter((l) => l.alive);
    }

    if (this.allowSpawn) {
      this.spawnAnts();
      this.spawnFireAnts();
    }

    if (world.tickCount % cfg.diffuseIntervalTicks === 0) {
      world.homeField.diffuse(world.blocked);
      world.foodField.diffuse(world.blocked);
      world.fireHomeField.diffuse(world.blocked);
      world.fireFoodField.diffuse(world.blocked);
    }

    world.tickCount++;
  }

  /**
   * Fire ants locally displace harvesters they bump into. Skipped entirely
   * when only one colony is present so eval RNG stays identical.
   */
  private resolveRaids(): void {
    let fire = 0;
    let harv = 0;
    for (const a of this.ants) {
      if (!a.alive) continue;
      if (a.kind === AntKind.FIRE) fire++;
      else harv++;
    }
    if (fire === 0 || harv === 0) return;

    const rng = this.world.rng;
    const bump = SimConfig.fireAnt.bumpKillChance;
    const adj = SimConfig.fireAnt.adjacentKillChance;
    const swarmN = SimConfig.fireAnt.swarmDefenseCount;
    const swarmP = SimConfig.fireAnt.swarmDefenseChance;

    for (const f of this.ants) {
      if (!f.alive || f.kind !== AntKind.FIRE) continue;
      let nearbyHarvesters = 0;
      for (const h of this.ants) {
        if (!h.alive || h.kind !== AntKind.HARVESTER) continue;
        const d = Math.max(Math.abs(h.x - f.x), Math.abs(h.y - f.y));
        if (d > 1) continue;
        nearbyHarvesters++;
        if (rng.chance(d === 0 ? bump : adj)) h.alive = false;
      }
      if (nearbyHarvesters >= swarmN && rng.chance(swarmP)) f.alive = false;
    }
  }

  /** Colony growth: periodically hatch a new ant at the nest if there's food. */
  private spawnAnts(): void {
    const world = this.world;
    const cfg = SimConfig.colony;
    if (world.tickCount % cfg.spawnIntervalTicks !== 0) return;

    const alive = this.aliveCount();
    if (alive >= cfg.maxAnts) return;
    if (world.nestFoodStore < cfg.spawnMinStore) return;

    const nest = world.findNestCell();
    if (!nest) return;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = nest.x + dx;
        const ny = nest.y + dy;
        if (world.inBounds(nx, ny) && world.isPassable(nx, ny)) {
          this.ants.push(new Ant(nx, ny, nest.x, nest.y, world.rng));
          world.nestFoodStore -= cfg.spawnCost;
          return;
        }
      }
    }
  }

  private spawnFireAnts(): void {
    const world = this.world;
    const cfg = SimConfig.colony;
    if (world.tickCount % cfg.spawnIntervalTicks !== 0) return;

    if (this.aliveCount() >= cfg.maxAnts) return;
    if (world.fireNestFoodStore < cfg.spawnMinStore) return;

    const nest = world.findFireNestCell();
    if (!nest) return;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = nest.x + dx;
        const ny = nest.y + dy;
        if (world.inBounds(nx, ny) && world.isPassable(nx, ny)) {
          this.ants.push(new Ant(nx, ny, nest.x, nest.y, world.rng, AntKind.FIRE));
          world.fireNestFoodStore -= cfg.spawnCost;
          return;
        }
      }
    }
  }

  /** Spawn a single ant at (x, y), homed to the nearest matching nest. */
  spawnAntAt(x: number, y: number, kind: AntKindType = AntKind.HARVESTER): boolean {
    const nestType = kind === AntKind.FIRE ? Cell.FIRE_NEST : Cell.NEST;
    const nest = this.world.findNearestCell(x, y, nestType);
    if (!this.world.isPassable(x, y)) return false;
    const home = nest ?? { x, y };
    this.ants.push(new Ant(x, y, home.x, home.y, this.world.rng, kind));
    return true;
  }

  spawnFireAntAt(x: number, y: number): boolean {
    return this.spawnAntAt(x, y, AntKind.FIRE);
  }

  spawnLizardAt(x: number, y: number): boolean {
    if (!this.world.isPassable(x, y)) return false;
    if (this.lizardCount() >= SimConfig.lizard.maxLizards) return false;
    this.lizards.push(new Lizard(x, y, this.world.rng.int(8)));
    return true;
  }

  spawnAntsNear(
    x: number,
    y: number,
    count: number,
    kind: AntKindType = AntKind.HARVESTER,
  ): number {
    let n = 0;
    const rng = this.world.rng;
    for (let i = 0; i < count; i++) {
      const ax = x + rng.int(9) - 4;
      const ay = y + rng.int(9) - 4;
      if (this.spawnAntAt(ax, ay, kind)) n++;
    }
    return n;
  }

  fillDisk(cx: number, cy: number, radius: number, type: CellType): void {
    const world = this.world;
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (world.inBounds(x, y)) world.set(x, y, type);
      }
    }
  }

  /** Horizontal rock wall with a gap. Used by eval — rock is not diggable. */
  placeWallWithGap(
    x: number,
    y0: number,
    y1: number,
    gapY: number,
    gapHalf: number,
  ): void {
    const world = this.world;
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    for (let y = lo; y <= hi; y++) {
      if (Math.abs(y - gapY) <= gapHalf) continue;
      if (world.inBounds(x, y)) world.set(x, y, Cell.WALL);
    }
  }

  aliveCount(): number {
    let n = 0;
    for (const a of this.ants) if (a.alive) n++;
    return n;
  }

  fireAliveCount(): number {
    let n = 0;
    for (const a of this.ants) if (a.alive && a.kind === AntKind.FIRE) n++;
    return n;
  }

  lizardCount(): number {
    let n = 0;
    for (const l of this.lizards) if (l.alive) n++;
    return n;
  }

  carryingCount(): number {
    let n = 0;
    for (const a of this.ants) if (a.alive && a.carrying) n++;
    return n;
  }

  searchingSpread(): number {
    const xs: number[] = [];
    for (const a of this.ants) {
      if (a.alive && !a.carrying) xs.push(a.x);
    }
    if (xs.length < 2) return 0;
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    let v = 0;
    for (const x of xs) v += (x - mean) * (x - mean);
    return Math.sqrt(v / xs.length);
  }

  /** Wipe everything back to bare dirt. */
  clear(): void {
    this.world.clear();
    this.ants = [];
    this.lizards = [];
  }

  /** Clear, then lay down the default starting scene. */
  reset(): void {
    this.clear();
    this.buildDefaultScene();
  }

  /** The starting arrangement: central nest, scattered food, rocks, initial ants. */
  buildDefaultScene(): void {
    const world = this.world;
    const rng = world.rng;
    const GRID_W = world.width;
    const GRID_H = world.height;
    const nestX = Math.floor(GRID_W / 2);
    const nestY = Math.floor(GRID_H / 2);

    this.fillDisk(nestX, nestY, 3, Cell.NEST);

    const foodSpots = [
      { x: Math.floor(GRID_W * 0.2), y: Math.floor(GRID_H * 0.25) },
      { x: Math.floor(GRID_W * 0.8), y: Math.floor(GRID_H * 0.3) },
      { x: Math.floor(GRID_W * 0.15), y: Math.floor(GRID_H * 0.75) },
      { x: Math.floor(GRID_W * 0.75), y: Math.floor(GRID_H * 0.8) },
      { x: Math.floor(GRID_W * 0.5), y: Math.floor(GRID_H * 0.15) },
    ];
    for (const spot of foodSpots) {
      this.fillDisk(spot.x, spot.y, 3 + rng.int(3), Cell.FOOD);
    }

    const rockClusters = [
      { x: Math.floor(GRID_W * 0.35), y: Math.floor(GRID_H * 0.35) },
      { x: Math.floor(GRID_W * 0.65), y: Math.floor(GRID_H * 0.6) },
      { x: Math.floor(GRID_W * 0.4), y: Math.floor(GRID_H * 0.8) },
    ];
    for (const rock of rockClusters) {
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          if (Math.abs(dx) + Math.abs(dy) <= 4 && rng.chance(0.7)) {
            const rx = rock.x + dx;
            const ry = rock.y + dy;
            if (world.inBounds(rx, ry)) world.set(rx, ry, Cell.WALL);
          }
        }
      }
    }

    this.spawnAntsNear(nestX, nestY, SimConfig.colony.initialAnts);
    world.initialFoodMass = world.totalFoodMass();
  }
}
