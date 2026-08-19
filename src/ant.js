import { Cell } from './world.js';

const State = {
  SEARCHING: 0,
  RETURNING: 1,
};

const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

export class Ant {
  constructor(x, y, nestX, nestY) {
    this.x = x;
    this.y = y;
    this.nestX = nestX;
    this.nestY = nestY;
    this.state = State.SEARCHING;
    this.carrying = false;
    this.dir = Math.floor(Math.random() * 8);
    this.energy = 1.0;
    this.alive = true;
    this.stuckTimer = 0;
    this.digCooldown = 0;
  }

  update(world) {
    if (!this.alive) return;

    this.energy -= 0.0001;
    if (this.energy <= 0) {
      this.alive = false;
      return;
    }
    if (this.digCooldown > 0) this.digCooldown--;

    const cell = world.get(this.x, this.y);
    if (cell === Cell.WATER) {
      this.alive = false;
      return;
    }

    if (this.state === State.SEARCHING) {
      this.search(world);
    } else {
      this.returnToNest(world);
    }
  }

  search(world) {
    const i = world.idx(this.x, this.y);
    world.homePheromone[i] = Math.min(world.homePheromone[i] + 1.0, 10);

    if (world.cells[i] === Cell.FOOD) {
      if (world.foodAmount[i] > 0.05) {
        world.foodAmount[i] -= 0.1;
        if (world.foodAmount[i] <= 0.05) {
          world.cells[i] = Cell.DIRT;
          world.foodAmount[i] = 0;
        }
        this.carrying = true;
        this.state = State.RETURNING;
        this.energy = Math.min(this.energy + 0.3, 1.0);
        this.dir = (this.dir + 4) % 8;
        return;
      }
    }

    this.moveAlongGradient(world, world.foodPheromone, true);
  }

  returnToNest(world) {
    const i = world.idx(this.x, this.y);
    world.foodPheromone[i] = Math.min(world.foodPheromone[i] + 1.0, 10);

    if (world.cells[i] === Cell.NEST) {
      this.carrying = false;
      this.state = State.SEARCHING;
      this.energy = Math.min(this.energy + 0.5, 1.0);
      world.nestFoodStore += 0.1;
      this.dir = (this.dir + 4) % 8;
      return;
    }

    this.moveAlongGradient(world, world.homePheromone, false);
  }

  moveAlongGradient(world, pheromoneGrid, isSearching) {
    const candidates = [];

    for (let i = 0; i < 8; i++) {
      const d = DIRS[i];
      const nx = this.x + d.dx;
      const ny = this.y + d.dy;

      if (!world.isPassable(nx, ny)) continue;

      const pheromone = pheromoneGrid[world.idx(nx, ny)];
      const dirDiff = Math.min(Math.abs(i - this.dir), 8 - Math.abs(i - this.dir));
      const forwardBias = dirDiff === 0 ? 4 : dirDiff === 1 ? 2.5 : dirDiff <= 2 ? 1 : 0.05;

      let targetPull = 0;
      if (isSearching && world.cells[world.idx(nx, ny)] === Cell.FOOD) {
        targetPull = 80;
      }
      if (!isSearching && world.cells[world.idx(nx, ny)] === Cell.NEST) {
        targetPull = 80;
      }

      const weight = (pheromone * 6 + 0.1) * forwardBias + targetPull;
      candidates.push({ idx: i, nx, ny, weight });
    }

    if (candidates.length === 0) {
      if (this.digCooldown <= 0) {
        const d = DIRS[this.dir];
        const digX = this.x + d.dx;
        const digY = this.y + d.dy;
        if (world.isDiggable(digX, digY)) {
          world.dig(digX, digY);
          this.x = digX;
          this.y = digY;
          this.energy -= 0.005;
          this.digCooldown = 3;
          this.stuckTimer = 0;
          return;
        }
      }
      this.dir = (this.dir + 3 + Math.floor(Math.random() * 3)) % 8;
      this.stuckTimer++;
      if (this.stuckTimer > 10) {
        this.dir = Math.floor(Math.random() * 8);
        this.stuckTimer = 0;
      }
      return;
    }

    this.stuckTimer = 0;

    if (this.digCooldown <= 0 && Math.random() < 0.03) {
      const d = DIRS[this.dir];
      const digX = this.x + d.dx;
      const digY = this.y + d.dy;
      if (world.isDiggable(digX, digY)) {
        world.dig(digX, digY);
        this.x = digX;
        this.y = digY;
        this.energy -= 0.005;
        this.digCooldown = 5;
        return;
      }
    }

    if (Math.random() < 0.1) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      this.x = pick.nx;
      this.y = pick.ny;
      this.dir = pick.idx;
      return;
    }

    let totalWeight = 0;
    for (const c of candidates) totalWeight += c.weight;

    let r = Math.random() * totalWeight;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) {
        this.x = c.nx;
        this.y = c.ny;
        this.dir = c.idx;
        return;
      }
    }

    const last = candidates[candidates.length - 1];
    this.x = last.nx;
    this.y = last.ny;
    this.dir = last.idx;
  }
}
