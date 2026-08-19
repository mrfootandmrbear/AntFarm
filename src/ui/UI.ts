import { Cell, CellType } from '../sim/constants';
import type { SimulationEngine } from '../sim/SimulationEngine';
import type { PixiRenderer } from '../render/PixiRenderer';

type ToolKind = 'cell' | 'ant';

interface Tool {
  id: string;
  label: string;
  color: string;
  key: string;
  category: string;
  kind: ToolKind;
  cell?: CellType;
}

const TOOLS: Tool[] = [
  { id: 'erase', label: 'Dirt', color: '#8b7348', key: '0', category: 'Terrain', kind: 'cell', cell: Cell.DIRT },
  { id: 'rock', label: 'Rock', color: '#5a5550', key: '1', category: 'Terrain', kind: 'cell', cell: Cell.WALL },
  { id: 'water', label: 'Water', color: '#2864aa', key: '2', category: 'Water', kind: 'cell', cell: Cell.WATER },
  { id: 'food', label: 'Food', color: '#2ecc71', key: '3', category: 'Plants & Food', kind: 'cell', cell: Cell.FOOD },
  { id: 'nest', label: 'Nest', color: '#8c4630', key: '4', category: 'Structures', kind: 'cell', cell: Cell.NEST },
  { id: 'ant', label: 'Ant', color: '#1e140f', key: '5', category: 'Insects', kind: 'ant' },
];

const CATEGORY_ORDER = ['Terrain', 'Water', 'Plants & Food', 'Structures', 'Insects'];

export class UI {
  private engine: SimulationEngine;
  private renderer: PixiRenderer;
  private canvas: HTMLCanvasElement;

  paused = false;
  speed = 1;
  brushSize = 2;

  private selected: Tool = TOOLS[3]; // Food, matches original default feel
  private painting = false;
  private lastPaintX = -1;
  private lastPaintY = -1;

  private pauseBtn!: HTMLButtonElement;
  private readoutEl!: HTMLElement;

  constructor(engine: SimulationEngine, renderer: PixiRenderer) {
    this.engine = engine;
    this.renderer = renderer;
    this.canvas = renderer.app.canvas;
    this.selected = TOOLS.find((t) => t.id === 'erase')!;

    this.buildPalette();
    this.buildTransport();
    this.buildReadout();
    this.buildStatusBar();
    this.bindCanvas();
    this.bindKeyboard();
    this.updateInfo();
  }

  // ---------- Palette ----------
  private buildPalette(): void {
    const palette = document.getElementById('palette')!;
    for (const category of CATEGORY_ORDER) {
      const tools = TOOLS.filter((t) => t.category === category);
      if (tools.length === 0) continue;

      const group = el('div', 'group');
      group.appendChild(el('div', 'group-label', category));
      const row = el('div', 'group-tools');

      for (const tool of tools) {
        const btn = document.createElement('button');
        btn.className = 'btn tool-btn';
        btn.dataset.tool = tool.id;
        if (tool.id === this.selected.id) btn.classList.add('active');

        const swatch = el('span', 'swatch');
        swatch.style.backgroundColor = tool.color;
        btn.appendChild(swatch);
        btn.appendChild(document.createTextNode(tool.label));
        const hint = el('span', 'key-hint', tool.key);
        btn.appendChild(hint);

        btn.addEventListener('click', () => this.selectTool(tool));
        row.appendChild(btn);
      }
      group.appendChild(row);
      palette.appendChild(group);
    }

    // Brush size.
    const brushGroup = el('div', 'group');
    brushGroup.appendChild(el('div', 'group-label', 'Brush'));
    const brushRow = el('div', 'group-tools');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '8';
    slider.value = String(this.brushSize);
    slider.className = 'brush-slider';
    const value = el('span', 'brush-value', String(this.brushSize));
    slider.addEventListener('input', () => {
      this.brushSize = parseInt(slider.value, 10);
      value.textContent = String(this.brushSize);
    });
    brushRow.appendChild(slider);
    brushRow.appendChild(value);
    brushGroup.appendChild(brushRow);
    palette.appendChild(brushGroup);
  }

