import { Cell, CellNames } from './world.js';
import { Ant } from './ant.js';

export class UI {
  constructor(world, renderer, canvas, resetScene) {
    this.world = world;
    this.renderer = renderer;
    this.canvas = canvas;
    this.resetScene = resetScene;
    this.selectedTool = Cell.DIRT;
    this.brushSize = 2;
    this.painting = false;
    this.erasing = false;
    this.speed = 1;
    this.paused = false;
    this.lastPaintX = -1;
    this.lastPaintY = -1;

    this.buildToolbar();
    this.bindCanvasEvents();
    this.updateInfo();
  }

  buildToolbar() {
    const toolbar = document.getElementById('toolbar');

    const tools = [
      { type: Cell.DIRT, label: 'Erase', color: '#8B7348', key: '0' },
      { type: Cell.WALL, label: 'Rock', color: '#5a5550', key: '1' },
      { type: Cell.WATER, label: 'Water', color: '#2864aa', key: '2' },
      { type: Cell.FOOD, label: 'Food', color: '#2ecc71', key: '3' },
      { type: Cell.NEST, label: 'Nest', color: '#8c4630', key: '4' },
      { type: 'ant', label: 'Ant', color: '#1e140f', key: '5' },
    ];

    const toolGroup = document.createElement('div');
    toolGroup.className = 'tool-group';

    const toolLabel = document.createElement('span');
    toolLabel.className = 'group-label';
    toolLabel.textContent = 'Materials';
    toolGroup.appendChild(toolLabel);

    tools.forEach(tool => {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      if (tool.type === this.selectedTool) btn.classList.add('active');
      btn.dataset.tool = tool.type;

      const swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = tool.color;
      if (tool.type === Cell.EMPTY) {
        swatch.style.border = '1px solid #555';
      }

      btn.appendChild(swatch);
      btn.appendChild(document.createTextNode(` ${tool.label}`));

      const keyHint = document.createElement('span');
      keyHint.className = 'key-hint';
      keyHint.textContent = tool.key;
      btn.appendChild(keyHint);

      btn.addEventListener('click', () => this.selectTool(tool.type));
      toolGroup.appendChild(btn);
    });

    toolbar.appendChild(toolGroup);

    const brushGroup = document.createElement('div');
    brushGroup.className = 'tool-group';
    const brushLabel = document.createElement('span');
    brushLabel.className = 'group-label';
    brushLabel.textContent = 'Brush';
    brushGroup.appendChild(brushLabel);

    const brushSlider = document.createElement('input');
    brushSlider.type = 'range';
    brushSlider.min = '1';
    brushSlider.max = '8';
    brushSlider.value = String(this.brushSize);
    brushSlider.className = 'brush-slider';
    brushSlider.addEventListener('input', (e) => {
      this.brushSize = parseInt(e.target.value);
    });
    brushGroup.appendChild(brushSlider);
    toolbar.appendChild(brushGroup);

    const controlGroup = document.createElement('div');
    controlGroup.className = 'tool-group';
    const controlLabel = document.createElement('span');
    controlLabel.className = 'group-label';
    controlLabel.textContent = 'Simulation';
    controlGroup.appendChild(controlLabel);

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'tool-btn control-btn';
    pauseBtn.id = 'pause-btn';
    pauseBtn.textContent = 'Pause';
    pauseBtn.addEventListener('click', () => {
      this.paused = !this.paused;
      pauseBtn.textContent = this.paused ? 'Play' : 'Pause';
      pauseBtn.classList.toggle('active', this.paused);
    });
    controlGroup.appendChild(pauseBtn);

    const speeds = [
      { label: '1x', value: 1 },
      { label: '3x', value: 3 },
      { label: '10x', value: 10 },
    ];
    speeds.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'tool-btn control-btn';
      if (s.value === this.speed) btn.classList.add('active');
      btn.textContent = s.label;
      btn.dataset.speed = s.value;
      btn.addEventListener('click', () => {
        this.speed = s.value;
        controlGroup.querySelectorAll('[data-speed]').forEach(b =>
          b.classList.toggle('active', parseInt(b.dataset.speed) === s.value)
        );
      });
      controlGroup.appendChild(btn);
    });

    toolbar.appendChild(controlGroup);

    const viewGroup = document.createElement('div');
    viewGroup.className = 'tool-group';
    const viewLabel = document.createElement('span');
    viewLabel.className = 'group-label';
    viewLabel.textContent = 'View';
    viewGroup.appendChild(viewLabel);

    const pheroBtn = document.createElement('button');
    pheroBtn.className = 'tool-btn control-btn';
    pheroBtn.textContent = 'Trails';
    pheroBtn.addEventListener('click', () => {
      if (!this.renderer.showPheromones) {
        this.renderer.showPheromones = true;
        this.renderer.pheromoneType = 'food';
        pheroBtn.textContent = 'Trails: Food';
        pheroBtn.classList.add('active');
      } else if (this.renderer.pheromoneType === 'food') {
        this.renderer.pheromoneType = 'home';
        pheroBtn.textContent = 'Trails: Home';
      } else {
        this.renderer.showPheromones = false;
        pheroBtn.textContent = 'Trails';
        pheroBtn.classList.remove('active');
      }
    });
    viewGroup.appendChild(pheroBtn);

    toolbar.appendChild(viewGroup);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'tool-group';
    const actionLabel = document.createElement('span');
    actionLabel.className = 'group-label';
    actionLabel.textContent = 'Actions';
    actionGroup.appendChild(actionLabel);

    const resetBtn = document.createElement('button');
    resetBtn.className = 'tool-btn control-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      this.world.clear();
      this.resetScene();
    });
    actionGroup.appendChild(resetBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'tool-btn control-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      this.world.clear();
    });
    actionGroup.appendChild(clearBtn);

    toolbar.appendChild(actionGroup);

    document.addEventListener('keydown', (e) => {
      const key = e.key;
      const tool = tools.find(t => t.key === key);
      if (tool) {
        this.selectTool(tool.type);
      }
      if (key === ' ') {
        e.preventDefault();
        this.paused = !this.paused;
        pauseBtn.textContent = this.paused ? 'Play' : 'Pause';
        pauseBtn.classList.toggle('active', this.paused);
      }
    });
  }

  selectTool(type) {
    this.selectedTool = type;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === String(type));
    });
  }

  canvasToGrid(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const x = Math.floor(px / this.renderer.cellSize);
    const y = Math.floor(py / this.renderer.cellSize);
    return { x, y };
  }

  paint(gx, gy) {
    const r = this.brushSize;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (!this.world.inBounds(x, y)) continue;

        if (this.selectedTool === 'ant') {
          let nearestNestX = -1, nearestNestY = -1, nearestDist = Infinity;
          for (let ny = 0; ny < this.world.height; ny++) {
            for (let nx = 0; nx < this.world.width; nx++) {
              if (this.world.get(nx, ny) === Cell.NEST) {
                const d = Math.abs(nx - x) + Math.abs(ny - y);
                if (d < nearestDist) {
                  nearestDist = d;
                  nearestNestX = nx;
                  nearestNestY = ny;
                }
              }
            }
          }
          if (nearestNestX >= 0 && this.world.isPassable(x, y)) {
            const ant = new Ant(x, y, nearestNestX, nearestNestY);
            this.world.ants.push(ant);
          }
        } else {
          if (this.selectedTool === Cell.NEST) {
            this.world.set(x, y, Cell.NEST);
            for (const ant of this.world.ants) {
              if (ant.nestX === -1) {
                ant.nestX = x;
                ant.nestY = y;
              }
            }
          } else {
            this.world.set(x, y, this.selectedTool);
          }
        }
      }
    }
  }

  paintLine(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.paint(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  bindCanvasEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.painting = true;
      const { x, y } = this.canvasToGrid(e);
      this.lastPaintX = x;
      this.lastPaintY = y;
      this.paint(x, y);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.painting) return;
      const { x, y } = this.canvasToGrid(e);
      if (this.lastPaintX >= 0) {
        this.paintLine(this.lastPaintX, this.lastPaintY, x, y);
      } else {
        this.paint(x, y);
      }
      this.lastPaintX = x;
      this.lastPaintY = y;
    });

    window.addEventListener('mouseup', () => {
      this.painting = false;
      this.lastPaintX = -1;
      this.lastPaintY = -1;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  updateInfo() {
    const info = document.getElementById('info');
    const alive = this.world.ants.filter(a => a.alive).length;
    const carrying = this.world.ants.filter(a => a.alive && a.carrying).length;
    info.textContent = `Ants: ${alive} | Carrying: ${carrying} | Food stored: ${this.world.nestFoodStore.toFixed(1)} | Tick: ${this.world.tickCount}`;
  }
}
