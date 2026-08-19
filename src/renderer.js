import { Cell } from './world.js';

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.cellSize = 4;
    this.showPheromones = false;
    this.pheromoneType = 'food';

    this.imageData = this.ctx.createImageData(canvas.width, canvas.height);
    this.pixels = this.imageData.data;

    this.cellNoise = new Int8Array(world.width * world.height);
    for (let i = 0; i < this.cellNoise.length; i++) {
      this.cellNoise[i] = Math.floor(Math.random() * 10) - 5;
    }
  }

  resize() {
    this.canvas.width = this.world.width * this.cellSize;
    this.canvas.height = this.world.height * this.cellSize;
    this.imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    this.pixels = this.imageData.data;
  }

  setPixel(px, py, r, g, b) {
    const idx = (py * this.canvas.width + px) * 4;
    this.pixels[idx] = r;
    this.pixels[idx + 1] = g;
    this.pixels[idx + 2] = b;
    this.pixels[idx + 3] = 255;
  }

  fillCell(x, y, r, g, b) {
    const cs = this.cellSize;
    const sx = x * cs;
    const sy = y * cs;
    for (let py = sy; py < sy + cs; py++) {
      for (let px = sx; px < sx + cs; px++) {
        this.setPixel(px, py, r, g, b);
      }
    }
  }

  render() {
    const w = this.world.width;
    const h = this.world.height;
    const cells = this.world.cells;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const cell = cells[i];
        const noise = this.cellNoise[i];
        let r, g, b;

        switch (cell) {
          case Cell.EMPTY:
          case Cell.DIRT: {
            r = 139 + noise;
            g = 115 + noise;
            b = 72 + Math.floor(noise * 0.5);
            break;
          }
          case Cell.WALL: {
            r = 90 + noise;
            g = 85 + noise;
            b = 80 + noise;
            break;
          }
          case Cell.WATER: {
            const shimmer = Math.sin((x * 0.3 + y * 0.2 + this.world.tickCount * 0.04)) * 8;
            r = 40 + Math.floor(shimmer);
            g = 100 + Math.floor(shimmer);
            b = 170 + Math.floor(shimmer * 0.5);
            break;
          }
          case Cell.FOOD: {
            const amount = this.world.foodAmount[i];
            const brightness = 0.5 + amount * 0.5;
            r = Math.floor(80 * brightness) + noise;
            g = Math.floor(180 * brightness) + noise;
            b = Math.floor(50 * brightness) + Math.floor(noise * 0.3);
            break;
          }
          case Cell.NEST: {
            const pulse = Math.sin(this.world.tickCount * 0.03) * 8;
            r = Math.floor(140 + pulse) + noise;
            g = Math.floor(70 + pulse * 0.3);
            b = Math.floor(45 + pulse * 0.3);
            break;
          }
          default:
            r = 0; g = 0; b = 0;
        }

        if (this.showPheromones && cell !== Cell.WALL && cell !== Cell.WATER) {
          const phero = this.pheromoneType === 'food'
            ? this.world.foodPheromone[i]
            : this.world.homePheromone[i];
          if (phero > 0.01) {
            const intensity = Math.min(phero / 4, 1);
            if (this.pheromoneType === 'food') {
              r = Math.floor(r * (1 - intensity * 0.8) + 100 * intensity * 0.8);
              g = Math.floor(g * (1 - intensity * 0.8) + 255 * intensity * 0.8);
              b = Math.floor(b * (1 - intensity * 0.8) + 100 * intensity * 0.8);
            } else {
              r = Math.floor(r * (1 - intensity * 0.8) + 100 * intensity * 0.8);
              g = Math.floor(g * (1 - intensity * 0.8) + 150 * intensity * 0.8);
              b = Math.floor(b * (1 - intensity * 0.8) + 255 * intensity * 0.8);
            }
          }
        }

        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));

        this.fillCell(x, y, r, g, b);
      }
    }

    const cs = this.cellSize;
    for (const ant of this.world.ants) {
      if (!ant.alive) continue;
      const sx = ant.x * cs;
      const sy = ant.y * cs;

      let ar, ag, ab;
      if (ant.carrying) {
        ar = 220; ag = 160; ab = 40;
      } else {
        ar = 30; ag = 20; ab = 15;
      }

      if (cs >= 4) {
        for (let py = sy + 1; py < sy + cs - 1; py++) {
          for (let px = sx + 1; px < sx + cs - 1; px++) {
            this.setPixel(px, py, ar, ag, ab);
          }
        }
      } else {
        for (let py = sy; py < sy + cs; py++) {
          for (let px = sx; px < sx + cs; px++) {
            this.setPixel(px, py, ar, ag, ab);
          }
        }
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
