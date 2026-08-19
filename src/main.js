import { World, Cell } from './world.js';
import { Ant } from './ant.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';

const GRID_W = 200;
const GRID_H = 150;

const canvas = document.getElementById('game');
const world = new World(GRID_W, GRID_H);
world._antModule = { Ant };
const renderer = new Renderer(canvas, world);
renderer.resize();

function spawnDefaultScene() {
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
          if (world.inBounds(fx, fy)) {
            world.set(fx, fy, Cell.FOOD);
          }
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
          if (world.inBounds(rx, ry)) {
            world.set(rx, ry, Cell.WALL);
          }
        }
      }
    }
  }

  for (let i = 0; i < 40; i++) {
    const ax = nestX + Math.floor(Math.random() * 9) - 4;
    const ay = nestY + Math.floor(Math.random() * 9) - 4;
    if (world.inBounds(ax, ay)) {
      world.ants.push(new Ant(ax, ay, nestX, nestY));
    }
  }
}

spawnDefaultScene();

const ui = new UI(world, renderer, canvas, spawnDefaultScene);

let lastTime = 0;
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;

function gameLoop(timestamp) {
  const delta = timestamp - lastTime;

  if (delta >= FRAME_TIME) {
    lastTime = timestamp - (delta % FRAME_TIME);

    if (!ui.paused) {
      for (let i = 0; i < ui.speed; i++) {
        world.tick();
      }
    }

    renderer.render();
    ui.updateInfo();
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
