import './style.css';
import { SimulationEngine } from './sim/SimulationEngine';
import { PixiRenderer } from './render/PixiRenderer';
import { UI } from './ui/UI';

const GRID_W = 200;
const GRID_H = 150;
const CELL_SIZE = 4;

async function main(): Promise<void> {
  const engine = new SimulationEngine(GRID_W, GRID_H, (Date.now() >>> 0) || 1);
  engine.buildDefaultScene();

  const renderer = new PixiRenderer();
  const stage = document.getElementById('stage')!;
  await renderer.init(stage, engine.world, CELL_SIZE);

  const ui = new UI(engine, renderer);

  // Dev handle for debugging / automated verification in the console.
  (window as unknown as { antfarm: unknown }).antfarm = { engine, renderer, ui };

  renderer.app.ticker.add(() => {
    if (!ui.paused) {
      for (let i = 0; i < ui.speed; i++) engine.tick();
    }
    renderer.render(engine);
    ui.updateInfo();
  });
}

main().catch((err) => {
  console.error('AntFarm failed to start:', err);
});
