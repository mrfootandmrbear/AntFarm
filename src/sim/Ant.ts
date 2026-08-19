import { Cell, DIRS, SimConfig } from './constants';
import type { DiffusingField } from './DiffusingField';
import type { Rng } from './Rng';
import type { World } from './World';

export const AntState = {
  SEARCHING: 0,
  RETURNING: 1,
} as const;
export type AntStateType = (typeof AntState)[keyof typeof AntState];

/**
 * A single ant. Pure agent logic operating on the {@link World}: it follows
 * pheromone gradients, picks up food, returns it to the nest, and digs through
 * dirt when boxed in. Rendering lives entirely in the renderer.
 */
export class Ant {
  x: number;
  y: number;
  nestX: number;
  nestY: number;
  state: AntStateType = AntState.SEARCHING;
  carrying = false;
  dir: number;
  energy = 1.0;
  alive = true;
  stuckTimer = 0;
  digCooldown = 0;
  returnTicks = 0;

  constructor(x: number, y: number, nestX: number, nestY: number, rng: Rng) {
    this.x = x;
    this.y = y;
    this.nestX = nestX;
    this.nestY = nestY;
    this.dir = rng.int(8);
  }

  update(world: World): void {
    if (!this.alive) return;

    this.energy -= SimConfig.ant.energyDrainPerTick;
    if (this.energy <= 0) {
      this.alive = false;
      return;
    }
    if (this.digCooldown > 0) this.digCooldown--;

    if (world.get(this.x, this.y) === Cell.WATER) {
      this.alive = false;
      return;
    }

    if (this.state === AntState.SEARCHING) {
      this.search(world);
    } else {
      this.returnToNest(world);
    }
  }

  private search(world: World): void {
    const i = world.idx(this.x, this.y);
    world.homeField.deposit(this.x, this.y, SimConfig.pheromone.exploreDeposit);

    if (world.cells[i] === Cell.FOOD && world.foodAmount[i] > 0.05) {
      world.foodAmount[i] -= 0.1;
      if (world.foodAmount[i] <= 0.05) {
        world.cells[i] = Cell.DIRT;
        world.foodAmount[i] = 0;
      }
      this.carrying = true;
      this.state = AntState.RETURNING;
      this.returnTicks = 0;
      this.energy = Math.min(this.energy + SimConfig.ant.foodEnergyGain, 1.0);
      this.dir = (this.dir + 4) % 8;
      return;
    }

    this.moveAlongGradient(world, world.foodField, true);
  }

  private returnToNest(world: World): void {
    const i = world.idx(this.x, this.y);
    world.foodField.deposit(this.x, this.y, SimConfig.pheromone.foodDeposit);
    this.returnTicks++;

    if (world.cells[i] === Cell.NEST) {
      this.carrying = false;
      this.state = AntState.SEARCHING;
      this.returnTicks = 0;
      this.energy = Math.min(this.energy + SimConfig.ant.nestEnergyGain, 1.0);
      world.nestFoodStore += 0.1;
      this.dir = (this.dir + 4) % 8;
      return;
    }

    if (this.returnTicks >= SimConfig.ant.giveUpReturnTicks) {
      this.carrying = false;
      this.state = AntState.SEARCHING;
      this.returnTicks = 0;
      this.dir = (this.dir + 4) % 8;
      return;
    }

    this.moveAlongGradient(world, world.homeField, false);
  }

  private moveAlongGradient(
    world: World,
    field: DiffusingField,
    isSearching: boolean,
  ): void {
    const candidates: { idx: number; nx: number; ny: number; weight: number }[] = [];

    for (let dirIdx = 0; dirIdx < 8; dirIdx++) {
      const d = DIRS[dirIdx];
      const nx = this.x + d.dx;
      const ny = this.y + d.dy;
      if (!world.isPassable(nx, ny)) continue;

      const ni = world.idx(nx, ny);
      const pheromone = field.getAt(ni);
      const dirDiff = Math.min(Math.abs(dirIdx - this.dir), 8 - Math.abs(dirIdx - this.dir));
      const forwardBias = dirDiff === 0 ? 4 : dirDiff === 1 ? 2.5 : dirDiff <= 2 ? 1 : 0.05;

      let targetPull = 0;
      const targetCell = world.cells[ni];
      if (isSearching && targetCell === Cell.FOOD) targetPull = 80;
      if (!isSearching && targetCell === Cell.NEST) targetPull = 80;

      const weight = (pheromone * 6 + 0.1) * forwardBias + targetPull;
      candidates.push({ idx: dirIdx, nx, ny, weight });
    }

    if (candidates.length === 0) {
      this.handleBlocked(world);
      return;
    }

    this.stuckTimer = 0;

    // Occasional opportunistic dig even when a path exists, to open shortcuts.
    if (this.digCooldown <= 0 && world.rng.chance(0.03)) {
      const d = DIRS[this.dir];
      const digX = this.x + d.dx;
      const digY = this.y + d.dy;
      if (world.isDiggable(digX, digY)) {
        world.dig(digX, digY);
        this.x = digX;
        this.y = digY;
        this.energy -= SimConfig.ant.digEnergyCost;
        this.digCooldown = 5;
        return;
      }
    }

    // Random exploration.
    if (world.rng.chance(0.1)) {
      const pick = candidates[world.rng.int(candidates.length)];
      this.moveTo(pick.nx, pick.ny, pick.idx);
      return;
    }

    // Weighted roulette toward stronger pheromone / targets.
    let totalWeight = 0;
    for (const c of candidates) totalWeight += c.weight;
    let r = world.rng.next() * totalWeight;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) {
        this.moveTo(c.nx, c.ny, c.idx);
        return;
      }
    }
    const last = candidates[candidates.length - 1];
    this.moveTo(last.nx, last.ny, last.idx);
  }

  private handleBlocked(world: World): void {
    if (this.digCooldown <= 0) {
      const d = DIRS[this.dir];
      const digX = this.x + d.dx;
      const digY = this.y + d.dy;
      if (world.isDiggable(digX, digY)) {
        world.dig(digX, digY);
        this.x = digX;
        this.y = digY;
        this.energy -= SimConfig.ant.digEnergyCost;
        this.digCooldown = 3;
        this.stuckTimer = 0;
        return;
      }
    }
    this.dir = (this.dir + 3 + world.rng.int(3)) % 8;
    this.stuckTimer++;
    if (this.stuckTimer > 10) {
      this.dir = world.rng.int(8);
      this.stuckTimer = 0;
    }
  }

  private moveTo(nx: number, ny: number, dirIdx: number): void {
    this.x = nx;
    this.y = ny;
    this.dir = dirIdx;
  }
}
