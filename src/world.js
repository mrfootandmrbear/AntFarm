export const Cell = {
  EMPTY: 0,
  DIRT: 1,
  WALL: 2,
  WATER: 3,
  FOOD: 4,
  NEST: 5,
};

export const CellNames = {
  [Cell.EMPTY]: 'Empty',
  [Cell.DIRT]: 'Dirt',
  [Cell.WALL]: 'Wall',
  [Cell.WATER]: 'Water',
  [Cell.FOOD]: 'Food',
  [Cell.NEST]: 'Nest',
};

export class World {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height);
    this.foodAmount = new Float32Array(width * height);

    this.homePheromone = new Float32Array(width * height);
    this.foodPheromone = new Float32Array(width * height);
    this.homePheromoneNext = new Float32Array(width * height);
    this.foodPheromoneNext = new Float32Array(width * height);

    this.nestFoodStore = 0;
    this.ants = [];
    this.tickCount = 0;
    this._antModule = null;

    this.cells.fill(Cell.DIRT);
  }

  clear() {
    this.cells.fill(Cell.DIRT);
    this.foodAmount.fill(0);
    this.homePheromone.fill(0);
    this.foodPheromone.fill(0);
    this.nestFoodStore = 0;
    this.ants = [];
    this.tickCount = 0;
  }

  idx(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x, y) {
    return this.cells[this.idx(x, y)];
  }

  set(x, y, type) {
    const i = this.idx(x, y);
    this.cells[i] = type;
    if (type === Cell.FOOD) {
      this.foodAmount[i] = 1.0;
    } else {
      this.foodAmount[i] = 0;
    }
  }

  isPassable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const c = this.cells[this.idx(x, y)];
    return c === Cell.DIRT || c === Cell.EMPTY || c === Cell.FOOD || c === Cell.NEST;
  }

  isDiggable(x, y) {
    if (!this.inBounds(x, y)) return false;
    return this.cells[this.idx(x, y)] === Cell.DIRT;
  }

  dig(x, y) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    if (this.cells[i] === Cell.DIRT) {
      this.cells[i] = Cell.EMPTY;
    }
  }

  updateWater() {
    if (this.tickCount % 3 !== 0) return;
    const dirs = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    ];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.cells[this.idx(x, y)] !== Cell.WATER) continue;
        if (Math.random() > 0.15) continue;
        const d = dirs[Math.floor(Math.random() * 4)];
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (this.cells[ni] === Cell.EMPTY) {
          this.cells[ni] = Cell.WATER;
        }
      }
    }
  }

  diffusePheromones() {
    const w = this.width;
    const h = this.height;
    const evapRate = 0.993;
    const diffuseRate = 0.015;

    this.homePheromoneNext.fill(0);
    this.foodPheromoneNext.fill(0);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        if (this.cells[i] === Cell.WALL || this.cells[i] === Cell.WATER) {
          continue;
        }

        let homeSum = 0;
        let foodSum = 0;
        let neighbors = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!this.inBounds(nx, ny)) continue;
            const ni = this.idx(nx, ny);
            if (this.cells[ni] === Cell.WALL || this.cells[ni] === Cell.WATER) continue;
            homeSum += this.homePheromone[ni];
            foodSum += this.foodPheromone[ni];
            neighbors++;
          }
        }

        if (neighbors > 0) {
          const homeAvg = homeSum / neighbors;
          const foodAvg = foodSum / neighbors;
          this.homePheromoneNext[i] = (this.homePheromone[i] * (1 - diffuseRate) + homeAvg * diffuseRate) * evapRate;
          this.foodPheromoneNext[i] = (this.foodPheromone[i] * (1 - diffuseRate) + foodAvg * diffuseRate) * evapRate;
        } else {
          this.homePheromoneNext[i] = this.homePheromone[i] * evapRate;
          this.foodPheromoneNext[i] = this.foodPheromone[i] * evapRate;
        }

        if (this.homePheromoneNext[i] < 0.001) this.homePheromoneNext[i] = 0;
        if (this.foodPheromoneNext[i] < 0.001) this.foodPheromoneNext[i] = 0;
      }
    }

    const tmpH = this.homePheromone;
    this.homePheromone = this.homePheromoneNext;
    this.homePheromoneNext = tmpH;

    const tmpF = this.foodPheromone;
    this.foodPheromone = this.foodPheromoneNext;
    this.foodPheromoneNext = tmpF;
  }

  findNestCell() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.cells[this.idx(x, y)] === Cell.NEST) return { x, y };
      }
    }
    return null;
  }

  spawnAnts() {
    if (this.tickCount % 50 !== 0) return;
    const alive = this.ants.filter(a => a.alive).length;
    if (alive >= 100) return;
    if (this.nestFoodStore < 0.3 && alive > 15) return;

    const nest = this.findNestCell();
    if (!nest) return;

    const { Ant } = this._antModule;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = nest.x + dx;
        const ny = nest.y + dy;
        if (this.inBounds(nx, ny) && this.isPassable(nx, ny)) {
          this.ants.push(new Ant(nx, ny, nest.x, nest.y));
          if (this.nestFoodStore > 0.2) this.nestFoodStore -= 0.2;
          return;
        }
      }
    }
  }

  tick() {
    this.updateWater();

    for (const ant of this.ants) {
      ant.update(this);
    }

    if (this.tickCount % 100 === 0) {
      this.ants = this.ants.filter(a => a.alive);
    }

    this.spawnAnts();

    if (this.tickCount % 2 === 0) {
      this.diffusePheromones();
    }

    this.tickCount++;
  }
}
