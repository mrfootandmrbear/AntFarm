import { Ant } from './Ant';
import { Cell } from './constants';
import { SimConfig } from './constants';
import { World } from './World';

/**
 * Orchestrates the simulation: owns the world + the ant agents and advances them
 * one tick at a time. Knows nothing about rendering or input.
 */
export class SimulationEngine {
  readonly world: World;
  ants: Ant[] = [];

  constructor(width: number, height: number) {
    this.world = new World(width, height);
  }

  /** Advance the simulation by one step. */
  tick(): void {
    const world = this.world;
    const cfg = SimConfig.world;

    if (world.tickCount % cfg.waterIntervalTicks === 0) {
      world.updateWater();
    }

    for (const ant of this.ants) ant.update(world);

    if (world.tickCount % cfg.cullIntervalTicks === 0) {
      this.ants = this.ants.filter((a) => a.alive);
    }

    this.spawnAnts();

    if (world.tickCount % cfg.diffuseIntervalTicks === 0) {
      world.homeField.diffuse(world.blocked);
      world.foodField.diffuse(world.blocked);
    }

    world.tickCount++;
  }

  /** Colony growth: periodically hatch a new ant at the nest if there's food. */
  private spawnAnts(): void {
    const world = this.world;
    const cfg = SimConfig.colony;
    if (world.tickCount % cfg.spawnIntervalTicks !== 0) return;

    const alive = this.aliveCount();
    if (alive >= cfg.maxAnts) return;
    if (world.nestFoodStore < 0.3 && alive > 15) return;

    const nest = world.findNestCell();
    if (!nest) return;

    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = nest.x + dx;
        const ny = nest.y + dy;
        if (world.inBounds(nx, ny) && world.isPassable(nx, ny)) {
          this.ants.push(new Ant(nx, ny, nest.x, nest.y));
          if (world.nestFoodStore > 0.2) world.nestFoodStore -= 0.2;
          return;
        }
      }
    }
  }

  /** Spawn a single ant at (x, y), homed to the nearest nest. Returns success. */
  spawnAntAt(x: number, y: number): boolean {
    const nest = this.world.findNearestNest(x, y);
    if (!nest || !this.world.isPassable(x, y)) return false;
    this.ants.push(new Ant(x, y, nest.x, nest.y));
    return true;
  }

  aliveCount(): number {
    let n = 0;
    for (const a of this.ants) if (a.alive) n++;
    return n;
  }

  carryingCount(): number {
    let n = 0;
    for (const a of this.ants) if (a.alive && a.carrying) n++;
    return n;
  }

  /** Wipe everything back to bare dirt. */
  clear(): void {
    this.world.clear();
    this.ants = [];
  }

  /** Clear, then lay down the default starting scene. */
  reset(): void {
    this.clear();
    this.buildDefaultScene();
  }

  /** The starting arrangement: central nest, scattered food, rocks, initial ants. */
  buildDefaultScene(): void {
    const world = this.world;
    const GRID_W = world.width;
    const GRID_H = world.height;
    const nestX = Math.floor(GRID_W / 2);
    const nestY = Math.floor(GRID_H / 2);

    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        if (dx * dx + dy * dy <= 10) {
          world.set(nestX + dx, nestY + dy, Cell.NEST);
        }
      }
    }

    const foodSpots = [
      { x: Math.floor(GRID_W * 0.2), y: Math.floor(GRID_H * 0.25) },
      { x: Math.floor(GRID_W * 0.8), y: Math.floor(GRID_H * 0.3) },
      { x: Math.floor(GRID_W * 0.15), y: Math.floor(GRID_H * 0.75) },
      { x: Math.floor(GRID_W * 0.75), y: Math.floor(GRID_H * 0.8) },
      { x: Math.floor(GRID_W * 0.5), y: Math.floor(GRID_H * 0.15) },
    ];
    for (const spot of foodSpots) {
      const radius = 3 + Math.floor(Math.random() * 3);
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const fx = spot.x + dx;
            const fy = spot.y + dy;
            if (world.inBounds(fx, fy)) world.set(fx, fy, Cell.FOOD);
          }
        }
      }
    }

    const rockClusters = [
      { x: Math.floor(GRID_W * 0.35), y: Math.floor(GRID_H * 0.35) },
      { x: Math.floor(GRID_W * 0.65), y: Math.floor(GRID_H * 0.6) },
      { x: Math.floor(GRID_W * 0.4), y: Math.floor(GRID_H * 0.8) },
    ];
    for (const rock of rockClusters) {
      for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          if (Math.abs(dx) + Math.abs(dy) <= 4 && Math.random() < 0.7) {
            const rx = rock.x + dx;
            const ry = rock.y + dy;
            if (world.inBounds(rx, ry)) world.set(rx, ry, Cell.WALL);
          }
        }
      }
    }

    for (let i = 0; i < SimConfig.colony.initialAnts; i++) {
      const ax = nestX + Math.floor(Math.random() * 9) - 4;
      const ay = nestY + Math.floor(Math.random() * 9) - 4;
      if (world.inBounds(ax, ay)) {
        this.ants.push(new Ant(ax, ay, nestX, nestY));
      }
    }
  }
}
