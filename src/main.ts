import './style.css';
import { SimulationEngine } from './sim/SimulationEngine';
import { SimConfig } from './sim/constants';
import { PixiRenderer } from './render/PixiRenderer';
import { fitCanvasToStage } from './render/ViewportFit';
import { clearSave, loadWorld, readSave, summarize } from './save/SaveStore';
import { UI } from './ui/UI';
import { askStartChoice } from './ui/StartChooser';

const GRID_W = 200;
const GRID_H = 150;
const CELL_SIZE = 4;

async function main(): Promise<void> {
  const engine = new SimulationEngine(GRID_W, GRID_H, (Date.now() >>> 0) || 1);

  // A world left running for hours should still be there. Ask before replacing it.
  const saved = readSave();
  let resumed = false;
  if (saved) {
    const choice = await askStartChoice(summarize(saved));
    if (choice === 'continue') resumed = loadWorld(engine, saved);
    else clearSave();
  }
  if (!resumed) engine.buildDefaultScene();

  const renderer = new PixiRenderer();
  const stage = document.getElementById('stage')!;
  await renderer.init(stage, engine.world, CELL_SIZE);
  fitCanvasToStage(stage, renderer.app.canvas);

  const ui = new UI(engine, renderer);

  // Dev handle for debugging / automated verification in the console.
  (window as unknown as { antfarm: unknown }).antfarm = { engine, renderer, ui };

  const autoSaveEvery = SimConfig.save.autoSaveIntervalTicks;
  let lastAutoSave = engine.world.tickCount;

  renderer.app.ticker.add(() => {
    if (!ui.paused) {
      for (let i = 0; i < ui.speed; i++) engine.tick();
    }
    renderer.render(engine);
    ui.updateInfo();

    // Tick counts can jump by the speed multiplier, so compare elapsed ticks
    // rather than testing for an exact multiple.
    const tick = engine.world.tickCount;
    if (tick < lastAutoSave || tick - lastAutoSave >= autoSaveEvery) {
      lastAutoSave = tick;
      ui.autoSave();
    }
  });
}

main().catch((err) => {
  console.error('AntFarm failed to start:', err);
});