  private selectTool(tool: Tool): void {
    this.selected = tool;
    document.querySelectorAll<HTMLElement>('.tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool.id);
    });
  }

  // ---------- Transport ----------
  private buildTransport(): void {
    const transport = document.getElementById('transport')!;

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'btn';
    this.pauseBtn.textContent = '⏸ Pause';
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    transport.appendChild(this.pauseBtn);

    const speeds = [
      { label: '1×', value: 1 },
      { label: '3×', value: 3 },
      { label: '10×', value: 10 },
    ];
    for (const s of speeds) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.dataset.speed = String(s.value);
      btn.textContent = s.label;
      if (s.value === this.speed) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.speed = s.value;
        transport.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) =>
          b.classList.toggle('active', parseInt(b.dataset.speed!, 10) === s.value),
        );
      });
      transport.appendChild(btn);
    }
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.pauseBtn.textContent = this.paused ? '▶ Play' : '⏸ Pause';
    this.pauseBtn.classList.toggle('active', this.paused);
  }

  // ---------- Readout (top-right stats) ----------
  private buildReadout(): void {
    this.readoutEl = document.getElementById('readout')!;
    this.readoutEl.innerHTML = '';
    for (const label of ['Ants', 'Carrying', 'Food', 'Tick']) {
      const stat = el('div', 'stat');
      stat.appendChild(el('span', 'stat-label', label));
      const value = el('span', 'stat-value', '0');
      value.dataset.stat = label;
      stat.appendChild(value);
      this.readoutEl.appendChild(stat);
    }
  }

  // ---------- Status bar (view + actions) ----------
  private buildStatusBar(): void {
    const bar = document.getElementById('statusbar')!;

    const viewGroup = el('div', 'bar-group');
    viewGroup.appendChild(el('div', 'group-label', 'Pheromones'));
    const trailBtn = document.createElement('button');
    trailBtn.className = 'btn';
    trailBtn.textContent = 'Trails: Off';
    trailBtn.addEventListener('click', () => {
      const r = this.renderer;
      if (!r.showPheromones) {
        r.showPheromones = true;
        r.pheromoneType = 'food';
        trailBtn.textContent = 'Trails: Food';
        trailBtn.classList.add('active');
      } else if (r.pheromoneType === 'food') {
        r.pheromoneType = 'home';
        trailBtn.textContent = 'Trails: Home';
      } else {
        r.showPheromones = false;
        trailBtn.textContent = 'Trails: Off';
        trailBtn.classList.remove('active');
      }
    });
    viewGroup.appendChild(trailBtn);
    bar.appendChild(viewGroup);

    const actionGroup = el('div', 'bar-group');
    actionGroup.appendChild(el('div', 'group-label', 'Actions'));

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => this.engine.reset());
    actionGroup.appendChild(resetBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => this.engine.clear());
    actionGroup.appendChild(clearBtn);

    bar.appendChild(actionGroup);
  }

  // ---------- Painting ----------
  private bindCanvas(): void {
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

  private canvasToGrid(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    return {
      x: Math.floor(px / this.renderer.cellSize),
      y: Math.floor(py / this.renderer.cellSize),
    };
  }

  private paint(gx: number, gy: number): void {
    const r = this.brushSize;
    const world = this.engine.world;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (!world.inBounds(x, y)) continue;

        if (this.selected.kind === 'ant') {
          this.engine.spawnAntAt(x, y);
        } else {
          world.set(x, y, this.selected.cell!);
        }
      }
    }
  }

  private paintLine(x0: number, y0: number, x1: number, y1: number): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    while (true) {
      this.paint(cx, cy);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }

  // ---------- Keyboard ----------
  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      const tool = TOOLS.find((t) => t.key === e.key);
      if (tool) {
        this.selectTool(tool);
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        this.togglePause();
      }
    });
  }

  // ---------- Stats ----------
  updateInfo(): void {
    const alive = this.engine.aliveCount();
    const carrying = this.engine.carryingCount();
    this.setStat('Ants', String(alive));
    this.setStat('Carrying', String(carrying));
    this.setStat('Food', this.engine.world.nestFoodStore.toFixed(1));
    this.setStat('Tick', String(this.engine.world.tickCount));
  }

  private setStat(label: string, value: string): void {
    const el = this.readoutEl.querySelector<HTMLElement>(`[data-stat="${label}"]`);
    if (el && el.textContent !== value) el.textContent = value;
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
